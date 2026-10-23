using System.Net.Http.Headers;
using Azure.Core;
using Azure.Identity;

namespace VarAI.Server.Explanations;

/// <summary>Adds the credential to an outgoing Azure OpenAI request. Implementations must never log the secret they add.</summary>
public interface IAzureOpenAiAuthorizer
{
    ValueTask AuthorizeAsync(HttpRequestMessage request, CancellationToken cancellationToken);
}

internal sealed class ApiKeyAuthorizer(string? apiKey) : IAzureOpenAiAuthorizer
{
    public ValueTask AuthorizeAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        request.Headers.Add("api-key", apiKey);
        return ValueTask.CompletedTask;
    }
}

/// <summary>
/// Sends a Microsoft Entra bearer token. Tokens are cached and refreshed shortly before they expire so a call does not
/// start an `az` process or a metadata request every time.
/// </summary>
public sealed class BearerTokenAuthorizer(TokenCredential credential, string scope, TimeProvider timeProvider)
    : IAzureOpenAiAuthorizer, IDisposable
{
    private static readonly TimeSpan RefreshMargin = TimeSpan.FromMinutes(5);
    private readonly TokenCredential credential = credential ?? throw new ArgumentNullException(nameof(credential));
    private readonly string scope = string.IsNullOrWhiteSpace(scope) ? throw new ArgumentException("A scope is required.", nameof(scope)) : scope;
    private readonly TimeProvider timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
    private readonly SemaphoreSlim gate = new(1, 1);
    private volatile CachedToken? cached;

    public async ValueTask AuthorizeAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var token = await GetTokenAsync(cancellationToken);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    private async ValueTask<string> GetTokenAsync(CancellationToken cancellationToken)
    {
        if (cached is { } fresh && timeProvider.GetUtcNow() < fresh.RefreshAt)
        {
            return fresh.Value;
        }

        await gate.WaitAsync(cancellationToken);
        try
        {
            if (cached is { } current && timeProvider.GetUtcNow() < current.RefreshAt)
            {
                return current.Value;
            }

            var token = await credential.GetTokenAsync(new TokenRequestContext([scope]), cancellationToken);
            var now = timeProvider.GetUtcNow();
            var lifetime = token.ExpiresOn - now;
            var refreshAt = lifetime > RefreshMargin * 2 ? token.ExpiresOn - RefreshMargin : now + (lifetime / 2);
            cached = new CachedToken(token.Token, refreshAt);
            return token.Token;
        }
        finally
        {
            gate.Release();
        }
    }

    public void Dispose() => gate.Dispose();

    private sealed record CachedToken(string Value, DateTimeOffset RefreshAt);
}

public static class AzureOpenAiAuthorizers
{
    public static IAzureOpenAiAuthorizer Create(AzureOpenAiConfiguration configuration, TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        return configuration.Credential switch
        {
            AzureOpenAiCredentialKind.ManagedIdentity => new BearerTokenAuthorizer(
                new ManagedIdentityCredential(configuration.ManagedIdentityClientId is { } clientId
                    ? ManagedIdentityId.FromUserAssignedClientId(clientId)
                    : ManagedIdentityId.SystemAssigned),
                configuration.EffectiveTokenScope, timeProvider),
            AzureOpenAiCredentialKind.AzureCli => new BearerTokenAuthorizer(
                new AzureCliCredential(), configuration.EffectiveTokenScope, timeProvider),
            _ => new ApiKeyAuthorizer(configuration.ApiKey),
        };
    }
}
