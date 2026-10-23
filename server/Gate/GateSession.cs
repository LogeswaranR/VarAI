using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using VarAI.Server.Feeds;
using VarAI.Server.Narration;
using VarAI.Server.Telemetry;

namespace VarAI.Server.Gate;

/// <summary>
/// One operator-gated run of the synthetic match. Cues are proposed to an operator desk one SLA before they would air;
/// the program feed carries every event and momentum sample but a cue only if a person approved (or overrode) it. An
/// undecided proposal is held when it would have aired: there is no path that approves automatically.
/// </summary>
public sealed class GateSession : IDisposable
{
    private const int MaximumNoteCharacters = 200;
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private static readonly JsonSerializerOptions Canonical = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly SyntheticMatchTimeline timeline;
    private readonly NarrationService narration;
    private readonly GateOptions options;
    private readonly TimeProvider time;
    private readonly ILogger logger;
    private readonly long startTimestamp;
    private readonly CancellationTokenSource stopping = new();
    private readonly object gate = new();
    private readonly List<CuePlan> plans;
    private readonly Dictionary<string, CuePlan> plansByCue = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Proposal> byApprovalId = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Proposal> byCueId = new(StringComparer.Ordinal);
    private readonly List<DeskMessage> deskMessages = [];
    private TaskCompletionSource deskSignal = NewSignal();
    private bool disposed;

    public GateSession(
        string sessionId, SyntheticMatchTimeline timeline, NarrationService narration, GateOptions options,
        double speed, int fromSeconds, TimeProvider time, ILogger logger, bool autoRun = true)
    {
        SessionId = sessionId ?? throw new ArgumentNullException(nameof(sessionId));
        this.timeline = timeline ?? throw new ArgumentNullException(nameof(timeline));
        this.narration = narration ?? throw new ArgumentNullException(nameof(narration));
        this.options = options ?? throw new ArgumentNullException(nameof(options));
        this.time = time ?? throw new ArgumentNullException(nameof(time));
        this.logger = logger ?? throw new ArgumentNullException(nameof(logger));
        options.Validate();
        if (!(speed >= options.MinimumSpeed && speed <= options.MaximumSpeed))
        {
            throw new ArgumentOutOfRangeException(nameof(speed));
        }

        ArgumentOutOfRangeException.ThrowIfNegative(fromSeconds);
        Speed = speed;
        FromSeconds = fromSeconds;
        Log = new DecisionLog(sessionId, time, options.MaxLogEntries);
        startTimestamp = time.GetTimestamp();
        CreatedAt = time.GetUtcNow();
        var fromMs = fromSeconds * 1000;
        plans = [.. timeline.Overlays
            .Where(cue => cue.InMs > fromMs)
            .Select((cue, index) => new CuePlan(cue, $"APR-{index + 1:000}", ProposeAt(cue.InMs - fromMs), options.Lead))];
        foreach (var plan in plans)
        {
            plansByCue[plan.Cue.OverlayId] = plan;
        }

        var programEnd = options.Lead + ProposeAt(Math.Max(0, timeline.Items[^1].TimeMs - fromMs));
        ExpiresAt = CreatedAt + programEnd + options.SessionGrace;
        if (autoRun)
        {
            _ = Task.Run(() => RunAsync(stopping.Token));
        }
    }

    public string SessionId { get; }

    /// <summary>The first eight characters of the session ID: enough to correlate logs and spans, not enough to act on the session.</summary>
    public string Reference => SessionId.Length <= 8 ? SessionId : SessionId[..8];
    public double Speed { get; }
    public int FromSeconds { get; }
    public DecisionLog Log { get; }
    public DateTimeOffset CreatedAt { get; }
    public DateTimeOffset ExpiresAt { get; }
    public TimeSpan Elapsed => time.GetElapsedTime(startTimestamp);
    public int PlannedCues => plans.Count;

    private TimeSpan ProposeAt(int matchMs) => TimeSpan.FromSeconds(matchMs / 1000.0 / Speed);

