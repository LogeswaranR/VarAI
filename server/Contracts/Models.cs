using System.Text.Json.Serialization;
using HotChocolate;
using HotChocolate.Types;

namespace VarAI.Contracts;

public enum ScenarioId { S1, S2, S3 }
public enum Audience { Casual, Analyst }
public enum SourceMode { Authored, LiveAi }
public enum EvidenceStatus { Supplied, Missing }
public enum ReviewStatus { Draft, SourceChecked, ExpertReviewed }
public enum Interpretation { OffsideSupported, NoOffsideSupported, InsufficientEvidence }
public enum ResponseStatus { Complete, Limited, Error }
public enum OriginalDecision { GoalAwarded }
public enum ReviewOutcome { GoalDisallowed, GoalConfirmed }
public enum DiagramStatus { Illustrative, Unavailable }
public enum AttackDirection { LeftToRight }
public enum MarkerRole { Passer, Receiver, Opponent, Ball }
public enum ReceiverPosition { Nearer, Level }
public enum ActiveInvolvement { Touch }
public enum PlayType { OpenPlay }
public enum EventKind { Pass, ReceiverTouch, Shot, Goal, ReviewStarted, ReviewReady }
public enum FactKey
{
    PassTimeObserved,
    ReceiverInOpponentsHalf,
    ReceiverAheadOfBall,
    ReceiverVsSecondLast,
    ActiveInvolvement,
    PlayType,
    InterveningOpponentTouch
}
public enum ErrorCode
{
    InvalidRequest,
    ScenarioNotFound,
    ContentVersionMismatch,
    ModelNotConfigured,
    ModelUnavailable,
    Timeout,
    InvalidOutput
}

[UnionType("FactValue")]
[JsonPolymorphic(TypeDiscriminatorPropertyName = "__typename")]
[JsonDerivedType(typeof(BooleanFactValue), "BooleanFactValue")]
[JsonDerivedType(typeof(PositionFactValue), "PositionFactValue")]
[JsonDerivedType(typeof(InvolvementFactValue), "InvolvementFactValue")]
[JsonDerivedType(typeof(PlayTypeFactValue), "PlayTypeFactValue")]
public interface IFactValue;

public sealed record BooleanFactValue(bool Boolean) : IFactValue;
public sealed record PositionFactValue(ReceiverPosition Position) : IFactValue;
public sealed record InvolvementFactValue(ActiveInvolvement Involvement) : IFactValue;
public sealed record PlayTypeFactValue(PlayType PlayType) : IFactValue;

public sealed record Fact(
    string Id, FactKey Key, IFactValue? Value, EvidenceStatus Status, string SourceLabel);
public sealed record Score(int Home, int Away);
public sealed record MatchContext(
    string HomeTeam, string AwayTeam, int IncidentMinute, Score ScoreBefore);
public sealed record RuleReference(
    string Id, string Title, string Section, string Publisher, string Url,
    string? Edition, string? CheckedOn, ReviewStatus ReviewStatus, string Summary);
public sealed record ReplayEvent(
    string Id, int OffsetMs, EventKind Kind, string Label, IReadOnlyList<string> RevealFactIds);
public sealed record Marker(
    string Id, MarkerRole Role, string Label, double X, double Y);
public sealed record Diagram(
    DiagramStatus Status, AttackDirection Direction, IReadOnlyList<Marker> Markers,
    double? SecondLastReferenceX, string TextAlternative);
public sealed record Comparison(
    string PairId, ScenarioId OtherScenarioId, FactKey ChangedFactKey);
public sealed record Claim(
    string Id, string Text, IReadOnlyList<string> EvidenceIds, IReadOnlyList<string> RuleIds);
public sealed record ExplanationBody(
    SourceMode SourceMode, ResponseStatus Status, Interpretation Interpretation,
    Claim Headline, IReadOnlyList<Claim> Points, IReadOnlyList<string> Limitations, Claim Recap);
public sealed record AuthoredExplanations(ExplanationBody Casual, ExplanationBody Analyst);

[UnionType("ScenarioResult")]
public interface IScenarioResult;

[UnionType("ExplanationResult")]
public interface IExplanationResult;

public sealed record Scenario(
    string SchemaVersion, string ContentVersion, ScenarioId Id, bool Synthetic,
    string Label, MatchContext Match, OriginalDecision OriginalDecision,
    ReviewOutcome? SuppliedReviewOutcome, Score? ScoreAfterReview, Interpretation Interpretation,
    IReadOnlyList<Fact> Facts, IReadOnlyList<RuleReference> Rules, IReadOnlyList<ReplayEvent> Events,
    Diagram Diagram, Comparison? Comparison, AuthoredExplanations AuthoredExplanations) : IScenarioResult;
public sealed record ScenarioSummary(
    ScenarioId Id, string ContentVersion, bool Synthetic, string Label);
public sealed record ExplanationRequest(
    string SchemaVersion, string RequestId, ScenarioId ScenarioId, string ContentVersion,
    Audience Audience, SourceMode SourceMode);
public sealed record ExplanationSuccess(
    string SchemaVersion, string RequestId, ScenarioId ScenarioId, string ContentVersion,
    Audience Audience, SourceMode SourceMode, ResponseStatus Status, Interpretation Interpretation,
    Claim Headline, IReadOnlyList<Claim> Points, IReadOnlyList<string> Limitations, Claim Recap)
    : IExplanationResult;
public sealed record ContractError(
    string SchemaVersion, string RequestId, ResponseStatus Status, ErrorCode Code,
    string Message, bool Retryable) : IExplanationResult, IScenarioResult;

public sealed record ExpertReviewRecord(
    ScenarioId ScenarioId, string ContentVersion, string RuleId, string Edition, string Reference);

public sealed record GenerationInput(
    string SchemaVersion, ScenarioId ScenarioId, string ContentVersion, Audience Audience,
    OriginalDecision OriginalDecision, ReviewOutcome? SuppliedReviewOutcome,
    Score ScoreBefore, Score? ScoreAfterReview, Interpretation Interpretation,
    IReadOnlyList<Fact> Facts, IReadOnlyList<RuleReference> Rules);

public interface IScenarioRepository
{
    Task<IReadOnlyList<ScenarioSummary>> ListAsync(CancellationToken cancellationToken);
    Task<Scenario?> FindAsync(ScenarioId id, CancellationToken cancellationToken);
}

public interface IExplanationService
{
    Task<IExplanationResult> ExplainAsync(ExplanationRequest request, CancellationToken cancellationToken);
}

public interface IExplanationProvider
{
    Task<string> GenerateAsync(GenerationInput input, CancellationToken cancellationToken);
}
