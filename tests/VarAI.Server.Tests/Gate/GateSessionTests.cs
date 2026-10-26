using System.Text.Json.Nodes;
using VarAI.Server.Feeds;
using VarAI.Server.Gate;
using VarAI.Server.Narration;
using static VarAI.Server.Tests.Narration.NarrationTestData;

namespace VarAI.Server.Tests.Gate;

[TestClass]
public sealed class GateSessionTests
{
    private const double Speed = 10;
    private const int From = 4_000;
    private static readonly TimeSpan Sla = TimeSpan.FromSeconds(20);

    public required TestContext TestContext { get; set; }

    private static OverlayCue FirstCue => Timeline.Overlays.First(cue => cue.InMs > From * 1000);

    private static TimeSpan ProposeAt(OverlayCue cue) => TimeSpan.FromSeconds((cue.InMs - (From * 1000)) / 1000.0 / Speed);

    private static DecisionRequest Approve(ProposalView proposal) =>
        new(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Approve, null, null);

    private static ProposalView Only(GateSession session, OverlayCue cue) =>
        session.Proposals().Single(proposal => proposal.Cue.OverlayId == cue.OverlayId);

    [TestMethod]
    public void ProposalsAppearOneSlaBeforeTheyAirWithBothLanguagesAndAHash()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;

