namespace VarAI.Server.Narration;

/// <summary>Limits that bound model spend and protect a public endpoint from being used to generate paid calls.</summary>
public sealed class NarrationOptions
{
    /// <summary>When false the narrator never calls a model and always returns the deterministic English text.</summary>
    public bool Enabled { get; init; }

    /// <summary>Model calls this process may start in its lifetime. One match needs at most 2 per cue and language.</summary>
    public int MaxModelCalls { get; init; } = 160;

    public int MaxConcurrency { get; init; } = 2;

    public TimeSpan CallTimeout { get; init; } = TimeSpan.FromSeconds(30);

    /// <summary>Longest a request may wait for a free model slot before falling back.</summary>
    public TimeSpan QueueTimeout { get; init; } = TimeSpan.FromSeconds(30);

    /// <summary>Consecutive transport failures that start a cool-down in which no model call is made.</summary>
    public int FailureThreshold { get; init; } = 3;

    public TimeSpan Cooldown { get; init; } = TimeSpan.FromSeconds(60);

    /// <summary>How long a failed narration is kept before it may be attempted again.</summary>
    public TimeSpan RetryAfter { get; init; } = TimeSpan.FromSeconds(60);

    /// <summary>Model calls allowed for one cue in one language, including retries.</summary>
    public int MaxAttemptsPerNarration { get; init; } = 2;

    /// <summary>
    /// Optional `reasoning_effort` sent with every narration call (none, low, medium, high or xhigh; the model decides which it
    /// supports). Empty sends nothing. Lower effort answers faster and uses fewer tokens; an unsupported value makes every call
    /// fail, so the narrator falls back to deterministic text.
    /// </summary>
    public string? ReasoningEffort { get; init; }

    private static readonly string[] ReasoningEfforts = ["none", "minimal", "low", "medium", "high", "xhigh"];

    /// <summary>The effort to send: trimmed and lower-case, or null when none is configured.</summary>
    public string? NormalisedReasoningEffort =>
        string.IsNullOrWhiteSpace(ReasoningEffort) ? null : ReasoningEffort.Trim().ToLowerInvariant();

    public void Validate()
    {
        if (NormalisedReasoningEffort is { } effort && !ReasoningEfforts.Contains(effort))
        {
            throw new ArgumentOutOfRangeException(
                nameof(ReasoningEffort), ReasoningEffort, "ReasoningEffort must be none, minimal, low, medium, high or xhigh.");
        }

        ArgumentOutOfRangeException.ThrowIfLessThan(MaxModelCalls, 0);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(MaxModelCalls, 10_000);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaxConcurrency, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(MaxConcurrency, 16);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaxAttemptsPerNarration, 1);
        ArgumentOutOfRangeException.ThrowIfLessThan(FailureThreshold, 1);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(CallTimeout, TimeSpan.Zero);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(QueueTimeout, TimeSpan.Zero);
        ArgumentOutOfRangeException.ThrowIfLessThan(Cooldown, TimeSpan.Zero);
        ArgumentOutOfRangeException.ThrowIfLessThan(RetryAfter, TimeSpan.Zero);
    }
}