    public SessionView View() => new(
        SessionId, SyntheticMatchTimeline.MatchId, Speed, FromSeconds, options.SlaSeconds, options.SlaSeconds,
        [.. NarrationLanguages.All.Select(language => language.Code())], narration.Status,
        CreatedAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture),
        ExpiresAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture), (long)Elapsed.TotalMilliseconds);

    public IReadOnlyList<ProposalView> Proposals()
    {
        lock (gate)
        {
            return [.. byApprovalId.Values.OrderBy(proposal => proposal.ApprovalId, StringComparer.Ordinal).Select(ToView)];
        }
    }

    /// <summary>Does everything that is due now. Safe to call at any time and any number of times.</summary>
    public void Tick()
    {
        if (disposed)
        {
            return;
        }

        var now = Elapsed;
        List<CuePlan> prefetch = [];
        List<CuePlan> propose = [];
        lock (gate)
        {
            foreach (var plan in plans)
            {
                if (!plan.Prefetched && now >= plan.ProposeAt - options.PrefetchLead)
                {
                    plan.Prefetched = true;
                    prefetch.Add(plan);
                }

                if (!plan.Proposing && now >= plan.ProposeAt)
                {
                    plan.Proposing = true;
                    propose.Add(plan);
                }
            }
        }

        foreach (var plan in prefetch)
        {
            StartNarration(plan);
        }

        foreach (var plan in propose)
        {
            _ = ProposeAsync(plan);
        }

        lock (gate)
        {
            foreach (var proposal in byApprovalId.Values)
            {
                if (proposal.State == ProposalStates.Pending && now >= proposal.Deadline)
                {
                    AutoHold(proposal, now, "SLA_EXPIRED");
                }
            }
        }
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                Tick();
                await Task.Delay(options.TickInterval, time, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            logger.LogError("Gate session {SessionReference} stopped unexpectedly: {ExceptionType}", Reference, exception.GetType().Name);
        }
    }

    private Task<CueNarration>[] StartNarration(CuePlan plan)
    {
        lock (gate)
        {
            return plan.Narrations ??= [.. NarrationLanguages.All.Select(language => narration.GetAsync(plan.Cue, language, stopping.Token))];
        }
    }

    private async Task ProposeAsync(CuePlan plan)
    {
        var narrations = new SortedDictionary<string, CueNarration>(StringComparer.Ordinal);
        try
        {
            var tasks = StartNarration(plan);
            await Task.WhenAny(Task.WhenAll(tasks), Task.Delay(options.NarrationWait, time, stopping.Token));
            for (var index = 0; index < tasks.Length; index++)
            {
                narrations[NarrationLanguages.All[index].Code()] = tasks[index].IsCompletedSuccessfully
                    ? tasks[index].Result
                    : FallbackNarration.Create(narration.FactsOf(plan.Cue), NarrationLanguages.All[index], FallbackReasons.NotReady);
            }
        }
        catch (OperationCanceledException)
        {
            return;
        }
        catch (Exception exception)
        {
            logger.LogError("Gate session {SessionReference} could not prepare {CueId}: {ExceptionType}",
                Reference, plan.Cue.OverlayId, exception.GetType().Name);
            narrations.Clear();
        }

        lock (gate)
        {
            if (!disposed)
            {
                CreateProposal(plan, narrations);
            }
        }
    }

    private Proposal CreateProposal(CuePlan plan, SortedDictionary<string, CueNarration> narrations)
    {
        if (narrations.Count == 0)
        {
            var facts = narration.FactsOf(plan.Cue);
            foreach (var language in NarrationLanguages.All)
            {
                narrations[language.Code()] = FallbackNarration.Create(facts, language, FallbackReasons.NotReady);
            }
        }

        var hash = HashOf(plan.Cue.OverlayId, narrations);
        var proposal = new Proposal(plan.ApprovalId, plan.Cue, narrations, hash, Elapsed, plan.AirAt);
        byApprovalId[proposal.ApprovalId] = proposal;
        byCueId[plan.Cue.OverlayId] = proposal;
        Log.Append(Draft(DecisionEvents.Proposed, proposal, DecisionLog.SystemActor, null, null, null, null));
        Publish(DeskMessageTypes.Proposal, ToView(proposal));
        return proposal;
    }

    public DecisionOutcome Decide(DecisionRequest request)
    {
        using var activity = VarAiTelemetry.Source.StartActivity("gate.decide");
        var outcome = DecideCore(request);
        activity?.SetTag("varai.gate.session", Reference);
        activity?.SetTag("varai.gate.approval_id", request?.ApprovalId);
        activity?.SetTag("varai.gate.action", request?.Action);
        activity?.SetTag("varai.gate.result", outcome.Result?.State ?? outcome.Failure?.ToString());
        return outcome;
    }

    private DecisionOutcome DecideCore(DecisionRequest request)
    {
        if (request is null || string.IsNullOrEmpty(request.ApprovalId) || string.IsNullOrEmpty(request.PayloadHash) ||
            string.IsNullOrEmpty(request.Action))
        {
            return DecisionOutcome.Fail(DecisionFailure.InvalidRequest, "approvalId, payloadHash and action are required.");
        }

        if (request.Action is not (DecisionActions.Approve or DecisionActions.Hold or DecisionActions.Override))
        {
            return DecisionOutcome.Fail(DecisionFailure.InvalidRequest, "action must be approve, hold or override.");
        }

        var note = request.Note?.Trim();
        if (note is { Length: > MaximumNoteCharacters } || (note is not null && note.Any(char.IsControl)))
        {
            return DecisionOutcome.Fail(DecisionFailure.InvalidRequest, "note must be plain text of at most 200 characters.");
        }

        lock (gate)
        {
            if (disposed || !byApprovalId.TryGetValue(request.ApprovalId, out var proposal))
            {
                return DecisionOutcome.Fail(DecisionFailure.UnknownProposal, "No such proposal in this session.");
            }

            var now = Elapsed;
            if (proposal.State != ProposalStates.Pending)
            {
                return DecisionOutcome.Fail(DecisionFailure.AlreadyDecided, $"The proposal is already {proposal.State}.");
            }

            if (now >= proposal.Deadline)
            {
                AutoHold(proposal, now, "SLA_EXPIRED");
                return DecisionOutcome.Fail(DecisionFailure.SlaExpired, "The decision window closed and the cue was held.");
            }

            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(request.PayloadHash), Encoding.UTF8.GetBytes(proposal.PayloadHash)))
            {
                return DecisionOutcome.Fail(DecisionFailure.StalePayload, "The proposal changed; reload it before deciding.");
            }

            string decisionEvent;
            string? editedHash = null;
            SortedDictionary<string, NarrationText>? edits = null;
            switch (request.Action)
            {
                case DecisionActions.Approve:
                    proposal.State = ProposalStates.Approved;
                    decisionEvent = DecisionEvents.Approved;
                    break;
                case DecisionActions.Hold:
                    proposal.State = ProposalStates.Held;
                    decisionEvent = DecisionEvents.Held;
                    break;
                default:
                    if (!TryOverride(proposal, request.Edits, out editedHash, out edits, out var problem))
                    {
                        return DecisionOutcome.Fail(DecisionFailure.InvalidRequest, problem);
                    }

                    proposal.State = ProposalStates.Overridden;
                    decisionEvent = DecisionEvents.Overridden;
                    break;
            }

            proposal.DecidedAt = now;
            proposal.Note = note;
            proposal.ReleasedHash = editedHash ?? proposal.PayloadHash;
            Log.Append(Draft(decisionEvent, proposal, DecisionLog.Actor, editedHash, edits, note, null));
            VarAiTelemetry.Decisions.Add(1, new KeyValuePair<string, object?>("action", request.Action));
            PublishDecision(proposal);
            return DecisionOutcome.Success(new DecisionResult(
                proposal.ApprovalId, proposal.State, proposal.ReleasedHash, (long)now.TotalMilliseconds));
        }
    }

    private bool TryOverride(
        Proposal proposal, IReadOnlyDictionary<string, NarrationText>? requested, out string? editedHash,
        out SortedDictionary<string, NarrationText>? edits, out string problem)
    {
        editedHash = null;
        edits = null;
        problem = string.Empty;
        if (requested is not { Count: > 0 and <= 2 })
        {
            problem = "An override needs the edited text for at least one language.";
            return false;
        }

        var accepted = new SortedDictionary<string, NarrationText>(StringComparer.Ordinal);
        var updated = new SortedDictionary<string, CueNarration>(proposal.Narrations, StringComparer.Ordinal);
        var facts = narration.FactsOf(proposal.Cue);
        foreach (var (code, text) in requested)
        {
            if (!NarrationLanguages.TryParse(code, out var language) || text is null)
            {
                problem = "Edits must be keyed by a supported language code (en, ta).";
                return false;
            }

            var verdict = NarrationVerifier.Check(text, facts, language);
            var blocking = verdict.Failures
                .Where(failure => failure.Check is NarrationVerifier.Schema or NarrationVerifier.Markup)
                .Select(failure => $"{code}/{failure.Field}: {failure.Detail}")
                .ToArray();
            if (blocking.Length > 0)
            {
                problem = "The edited text is not acceptable: " + string.Join("; ", blocking);
                return false;
            }

            var clean = new NarrationText(text.Headline.Trim(), text.Fan.Trim(), text.Analyst.Trim(), text.Why.Trim());
            accepted[code] = clean;
            updated[code] = new CueNarration(
                proposal.Cue.OverlayId, code, code, NarrationSources.Operator, null, clean, verdict, null);
        }

        proposal.Narrations = updated;
        editedHash = HashOf(proposal.Cue.OverlayId, updated);
        edits = accepted;
        return true;
    }

    private void AutoHold(Proposal proposal, TimeSpan now, string reason)
    {
        proposal.State = ProposalStates.AutoHeld;
        proposal.DecidedAt = now;
        Log.Append(Draft(DecisionEvents.AutoHeld, proposal, DecisionLog.SystemActor, null, null, null, reason));
        VarAiTelemetry.Decisions.Add(1, new KeyValuePair<string, object?>("action", "auto_hold"));
        PublishDecision(proposal);
    }

    private DecisionDraft Draft(
        string decisionEvent, Proposal proposal, string actor, string? editedHash,
        SortedDictionary<string, NarrationText>? edits, string? note, string? reason) =>
        new(decisionEvent, proposal.ApprovalId, proposal.Cue.OverlayId, proposal.Cue.Kind, proposal.PayloadHash, actor,
            new SortedDictionary<string, DecisionNarrationNote>(
                proposal.Narrations.ToDictionary(
                    pair => pair.Key,
                    pair => new DecisionNarrationNote(
                        pair.Value.Source, pair.Value.Language, pair.Value.FallbackReason, pair.Value.Verification?.Passed)),
                StringComparer.Ordinal),
            editedHash, edits, note, reason);

    /// <summary>
    /// The program-feed form of a cue at the moment it would air, or null if no person approved it. Pending proposals whose
    /// window has closed are held here, so a late reader can never see an unapproved cue.
    /// </summary>
    internal JsonNode? Release(OverlayCue cue)
    {
        lock (gate)
        {
            if (!byCueId.TryGetValue(cue.OverlayId, out var proposal))
            {
                if (!plansByCue.TryGetValue(cue.OverlayId, out var plan))
                {
                    return null;
                }

                proposal = CreateProposal(plan, new SortedDictionary<string, CueNarration>(StringComparer.Ordinal));
            }

            var now = Elapsed;
            if (proposal.State == ProposalStates.Pending && now >= proposal.Deadline)
            {
                AutoHold(proposal, now, "SLA_EXPIRED");
            }

            if (proposal.State is not (ProposalStates.Approved or ProposalStates.Overridden))
            {
                return null;
            }

            var node = JsonSerializer.SerializeToNode(cue, Web)!.AsObject();
            node["approval"] = JsonSerializer.SerializeToNode(
                new ApprovalInfo(
                    proposal.ApprovalId, proposal.ReleasedHash ?? proposal.PayloadHash,
                    proposal.State == ProposalStates.Overridden ? "OVERRIDDEN" : "APPROVED",
                    proposal.Narrations.ToDictionary(pair => pair.Key, pair => pair.Value.ToPublic())),
                Web);
            return node;
        }
    }

    /// <summary>
    /// Every event, momentum sample and the completion marker on the delayed program clock, plus each approved cue at its
    /// air time. History at or before the jump point is delivered at once; cues before it were never proposed and never air.
    /// </summary>
    public async IAsyncEnumerable<StreamItem> ProgramAsync(
        int afterIndex, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, stopping.Token);
        var fromMs = FromSeconds * 1000;
        foreach (var item in timeline.Items)
        {
            if (item.Index <= afterIndex)
            {
                continue;
            }

            var cue = item.Payload as OverlayCue;
            if (cue is not null && cue.InMs <= fromMs)
            {
                continue;
            }

            var at = item.TimeMs <= fromMs ? TimeSpan.Zero : options.Lead + ProposeAt(item.TimeMs - fromMs);
            await WaitUntilAsync(at, linked.Token);
            if (cue is null)
            {
                yield return item;
                continue;
            }

            if (Release(cue) is { } released)
            {
                yield return new StreamItem(item.Index, item.TimeMs, item.Kind, released);
            }
        }
    }

    private async Task WaitUntilAsync(TimeSpan at, CancellationToken cancellationToken)
    {
        while (true)
        {
            var wait = at - Elapsed;
            if (wait <= TimeSpan.Zero)
            {
                return;
            }

            // Task.Delay truncates to whole milliseconds, so round up or a sub-millisecond remainder would spin.
            await Task.Delay(TimeSpan.FromMilliseconds(Math.Ceiling(wait.TotalMilliseconds)), time, cancellationToken);
        }
    }

    /// <summary>
    /// Desk messages after <paramref name="afterSeq"/>: the session, every proposal and decision so far, then new ones as
    /// they happen, with a heartbeat when idle. Reconnecting with the last sequence number resumes without loss.
    /// </summary>
    public async IAsyncEnumerable<DeskMessage> DeskAsync(
        int afterSeq, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, stopping.Token);
        yield return new DeskMessage(afterSeq, DeskMessageTypes.Session, View());
        var last = afterSeq;
        while (!linked.IsCancellationRequested)
        {
            DeskMessage[] pending;
            Task signal;
            lock (gate)
            {
                pending = [.. deskMessages.Where(message => message.Seq > last)];
                signal = deskSignal.Task;
            }

            if (pending.Length > 0)
            {
                foreach (var message in pending)
                {
                    yield return message;
                    last = message.Seq;
                }

                continue;
            }

            if (disposed)
            {
                yield break;
            }

            using var idle = CancellationTokenSource.CreateLinkedTokenSource(linked.Token);
            var heartbeat = Task.Delay(options.Heartbeat, time, idle.Token);
            var finished = await Task.WhenAny(signal, heartbeat);
            await idle.CancelAsync();
            if (linked.IsCancellationRequested)
            {
                yield break;
            }

            if (finished != signal)
            {
                yield return new DeskMessage(last, DeskMessageTypes.Heartbeat, new { elapsedMs = (long)Elapsed.TotalMilliseconds });
            }
        }
    }

    private void PublishDecision(Proposal proposal) =>
        Publish(DeskMessageTypes.Decision, new
        {
            approvalId = proposal.ApprovalId,
            state = proposal.State,
            decidedAtMs = (long?)proposal.DecidedAt?.TotalMilliseconds,
            payloadHash = proposal.ReleasedHash ?? proposal.PayloadHash,
            note = proposal.Note,
            narrations = proposal.Narrations,
        });

    private void Publish(string type, object payload)
    {
        deskMessages.Add(new DeskMessage(deskMessages.Count + 1, type, payload));
        var previous = deskSignal;
        deskSignal = NewSignal();
        previous.TrySetResult();
    }

    private static TaskCompletionSource NewSignal() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    private ProposalView ToView(Proposal proposal) => new(
        proposal.ApprovalId, proposal.PayloadHash, proposal.State, (long)proposal.ProposedAt.TotalMilliseconds,
        (long)proposal.Deadline.TotalMilliseconds, proposal.Cue, new SortedDictionary<string, CueNarration>(proposal.Narrations, StringComparer.Ordinal),
        (long?)proposal.DecidedAt?.TotalMilliseconds, proposal.Note);

    /// <summary>Binds an approval to the exact text that would air: the cue and every language's narration, canonically encoded.</summary>
    internal static string HashOf(string cueId, IReadOnlyDictionary<string, CueNarration> narrations)
    {
        var canonical = new
        {
            cueId,
            narrations = narrations
                .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => new { language = pair.Key, narration = pair.Value.ToPublic() }),
        };
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(canonical, Canonical))));
    }

    public void Dispose()
    {
        lock (gate)
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            deskSignal.TrySetResult();
        }

        // The source is cancelled but not disposed so a stream that races with eviction still reads a valid token.
        stopping.Cancel();
    }

    private sealed class CuePlan(OverlayCue cue, string approvalId, TimeSpan proposeAt, TimeSpan lead)
    {
        public OverlayCue Cue { get; } = cue;
        public string ApprovalId { get; } = approvalId;
        public TimeSpan ProposeAt { get; } = proposeAt;
        public TimeSpan AirAt { get; } = proposeAt + lead;
        public bool Prefetched { get; set; }
        public bool Proposing { get; set; }
        public Task<CueNarration>[]? Narrations { get; set; }
    }

    private sealed class Proposal(
        string approvalId, OverlayCue cue, SortedDictionary<string, CueNarration> narrations, string payloadHash,
        TimeSpan proposedAt, TimeSpan deadline)
    {
        public string ApprovalId { get; } = approvalId;
        public OverlayCue Cue { get; } = cue;
        public SortedDictionary<string, CueNarration> Narrations { get; set; } = narrations;
        public string PayloadHash { get; } = payloadHash;
        public TimeSpan ProposedAt { get; } = proposedAt;
        public TimeSpan Deadline { get; } = deadline;
        public string State { get; set; } = ProposalStates.Pending;
        public TimeSpan? DecidedAt { get; set; }
        public string? Note { get; set; }
        public string? ReleasedHash { get; set; }
    }
}
