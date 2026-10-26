using System.Net;
using System.Text;
using System.Text.Json;

namespace VarAI.Server.Explanations;

public enum AzureOpenAiChatFailure
{
    NotConfigured,
    Unavailable,
    InvalidOutput,
}

/// <summary>A sanitised transport failure: it never carries a response body, header, token or key.</summary>
public sealed class AzureOpenAiChatException(AzureOpenAiChatFailure failure)
    : Exception("The Azure OpenAI chat request did not produce a usable response.")
{
    public AzureOpenAiChatFailure Failure { get; } = failure;
}

public sealed record ChatMessage(string Role, string Content);

public sealed record ChatUsage(int PromptTokens, int CompletionTokens, int ReasoningTokens, int CachedPromptTokens);

public sealed record ChatCompletion(string Content, ChatUsage? Usage, string? Model);

/// <summary>
/// Hardened Azure OpenAI v1 chat-completions transport shared by the offside explainer and the match narrator:
/// no redirects, no cookies, no retries, bounded response size, one strict choice that finished normally.
/// </summary>
public sealed class AzureOpenAiChatClient : IDisposable
{
    public const int MaximumResponseBytes = 131_072;
    private readonly AzureOpenAiConfiguration configuration;
    private readonly IAzureOpenAiAuthorizer authorizer;
    private readonly HttpClient client;

    public AzureOpenAiChatClient(
        AzureOpenAiConfiguration configuration, HttpMessageHandler handler, IAzureOpenAiAuthorizer authorizer)
    {
        this.configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        this.authorizer = authorizer ?? throw new ArgumentNullException(nameof(authorizer));
        ArgumentNullException.ThrowIfNull(handler);
        ConfigureTransport(handler);
        client = new HttpClient(handler, disposeHandler: true) { Timeout = Timeout.InfiniteTimeSpan };
    }

    public bool IsConfigured => configuration.TryGetRequestUri(out _);

    public string? DeploymentName => configuration.DeploymentName;

    public static HttpClientHandler CreateHttpMessageHandler() => new()
    {
        AllowAutoRedirect = false,
        UseCookies = false
    };

    private static void ConfigureTransport(HttpMessageHandler handler)
    {
        if (handler is DelegatingHandler delegating)
        {
            ArgumentNullException.ThrowIfNull(delegating.InnerHandler);
            ConfigureTransport(delegating.InnerHandler);
        }
        else if (handler is HttpClientHandler httpHandler)
        {
            httpHandler.AllowAutoRedirect = false;
            httpHandler.UseCookies = false;
        }
        else if (handler is SocketsHttpHandler socketsHandler)
        {
            socketsHandler.AllowAutoRedirect = false;
            socketsHandler.UseCookies = false;
        }
    }

