using VarAI.Server.Explanations;

namespace VarAI.Server.Narration;

public sealed record NarrationModelResult(string Content, ChatUsage? Usage, string? ReportedModel);

/// <summary>The only thing the narrator needs from a model, so the service can be tested without HTTP.</summary>
public interface INarrationModel
{
    string Deployment { get; }

    Task<NarrationModelResult> GenerateAsync(NarrationFacts facts, NarrationLanguage language, CancellationToken cancellationToken);
}

public sealed class AzureOpenAiNarrationModel(AzureOpenAiChatClient chat, string? reasoningEffort = null) : INarrationModel, IDisposable
{
    // Generous enough for Tamil written as \uXXXX escapes; the response size and token caps remain the real bounds.
    public const int MaximumContentCharacters = 16_000;

    public string Deployment => chat.DeploymentName ?? "unknown";

    public async Task<NarrationModelResult> GenerateAsync(
        NarrationFacts facts, NarrationLanguage language, CancellationToken cancellationToken)
    {
        var completion = await chat.CompleteAsync(
            NarrationPrompt.Build(facts, language), MaximumContentCharacters, cancellationToken, reasoningEffort);
        return new NarrationModelResult(completion.Content, completion.Usage, completion.Model);
    }

    public void Dispose() => chat.Dispose();
}
