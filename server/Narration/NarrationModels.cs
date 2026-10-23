namespace VarAI.Server.Narration;

public static class NarrationSources
{
    public const string Ai = "AI";
    public const string Fallback = "FALLBACK";
    public const string Operator = "OPERATOR";
}

public static class FallbackReasons
{
    public const string Disabled = "DISABLED";
    public const string NotConfigured = "NOT_CONFIGURED";
    public const string Unavailable = "UNAVAILABLE";
    public const string Timeout = "TIMEOUT";
    public const string InvalidOutput = "INVALID_OUTPUT";
    public const string VerifierFailed = "VERIFIER_FAILED";
    public const string BudgetExhausted = "BUDGET_EXHAUSTED";
    public const string Cooldown = "COOLDOWN";
    public const string NotReady = "NOT_READY";
}

public sealed record NarrationText(string Headline, string Fan, string Analyst, string Why);

public sealed record NarrationFailure(string Check, string Field, string Detail);

/// <summary>Result of the mechanical checks. A pass means no check found a problem; it does not prove the text is true.</summary>
public sealed record NarrationVerdict(bool Passed, IReadOnlyList<string> PassedChecks, IReadOnlyList<NarrationFailure> Failures);

public sealed record NarrationUsage(
    string Deployment, string? ReportedModel, int PromptTokens, int CompletionTokens, int ReasoningTokens,
    int CachedPromptTokens, int LatencyMs);

/// <summary>
/// One cue narrated in one requested language. Language is what was actually delivered: a Tamil request that falls back
/// is delivered in English and says so.
/// </summary>
public sealed record CueNarration(
    string CueId,
    string RequestedLanguage,
    string Language,
    string Source,
    string? FallbackReason,
    NarrationText Text,
    NarrationVerdict? Verification,
    NarrationUsage? Usage)
{
    public PublicNarration ToPublic() => new(Source, RequestedLanguage, Language, FallbackReason, Text);
}

/// <summary>What an audience may see: never token counts, verifier internals or operator notes.</summary>
public sealed record PublicNarration(
    string Source, string RequestedLanguage, string Language, string? FallbackReason, NarrationText Text);

public sealed record NarrationStatus(bool Enabled, string? Deployment, int CallsUsed, int CallLimit, bool CoolingDown);
