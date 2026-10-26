using VarAI.Contracts;

namespace VarAI.Server.Feeds;

public static class MatchEventTypes
{
    public const string Pass = "PASS";
    public const string Carry = "CARRY";
    public const string Pressure = "PRESSURE";
    public const string Tackle = "TACKLE";
    public const string PossessionChange = "POSSESSION_CHANGE";
    public const string Shot = "SHOT";
    public const string Goal = "GOAL";
    public const string Foul = "FOUL";
    public const string Card = "CARD";
    public const string Review = "REVIEW";
    public const string PeriodStart = "PERIOD_START";
    public const string PeriodEnd = "PERIOD_END";
}

public static class MatchStreamKinds
{
    public const string Match = "match";
    public const string Event = "event";
    public const string Momentum = "momentum";
    public const string Overlay = "overlay";
    public const string Complete = "complete";
}

public static class OverlayKinds
{
    public const string Goal = "GOAL";
    public const string ReviewStarted = "REVIEW_STARTED";
    public const string GoalDisallowed = "GOAL_DISALLOWED";
    public const string Card = "CARD";
    public const string PressTrap = "PRESS_TRAP";
    public const string SprintCarry = "SPRINT_CARRY";
    public const string HardPass = "HARD_PASS";
    public const string ShotSpeed = "SHOT_SPEED";
    public const string MomentumSwing = "MOMENTUM_SWING";
    public const string ChaosSpike = "CHAOS_SPIKE";
}

public sealed record PitchSpec(double LengthM, double WidthM);

public sealed record PeriodSpec(int Period, int StartMs, int EndMs);

public sealed record SyntheticPlayer(string PlayerId, string Name, int ShirtNumber, string Role);

public sealed record SyntheticTeam(
    string TeamId,
    string Name,
    string ShortName,
    string AttackDirection,
    IReadOnlyList<SyntheticPlayer> Players);

public sealed record Highlight(string HighlightId, string Label, int MatchClockMs);

public sealed record SyntheticMatchMetadata(
    string MatchId,
    PitchSpec Pitch,
    IReadOnlyList<PeriodSpec> Periods,
    int DurationMs,
    Score StartingScore,
    SyntheticTeam HomeTeam,
    SyntheticTeam AwayTeam,
    IReadOnlyList<Highlight> Highlights,
    long Seed,
    bool Synthetic);

public sealed record EventMetrics(
    double? DistanceM,
    double? ForwardM,
    double? SpeedMps,
    double? SpeedKph,
    int? Difficulty,
    bool? UnderPressure,
    bool? FinalThird,
    bool? Sprint);

public sealed record SyntheticMatchEvent(
    string EventId,
    string MatchId,
    int Sequence,
    int Period,
    int MatchClockMs,
    string TeamId,
    string? PlayerId,
    string EventType,
    double X,
    double Y,
    double? EndX,
    double? EndY,
    int? DurationMs,
    string? Outcome,
    string? ReceiverId,
    Score? ScoreAfter,
    string? ScenarioId,
    EventMetrics? Metrics,
    string Description,
    bool Synthetic);

public sealed record MomentumSample(
    int Minute,
    int MatchClockMs,
    int WindowSeconds,
    double HomeBallActionSharePct,
    int ControlIndex,
    int Turnovers,
    double TurnoversPerMinute,
    int HomePressures,
    int AwayPressures,
    string State,
    string? ControllingTeamId);

public sealed record OverlayMetric(string Key, string Label, double Value, string Unit);

public sealed record OverlayLowerThird(string Title, string Subtitle);

public sealed record OverlayWindow(int StartMs, int EndMs);

public sealed record OverlayCue(
    string SchemaVersion,
    string OverlayId,
    string MatchId,
    string Kind,
    int Priority,
    int InMs,
    int OutMs,
    int DurationMs,
    string Headline,
    string Detail,
    string WhyItMatters,
    OverlayLowerThird LowerThird,
    IReadOnlyList<OverlayMetric> Metrics,
    string? TeamId,
    IReadOnlyList<string> PlayerIds,
    IReadOnlyList<string> SourceEventIds,
    OverlayWindow? SourceWindow,
    string Rule,
    string? ScenarioId,
    bool Synthetic);

public sealed record MatchComplete(string MatchId, int EventCount, int MomentumCount, int OverlayCount, Score FinalScore);

public sealed record StreamItem(int Index, int TimeMs, string Kind, object Payload);