    /// <param name="reasoningEffort">Optional `reasoning_effort` sent to the model, for example "low". Null sends nothing and leaves the model's default.</param>
    public async Task<ChatCompletion> CompleteAsync(
        IReadOnlyList<ChatMessage> messages, int maximumContentCharacters, CancellationToken cancellationToken,
        string? reasoningEffort = null)
    {
        ArgumentNullException.ThrowIfNull(messages);
        cancellationToken.ThrowIfCancellationRequested();
        if (!configuration.TryGetRequestUri(out var uri))
        {
            throw new AzureOpenAiChatException(AzureOpenAiChatFailure.NotConfigured);
        }
        try
        {
            var payload = new Dictionary<string, object?>
            {
                ["model"] = configuration.DeploymentName,
                ["messages"] = messages.Select(message => new { role = message.Role, content = message.Content }).ToArray(),
                ["n"] = 1,
                ["stream"] = false,
                ["store"] = false,
                ["max_completion_tokens"] = configuration.MaximumCompletionTokens,
            };
            if (reasoningEffort is not null)
            {
                payload["reasoning_effort"] = reasoningEffort;
            }

            var body = JsonSerializer.Serialize(payload);
            using var request = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
            await authorizer.AuthorizeAsync(request, cancellationToken);
            request.Headers.Accept.ParseAdd("application/json");
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new AzureOpenAiChatException(AzureOpenAiChatFailure.Unavailable);
            }
            Require(response.StatusCode == HttpStatusCode.OK &&
                string.Equals(response.Content.Headers.ContentType?.MediaType, "application/json", StringComparison.OrdinalIgnoreCase));
            Require(response.Content.Headers.ContentLength is null or <= MaximumResponseBytes);
            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var bytes = new MemoryStream();
            var buffer = new byte[4_096];
            int read;
            while ((read = await stream.ReadAsync(buffer, cancellationToken)) != 0)
            {
                Require(bytes.Length + read <= MaximumResponseBytes);
                bytes.Write(buffer, 0, read);
            }
            cancellationToken.ThrowIfCancellationRequested();
            return ReadCompletion(bytes.ToArray(), maximumContentCharacters);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw new OperationCanceledException(cancellationToken);
        }
        catch (AzureOpenAiChatException)
        {
            throw;
        }
        catch (Exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            throw new AzureOpenAiChatException(AzureOpenAiChatFailure.Unavailable);
        }
    }

    private static ChatCompletion ReadCompletion(byte[] bytes, int maximumContentCharacters)
    {
        try
        {
            using var document = JsonDocument.Parse(bytes);
            var root = document.RootElement;
            UniqueProperties(root);
            Require(root.ValueKind == JsonValueKind.Object &&
                (!root.TryGetProperty("error", out var error) || error.ValueKind == JsonValueKind.Null));
            var choices = root.GetProperty("choices");
            Require(choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() == 1);
            var choice = choices[0];
            Require(choice.GetProperty("index").GetInt32() == 0 &&
                choice.GetProperty("finish_reason").GetString() == "stop");
            var message = choice.GetProperty("message");
            Require(message.GetProperty("role").GetString() == "assistant" &&
                (!message.TryGetProperty("refusal", out var refusal) || refusal.ValueKind == JsonValueKind.Null) &&
                (!message.TryGetProperty("function_call", out var function) || function.ValueKind == JsonValueKind.Null));
            if (message.TryGetProperty("tool_calls", out var tools))
            {
                Require(tools.ValueKind == JsonValueKind.Null ||
                    (tools.ValueKind == JsonValueKind.Array && tools.GetArrayLength() == 0));
            }
            var content = message.GetProperty("content").GetString();
            Require(!string.IsNullOrWhiteSpace(content) && content.Length <= maximumContentCharacters);
            var model = root.TryGetProperty("model", out var modelElement) && modelElement.ValueKind == JsonValueKind.String
                ? modelElement.GetString()
                : null;
            return new ChatCompletion(content!, ReadUsage(root), model);
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or
            System.Collections.Generic.KeyNotFoundException or FormatException)
        {
            throw new AzureOpenAiChatException(AzureOpenAiChatFailure.InvalidOutput);
        }
    }

    /// <summary>Usage is advisory (cost and telemetry), so a missing or odd usage block never fails the call.</summary>
    private static ChatUsage? ReadUsage(JsonElement root)
    {
        if (!root.TryGetProperty("usage", out var usage) || usage.ValueKind != JsonValueKind.Object ||
            Count(usage, "prompt_tokens") is not { } prompt || Count(usage, "completion_tokens") is not { } completion)
        {
            return null;
        }
        var reasoning = usage.TryGetProperty("completion_tokens_details", out var completionDetails) &&
            completionDetails.ValueKind == JsonValueKind.Object ? Count(completionDetails, "reasoning_tokens") ?? 0 : 0;
        var cached = usage.TryGetProperty("prompt_tokens_details", out var promptDetails) &&
            promptDetails.ValueKind == JsonValueKind.Object ? Count(promptDetails, "cached_tokens") ?? 0 : 0;
        return new ChatUsage(prompt, completion, reasoning, cached);
    }

    private static int? Count(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number &&
        value.TryGetInt32(out var count) && count >= 0 ? count : null;

    private static void UniqueProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                Require(names.Add(property.Name));
                Require(property.Name != "filtered" || property.Value.ValueKind != JsonValueKind.True);
                UniqueProperties(property.Value);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                UniqueProperties(item);
            }
        }
    }

    private static void Require(bool condition)
    {
        if (!condition)
        {
            throw new AzureOpenAiChatException(AzureOpenAiChatFailure.InvalidOutput);
        }
    }

    public void Dispose() => client.Dispose();
}