        harness.AdvanceTo(session, ProposeAt(cue) - TimeSpan.FromMilliseconds(1));
        Assert.IsEmpty(session.Proposals(), "Nothing is proposed before its time.");

        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        Assert.AreEqual("APR-001", proposal.ApprovalId);
        Assert.AreEqual(ProposalStates.Pending, proposal.State);
        Assert.AreEqual((long)ProposeAt(cue).TotalMilliseconds, proposal.ProposedAtMs);
        Assert.AreEqual((long)(ProposeAt(cue) + Sla).TotalMilliseconds, proposal.DeadlineMs, "The operator has exactly the SLA.");
        CollectionAssert.AreEqual(new[] { "en", "ta" }, proposal.Narrations.Keys.ToArray());
        Assert.HasCount(64, proposal.PayloadHash);
        Assert.AreEqual(NarrationSources.Fallback, proposal.Narrations["en"].Source);
        Assert.AreEqual(FallbackReasons.Disabled, proposal.Narrations["ta"].FallbackReason);
        Assert.AreEqual("en", proposal.Narrations["ta"].Language, "A Tamil request that falls back is delivered as labelled English.");
        Assert.AreEqual(DecisionEvents.Proposed, JsonNode.Parse(session.Log.Lines().Single())!["event"]!.GetValue<string>());
    }

    [TestMethod]
    public void PlannedCuesAreExactlyTheCuesAfterTheJumpPoint()
    {
        using var harness = new GateHarness();
        var session = harness.Start();

        Assert.AreEqual(Timeline.Overlays.Count(cue => cue.InMs > From * 1000), session.PlannedCues);
        Assert.IsLessThan(Timeline.Overlays.Count, session.PlannedCues, "Earlier cues are history and are never proposed.");
    }

    [TestMethod]
    public void AnUndecidedProposalIsHeldWhenItWouldAirAndIsNeverApproved()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        harness.AdvanceTo(session, ProposeAt(cue) + Sla - TimeSpan.FromMilliseconds(1));
        Assert.AreEqual(ProposalStates.Pending, Only(session, cue).State);

        harness.AdvanceTo(session, ProposeAt(cue) + Sla);

        Assert.AreEqual(ProposalStates.AutoHeld, Only(session, cue).State);
        Assert.IsNull(session.Release(cue), "A held cue never reaches the program feed.");
        var entry = JsonNode.Parse(session.Log.Lines().Last())!;
        Assert.AreEqual(DecisionEvents.AutoHeld, entry["event"]!.GetValue<string>());
        Assert.AreEqual("SLA_EXPIRED", entry["reason"]!.GetValue<string>());
        Assert.AreEqual(DecisionLog.SystemActor, entry["actor"]!.GetValue<string>());
        var late = session.Decide(Approve(proposal));
        Assert.AreEqual(DecisionFailure.AlreadyDecided, late.Failure);
        Assert.IsNull(session.Release(cue), "A late approval cannot resurrect a held cue.");
    }

    [TestMethod]
    public void ADecisionAtTheDeadlineIsTooLateEvenBeforeTheNextTick()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        harness.Time.Advance(Sla);
        var outcome = session.Decide(Approve(proposal));

        Assert.AreEqual(DecisionFailure.SlaExpired, outcome.Failure);
        Assert.AreEqual(ProposalStates.AutoHeld, Only(session, cue).State);
        Assert.IsNull(session.Release(cue));
    }

    [TestMethod]
    public void ADecisionJustInsideTheWindowSucceeds()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        harness.Time.Advance(Sla - TimeSpan.FromMilliseconds(1));
        var outcome = session.Decide(Approve(proposal));

        Assert.IsNotNull(outcome.Result, outcome.Detail);
        Assert.AreEqual(ProposalStates.Approved, outcome.Result.State);
    }

    [TestMethod]
    public void ApprovalReleasesTheCueWithItsApprovalIdHashAndPublicNarration()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        var outcome = session.Decide(Approve(proposal));
        var released = session.Release(cue)!.AsObject();

        Assert.IsNotNull(outcome.Result);
        Assert.AreEqual(proposal.PayloadHash, outcome.Result.PayloadHash);
        Assert.AreEqual(cue.OverlayId, released["overlayId"]!.GetValue<string>());
        Assert.AreEqual(cue.Headline, released["headline"]!.GetValue<string>(), "The cue's own fields are unchanged.");
        var approval = released["approval"]!.AsObject();
        Assert.AreEqual("APR-001", approval["approvalId"]!.GetValue<string>());
        Assert.AreEqual(proposal.PayloadHash, approval["payloadHash"]!.GetValue<string>());
        Assert.AreEqual("APPROVED", approval["decision"]!.GetValue<string>());
        Assert.AreEqual(NarrationSources.Fallback, approval["narrations"]!["en"]!["source"]!.GetValue<string>());
        var json = released.ToJsonString();
        Assert.DoesNotContain("usage", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("verification", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("promptTokens", json, StringComparison.OrdinalIgnoreCase);
        var last = JsonNode.Parse(session.Log.Lines().Last())!;
        Assert.AreEqual(DecisionEvents.Approved, last["event"]!.GetValue<string>());
        Assert.AreEqual(DecisionLog.Actor, last["actor"]!.GetValue<string>());
        Assert.IsFalse(last["actorAuthenticated"]!.GetValue<bool>());
    }

    [TestMethod]
    public void HoldNeverReleasesAndIsLoggedWithTheOperatorsNote()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        var outcome = session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Hold, null, "  wrong player  "));

        Assert.AreEqual(ProposalStates.Held, outcome.Result!.State);
        Assert.IsNull(session.Release(cue));
        var entry = JsonNode.Parse(session.Log.Lines().Last())!;
        Assert.AreEqual(DecisionEvents.Held, entry["event"]!.GetValue<string>());
        Assert.AreEqual("wrong player", entry["note"]!.GetValue<string>());
    }

    [TestMethod]
    public void OverrideReleasesTheOperatorsTextWithANewHashAndTheOriginalIsLogged()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);
        var edits = new Dictionary<string, NarrationText>
        {
            ["en"] = new(" Edited headline ", "Edited fan text.", "Edited analyst text.", "Edited why text."),
        };

        var outcome = session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Override, edits, "tightened"));

        Assert.IsNotNull(outcome.Result, outcome.Detail);
        Assert.AreEqual(ProposalStates.Overridden, outcome.Result.State);
        Assert.AreNotEqual(proposal.PayloadHash, outcome.Result.PayloadHash, "Edited text has its own hash.");
        var approval = session.Release(cue)!["approval"]!.AsObject();
        Assert.AreEqual("OVERRIDDEN", approval["decision"]!.GetValue<string>());
        Assert.AreEqual(outcome.Result.PayloadHash, approval["payloadHash"]!.GetValue<string>());
        Assert.AreEqual(NarrationSources.Operator, approval["narrations"]!["en"]!["source"]!.GetValue<string>());
        Assert.AreEqual("Edited headline", approval["narrations"]!["en"]!["text"]!["headline"]!.GetValue<string>());
        Assert.AreEqual(NarrationSources.Fallback, approval["narrations"]!["ta"]!["source"]!.GetValue<string>(), "Unedited languages are untouched.");
        var entry = JsonNode.Parse(session.Log.Lines().Last())!;
        Assert.AreEqual(DecisionEvents.Overridden, entry["event"]!.GetValue<string>());
        Assert.AreEqual(proposal.PayloadHash, entry["payloadHash"]!.GetValue<string>(), "The proposal that was overridden.");
        Assert.AreEqual(outcome.Result.PayloadHash, entry["editedPayloadHash"]!.GetValue<string>());
        Assert.AreEqual("Edited fan text.", entry["edits"]!["en"]!["fan"]!.GetValue<string>());
        Assert.AreEqual("tightened", entry["note"]!.GetValue<string>());
    }

    public static IEnumerable<object[]> BlockingEdits =>
    [
        ["no edits", null!],
        ["empty edits", new Dictionary<string, NarrationText>()],
        ["unknown language", new Dictionary<string, NarrationText> { ["fr"] = new("a", "b", "c", "d") }],
        ["empty field", new Dictionary<string, NarrationText> { ["en"] = new("a", " ", "c", "d") }],
        ["link", new Dictionary<string, NarrationText> { ["en"] = new("a", "see https://example.invalid", "c", "d") }],
        ["markup", new Dictionary<string, NarrationText> { ["en"] = new("a", "<b>bold</b>", "c", "d") }],
        ["control character", new Dictionary<string, NarrationText> { ["en"] = new("a", "line\nbreak", "c", "d") }],
        ["too long", new Dictionary<string, NarrationText> { ["en"] = new(new string('a', 101), "b", "c", "d") }],
        ["one bad language among good ones", new Dictionary<string, NarrationText> { ["en"] = new("a", "b", "c", "d"), ["ta"] = new("a", "<i>", "c", "d") }],
    ];

    [TestMethod]
    [DynamicData(nameof(BlockingEdits))]
    public void UnsafeOrMalformedOverridesAreRejectedAndLeaveTheProposalOpen(string description, Dictionary<string, NarrationText>? edits)
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        var outcome = session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Override, edits, null));

        Assert.AreEqual(DecisionFailure.InvalidRequest, outcome.Failure, description);
        Assert.AreEqual(ProposalStates.Pending, Only(session, cue).State, description);
        Assert.AreEqual(proposal.PayloadHash, Only(session, cue).PayloadHash, "A rejected override changes nothing.");
        Assert.AreEqual(NarrationSources.Fallback, Only(session, cue).Narrations["en"].Source, description);
        Assert.AreEqual(1, session.Log.Count, "Nothing is logged for a rejected decision.");
        Assert.IsNotNull(session.Decide(Approve(proposal)).Result, "The operator can still decide normally.");
    }

    [TestMethod]
    public void AdvisoryVerifierFindingsInAnOverrideAreRecordedNotBlocking()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);
        var edits = new Dictionary<string, NarrationText> { ["en"] = new("Edited headline", "He ran 999 m.", "Edited analyst.", "Edited why.") };

        var outcome = session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Override, edits, null));

        Assert.IsNotNull(outcome.Result, outcome.Detail);
        var entry = JsonNode.Parse(session.Log.Lines().Last())!;
        Assert.IsFalse(entry["narrations"]!["en"]!["verifierPassed"]!.GetValue<bool>(), "The person is accountable, the finding is on the record.");
        var narration = Only(session, cue).Narrations["en"];
        Assert.IsFalse(narration.Verification!.Passed);
        Assert.IsTrue(narration.Verification.Failures.Any(failure => failure.Check == NarrationVerifier.Numbers));
    }

    [TestMethod]
    public void ADecisionIsBoundToTheExactPayloadTheOperatorSaw()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        var stale = session.Decide(new DecisionRequest(proposal.ApprovalId, new string('0', 64), DecisionActions.Approve, null, null));
        var truncated = session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash[..32], DecisionActions.Approve, null, null));

        Assert.AreEqual(DecisionFailure.StalePayload, stale.Failure);
        Assert.AreEqual(DecisionFailure.StalePayload, truncated.Failure);
        Assert.AreEqual(ProposalStates.Pending, Only(session, cue).State);
        Assert.IsNull(session.Release(cue));
    }

    [TestMethod]
    public void ADecisionIsFinal()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);

        Assert.IsNotNull(session.Decide(Approve(proposal)).Result);
        var second = session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Hold, null, null));

        Assert.AreEqual(DecisionFailure.AlreadyDecided, second.Failure);
        Assert.AreEqual(ProposalStates.Approved, Only(session, cue).State);
        Assert.AreEqual(2, session.Log.Count, "One proposal and one decision.");
    }

    [TestMethod]
    public void MalformedDecisionsAreRejected()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);
        var cases = new (DecisionRequest? Request, DecisionFailure Expected)[]
        {
            (null, DecisionFailure.InvalidRequest),
            (new DecisionRequest(null, proposal.PayloadHash, "approve", null, null), DecisionFailure.InvalidRequest),
            (new DecisionRequest(proposal.ApprovalId, null, "approve", null, null), DecisionFailure.InvalidRequest),
            (new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, null, null, null), DecisionFailure.InvalidRequest),
            (new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, "APPROVE", null, null), DecisionFailure.InvalidRequest),
            (new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, "delete", null, null), DecisionFailure.InvalidRequest),
            (new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, "approve", null, new string('n', 201)), DecisionFailure.InvalidRequest),
            (new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, "approve", null, "bad\u0007note"), DecisionFailure.InvalidRequest),
            (new DecisionRequest("APR-999", proposal.PayloadHash, "approve", null, null), DecisionFailure.UnknownProposal),
        };

        foreach (var (request, expected) in cases)
        {
            Assert.AreEqual(expected, session.Decide(request!).Failure, request?.Action ?? "null request");
        }

        Assert.AreEqual(ProposalStates.Pending, Only(session, cue).State);
        Assert.AreEqual(1, session.Log.Count);
    }

    [TestMethod]
    public void NarrationThatIsNotReadyInTimeFreezesTheProposalWithLabelledFallback()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var model = new ScriptedNarrationModel(async (facts, _, _) =>
        {
            await release.Task;
            return ScriptedNarrationModel.Ok(Faithful(Cue(facts.CueId)));
        });
        using var harness = new GateHarness(model);
        var session = harness.Start();
        var cue = FirstCue;

        harness.AdvanceTo(session, ProposeAt(cue));
        Assert.IsEmpty(session.Proposals(), "The proposal waits briefly for narration.");
        harness.Time.Advance(harness.Options.NarrationWait);
        WaitUntil(() => session.Proposals().Count == 1);
        var proposal = Only(session, cue);

        Assert.AreEqual(FallbackReasons.NotReady, proposal.Narrations["en"].FallbackReason);
        Assert.AreEqual(FallbackReasons.NotReady, proposal.Narrations["ta"].FallbackReason);

        release.SetResult();
        WaitUntil(() => harness.Service.Status.CallsUsed >= 2);
        Assert.AreEqual(proposal.PayloadHash, Only(session, cue).PayloadHash, "A late model answer never changes what was proposed.");
        Assert.IsNotNull(session.Decide(Approve(proposal)).Result);
        Assert.AreEqual(NarrationSources.Fallback, session.Release(cue)!["approval"]!["narrations"]!["en"]!["source"]!.GetValue<string>());
    }

    [TestMethod]
    public void VerifiedAiNarrationIsFrozenIntoTheProposalAndUsageStaysOnTheDesk()
    {
        var model = new ScriptedNarrationModel((facts, language, _) => Task.FromResult(ScriptedNarrationModel.Ok(
            language == NarrationLanguage.English ? Faithful(Cue(facts.CueId)) : "not json")));
        using var harness = new GateHarness(model);
        var session = harness.Start();
        var cue = FirstCue;

        harness.AdvanceTo(session, ProposeAt(cue));
        WaitUntil(() => session.Proposals().Count == 1);
        var proposal = Only(session, cue);

        Assert.AreEqual(NarrationSources.Ai, proposal.Narrations["en"].Source);
        Assert.AreEqual(1200, proposal.Narrations["en"].Usage!.PromptTokens, "The operator desk sees what each call cost.");
        Assert.IsTrue(proposal.Narrations["en"].Verification!.Passed);
        Assert.AreEqual(FallbackReasons.InvalidOutput, proposal.Narrations["ta"].FallbackReason);

        Assert.IsNotNull(session.Decide(Approve(proposal)).Result);
        var json = session.Release(cue)!.ToJsonString();
        Assert.Contains("\"source\":\"AI\"", json);
        Assert.DoesNotContain("promptTokens", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("verification", json, StringComparison.OrdinalIgnoreCase);
        var logLine = session.Log.Lines().Last();
        Assert.Contains("\"verifierPassed\":true", logLine);
        Assert.DoesNotContain(cue.Headline, logLine, "The log records provenance and hashes, not a second copy of the text.");
    }

    [TestMethod]
    public async Task EveryCueIsHeldAndNeverAiredWhenNobodyDecides()
    {
        using var harness = new GateHarness(autoRun: true);
        var session = harness.Start();

        var items = await harness.RunProgramAsync(session, 0, null, TestContext.CancellationToken);

        Assert.IsEmpty(items.Where(item => item.Kind == MatchStreamKinds.Overlay), "No cue reaches the program feed without a person.");
        Assert.AreEqual(Timeline.Events.Count, items.Count(item => item.Kind == MatchStreamKinds.Event));
        Assert.AreEqual(Timeline.Momentum.Count, items.Count(item => item.Kind == MatchStreamKinds.Momentum));
        Assert.AreEqual(1, items.Count(item => item.Kind == MatchStreamKinds.Complete));
        Assert.AreEqual(MatchStreamKinds.Complete, items[^1].Kind);
        var proposals = session.Proposals();
        Assert.HasCount(session.PlannedCues, proposals);
        Assert.IsTrue(proposals.All(proposal => proposal.State == ProposalStates.AutoHeld), "There is no automatic approval path.");
        var events = session.Log.Lines().Select(line => JsonNode.Parse(line)!["event"]!.GetValue<string>()).ToArray();
        Assert.IsFalse(events.Any(name => name is DecisionEvents.Approved or DecisionEvents.Overridden));
        Assert.AreEqual(session.PlannedCues, events.Count(name => name == DecisionEvents.AutoHeld));
        Assert.IsTrue(DecisionLog.Verify(session.SessionId, session.Log.Lines()).Valid);
    }

    [TestMethod]
    public async Task OnlyApprovedCuesAirAtTheirAirTimeAndEverythingElseStreamsOnTheDelayedClock()
    {
        using var harness = new GateHarness(autoRun: true);
        var session = harness.Start();
        var approved = new HashSet<string>(StringComparer.Ordinal);
        var airTimes = new Dictionary<int, TimeSpan>();

        var items = await harness.RunProgramAsync(session, 0, current =>
        {
            foreach (var proposal in current.Proposals().Where(proposal => proposal.State == ProposalStates.Pending))
            {
                var number = int.Parse(proposal.ApprovalId[4..], System.Globalization.CultureInfo.InvariantCulture);
                var request = number % 2 == 1
                    ? Approve(proposal)
                    : new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Hold, null, null);
                if (current.Decide(request).Result is { State: ProposalStates.Approved })
                {
                    approved.Add(proposal.Cue.OverlayId);
                }
            }
        }, TestContext.CancellationToken);

        var aired = items.Where(item => item.Kind == MatchStreamKinds.Overlay)
            .Select(item => ((JsonNode)item.Payload)["overlayId"]!.GetValue<string>()).ToList();
        CollectionAssert.AreEquivalent(approved.ToList(), aired);
        Assert.IsNotEmpty(aired);
        Assert.IsLessThan(session.PlannedCues, aired.Count, "Held cues stayed off air.");
        foreach (var item in items.Where(item => item.Kind == MatchStreamKinds.Overlay))
        {
            var payload = (JsonNode)item.Payload;
            Assert.IsNotNull(payload["approval"]!["approvalId"]);
            Assert.AreEqual(64, payload["approval"]!["payloadHash"]!.GetValue<string>().Length);
            airTimes[item.Index] = TimeSpan.Zero;
        }

        CollectionAssert.AreEqual(items.Select(item => item.Index).OrderBy(index => index).ToArray(), items.Select(item => item.Index).ToArray(), "Items arrive in feed order.");
        Assert.AreEqual(MatchStreamKinds.Complete, items[^1].Kind);
        Assert.IsTrue(DecisionLog.Verify(session.SessionId, session.Log.Lines()).Valid);
    }

    [TestMethod]
    public async Task HistoryBeforeTheJumpPointIsImmediateAndEverythingAfterItIsDelayedByTheSla()
    {
        using var harness = new GateHarness(autoRun: true);
        var session = harness.Start();
        var arrivals = new List<(StreamItem Item, TimeSpan At)>();
        var items = new List<StreamItem>();
        var consumer = Task.Run(async () =>
        {
            await foreach (var item in session.ProgramAsync(0, TestContext.CancellationToken))
            {
                lock (arrivals)
                {
                    arrivals.Add((item, session.Elapsed));
                }
            }
        }, TestContext.CancellationToken);
        await harness.WaitUntilProgramIsWaitingAsync(TestContext.CancellationToken);
        var spins = 0;
        while (!consumer.IsCompleted)
        {
            if (harness.Time.AdvanceToNextTimer())
            {
                spins = 0;
            }
            else
            {
                await Task.Delay(1, TestContext.CancellationToken);
                Assert.IsLessThan(5_000, ++spins, "The program feed stopped making progress.");
            }
        }

        await consumer;
        items.AddRange(arrivals.Select(arrival => arrival.Item));
        var fromMs = From * 1000;
        foreach (var (item, at) in arrivals.Where(arrival => arrival.Item.Kind != MatchStreamKinds.Overlay))
        {
            var expected = item.TimeMs <= fromMs ? TimeSpan.Zero : Sla + TimeSpan.FromSeconds((item.TimeMs - fromMs) / 1000.0 / Speed);
            Assert.AreEqual(expected.TotalMilliseconds, at.TotalMilliseconds, 1.0, $"{item.Kind} at match {item.TimeMs} ms");
        }

        Assert.IsTrue(arrivals.Any(arrival => arrival.Item.TimeMs <= fromMs && arrival.At == TimeSpan.Zero), "History is delivered at once.");
    }

    [TestMethod]
    public async Task ReconnectingAfterALastEventIdSkipsWhatWasAlreadyDelivered()
    {
        using var harness = new GateHarness(autoRun: true);
        var session = harness.Start();
        var afterIndex = Timeline.Items.First(item => item.TimeMs > From * 1000).Index + 20;

        var items = await harness.RunProgramAsync(session, afterIndex, null, TestContext.CancellationToken);

        Assert.IsTrue(items.All(item => item.Index > afterIndex));
        Assert.HasCount(Timeline.Items.Count(item => item.Index > afterIndex && item.Kind != MatchStreamKinds.Overlay), items);
    }

    [TestMethod]
    public void TheDeskReplaysEverythingThenResumesBySequenceAndSendsHeartbeats()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);
        Assert.IsNotNull(session.Decide(Approve(proposal)).Result);
        var received = new List<DeskMessage>();
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var reader = Task.Run(async () =>
        {
            try
            {
                await foreach (var message in session.DeskAsync(0, stop.Token))
                {
                    lock (received)
                    {
                        received.Add(message);
                    }
                }
            }
            catch (OperationCanceledException)
            {
            }
        }, TestContext.CancellationToken);

        WaitUntil(() => { lock (received) { return received.Count >= 3; } });
        lock (received)
        {
            CollectionAssert.AreEqual(
                new[] { DeskMessageTypes.Session, DeskMessageTypes.Proposal, DeskMessageTypes.Decision },
                received.Take(3).Select(message => message.Type).ToArray());
            Assert.AreEqual(1, received[1].Seq);
            Assert.AreEqual(2, received[2].Seq);
        }

        WaitUntil(() => harness.Time.PendingTimers > 0);
        harness.Time.Advance(harness.Options.Heartbeat);
        WaitUntil(() => { lock (received) { return received.Any(message => message.Type == DeskMessageTypes.Heartbeat); } });
        lock (received)
        {
            Assert.AreEqual(2, received.Single(message => message.Type == DeskMessageTypes.Heartbeat).Seq, "A heartbeat repeats the last sequence number.");
        }

        stop.Cancel();
        reader.Wait(TestContext.CancellationToken);
    }

    [TestMethod]
    public async Task AResumedDeskStreamSendsOnlyWhatItMissed()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = FirstCue;
        harness.AdvanceTo(session, ProposeAt(cue));
        var proposal = Only(session, cue);
        Assert.IsNotNull(session.Decide(Approve(proposal)).Result);
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var types = new List<string>();

        await foreach (var message in session.DeskAsync(1, stop.Token))
        {
            types.Add(message.Type);
            if (types.Count == 2)
            {
                break;
            }
        }

        CollectionAssert.AreEqual(new[] { DeskMessageTypes.Session, DeskMessageTypes.Decision }, types);
    }

    [TestMethod]
    public void SessionsRefuseSpeedsAboveTheCapAndStartsOutsideTheMatch()
    {
        using var harness = new GateHarness();

        Assert.AreEqual(SessionCreateFailure.InvalidSpeed, harness.Store.Create(10.5, 0).Failure);
        Assert.AreEqual(SessionCreateFailure.InvalidSpeed, harness.Store.Create(60, 0).Failure);
        Assert.AreEqual(SessionCreateFailure.InvalidSpeed, harness.Store.Create(0.5, 0).Failure);
        Assert.AreEqual(SessionCreateFailure.InvalidSpeed, harness.Store.Create(double.NaN, 0).Failure);
        Assert.AreEqual(SessionCreateFailure.InvalidStart, harness.Store.Create(10, -1).Failure);
        Assert.AreEqual(SessionCreateFailure.InvalidStart, harness.Store.Create(10, 5_521).Failure);
        Assert.IsNotNull(harness.Store.Create(10, 5_520).Session);
        Assert.IsNotNull(harness.Store.Create(1, 0).Session);
    }

    [TestMethod]
    public void TheNumberOfLiveSessionsIsBoundedAndExpiredSessionsAreEvicted()
    {
        using var harness = new GateHarness(options: new GateOptions { MaxSessions = 2, TickInterval = TimeSpan.FromMilliseconds(500) });
        var first = harness.Start(10, 5_000);
        harness.Start(10, 5_000);

        Assert.AreEqual(SessionCreateFailure.Full, harness.Store.Create(10, 5_000).Failure);

        harness.Time.Advance(first.ExpiresAt - harness.Time.GetUtcNow() + TimeSpan.FromSeconds(1));

        Assert.IsNull(harness.Store.Get(first.SessionId), "An expired session is gone.");
        Assert.IsNotNull(harness.Store.Create(10, 5_000).Session, "Its slot is free again.");
    }

    [TestMethod]
    public void SessionIdsAreUnguessableAndMalformedIdsNeverMatch()
    {
        using var harness = new GateHarness();
        var first = harness.Start();
        var second = harness.Start();

        Assert.AreNotEqual(first.SessionId, second.SessionId);
        Assert.AreEqual(32, first.SessionId.Length);
        Assert.IsTrue(GateSessionStore.IsValidId(first.SessionId));
        Assert.AreSame(first, harness.Store.Get(first.SessionId));
        foreach (var id in new[] { null, string.Empty, "x", first.SessionId.ToUpperInvariant(), first.SessionId + "0", "../" + first.SessionId, new string('0', 32) })
        {
            Assert.IsNull(harness.Store.Get(id), id);
        }
    }

    [TestMethod]
    public void DisposingASessionStopsItsPendingProposalsFromBeingCreated()
    {
        using var harness = new GateHarness();
        var session = harness.Start();
        session.Dispose();

        harness.AdvanceTo(session, TimeSpan.FromMinutes(5));

        Assert.IsEmpty(session.Proposals());
    }

    [TestMethod]
    public void GateOptionsRejectValuesThatWouldBreakTheDesign()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new GateOptions { MaximumSpeed = 60 }.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new GateOptions { SlaSeconds = 0 }.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new GateOptions { SlaSeconds = 10, NarrationWait = TimeSpan.FromSeconds(8) }.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new GateOptions { MaxSessions = 0 }.Validate());
        new GateOptions().Validate();
    }

    private static void WaitUntil(Func<bool> condition)
    {
        var deadline = System.Diagnostics.Stopwatch.StartNew();
        while (!condition())
        {
            Assert.IsLessThan(10_000, deadline.ElapsedMilliseconds, "Timed out waiting for a condition.");
            Thread.Sleep(2);
        }
    }
}
