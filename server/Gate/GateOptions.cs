namespace VarAI.Server.Gate;

/// <summary>Settings of the operator approval gate. Defaults are the demo values; all are validated at startup.</summary>
public sealed class GateOptions
{
    /// <summary>
    /// Real seconds an operator has to decide a proposal. It is also the program delay: cues air this long after they are
    /// proposed, so an undecided cue is held (never auto-approved) at exactly the moment it would have aired.
    /// </summary>
    public int SlaSeconds { get; init; } = 20;

    /// <summary>The 1x-10x cap exists because a real-time SLA cannot be met when match time runs much faster.</summary>
    public double MinimumSpeed { get; init; } = 1.0;

    public double MaximumSpeed { get; init; } = 10.0;

    public int MaxSessions { get; init; } = 16;

    /// <summary>Extra life after the real-time end of the match.</summary>
    public TimeSpan SessionGrace { get; init; } = TimeSpan.FromMinutes(5);

    /// <summary>How long before a proposal is due that narration generation starts.</summary>
    public TimeSpan PrefetchLead { get; init; } = TimeSpan.FromSeconds(40);

    /// <summary>Longest a proposal waits for narration before it is created with the deterministic fallback.</summary>
    public TimeSpan NarrationWait { get; init; } = TimeSpan.FromSeconds(8);

    public TimeSpan TickInterval { get; init; } = TimeSpan.FromMilliseconds(250);

    public TimeSpan Heartbeat { get; init; } = TimeSpan.FromSeconds(10);

    public int MaxLogEntries { get; init; } = 1_000;

    public TimeSpan Lead => TimeSpan.FromSeconds(SlaSeconds);

    public void Validate()
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(SlaSeconds, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(SlaSeconds, 120);
        ArgumentOutOfRangeException.ThrowIfLessThan(MinimumSpeed, 1.0);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(MaximumSpeed, 10.0);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaximumSpeed, MinimumSpeed);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaxSessions, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(MaxSessions, 200);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaxLogEntries, 100);
        ArgumentOutOfRangeException.ThrowIfLessThan(PrefetchLead, TimeSpan.Zero);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(NarrationWait, TimeSpan.Zero);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(NarrationWait, Lead / 2);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(TickInterval, TimeSpan.Zero);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(Heartbeat, TimeSpan.Zero);
    }
}
