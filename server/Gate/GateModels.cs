using VarAI.Server.Feeds;
using VarAI.Server.Narration;

namespace VarAI.Server.Gate;

public static class ProposalStates
{
    public const string Pending = "PENDING";
    public const string Approved = "APPROVED";
    public const string Held = "HELD";
    public const string Overridden = "OVERRIDDEN";
    public const string AutoHeld = "AUTO_HELD";
}

public static class DecisionActions
{
    public const string Approve = "approve";
    public const string Hold = "hold";
    public const string Override = "override";
}

public static class DecisionEvents
{
    public const string Proposed = "PROPOSED";
    public const string Approved = "APPROVED";
    public const string Held = "HELD";
    public const string Overridden = "OVERRIDDEN";
    public const string AutoHeld = "AUTO_HELD";
}

public static class DeskMessageTypes
{
    public const string Session = "session";
    public const string Proposal = "proposal";
    public const string Decision = "decision";
    public const string Heartbeat = "heartbeat";
}

public sealed record DecisionRequest(
    string? ApprovalId, string? PayloadHash, string? Action,
    IReadOnlyDictionary<string, NarrationText>? Edits, string? Note);

public sealed record DecisionResult(
    string ApprovalId, string State, string PayloadHash, long DecidedAtMs);

public enum DecisionFailure
{
    UnknownProposal,
    AlreadyDecided,
    SlaExpired,
    StalePayload,
    InvalidRequest,
}

public sealed record DecisionOutcome(DecisionResult? Result, DecisionFailure? Failure, string? Detail)
{
    public static DecisionOutcome Success(DecisionResult result) => new(result, null, null);

    public static DecisionOutcome Fail(DecisionFailure failure, string detail) => new(null, failure, detail);
}

/// <summary>A proposal as the operator desk sees it: full narration for every language, with verifier results and usage.</summary>
public sealed record ProposalView(
    string ApprovalId,
    string PayloadHash,
    string State,
    long ProposedAtMs,
    long DeadlineMs,
    OverlayCue Cue,
    IReadOnlyDictionary<string, CueNarration> Narrations,
    long? DecidedAtMs,
    string? Note);

public sealed record SessionView(
    string SessionId,
    string MatchId,
    double Speed,
    int FromSeconds,
    int LeadSeconds,
    int SlaSeconds,
    IReadOnlyList<string> Languages,
    NarrationStatus Narration,
    string CreatedAtUtc,
    string ExpiresAtUtc,
    long ElapsedMs);

public sealed record DeskMessage(int Seq, string Type, object Payload);

/// <summary>What airs: the cue's own fields plus the approval that released it and the approved narration per language.</summary>
public sealed record ApprovalInfo(
    string ApprovalId, string PayloadHash, string Decision, IReadOnlyDictionary<string, PublicNarration> Narrations);
