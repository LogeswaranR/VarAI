using VarAI.Contracts;
using VarAI.Scenarios;

namespace VarAI.Server.Tests.Scenarios;

[TestClass]
public sealed class ScenarioIntegrityTests
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    [DataRow("duplicate-scenario-id")]
    [DataRow("missing-scenario")]
    [DataRow("extra-scenario")]
    [DataRow("unknown-scenario-id")]
    [DataRow("old-schema")]
    [DataRow("empty-content-version")]
    [DataRow("not-synthetic")]
    [DataRow("duplicate-fact-id")]
    [DataRow("duplicate-fact-key")]
    [DataRow("reserved-fact-id")]
    [DataRow("wrong-fact-value-type")]
    [DataRow("unsupported-fact-value-type")]
    [DataRow("empty-fact-provenance")]
    [DataRow("duplicate-rule-id")]
    [DataRow("non-primary-rule-url")]
    [DataRow("wrong-rule-edition")]
    [DataRow("invalid-source-check-date")]
    [DataRow("missing-source-check-date")]
    [DataRow("unsubstantiated-expert-review")]
    [DataRow("duplicate-event-id")]
    [DataRow("negative-event-time")]
    [DataRow("equal-event-times")]
    [DataRow("decreasing-event-times")]
    [DataRow("wrong-event-stage-order")]
    [DataRow("missing-review-ready")]
    [DataRow("repeated-review-ready")]
    [DataRow("unknown-event-reference")]
    [DataRow("duplicate-event-reference")]
    [DataRow("duplicate-marker-id")]
    [DataRow("invalid-marker-coordinate")]
    [DataRow("nonfinite-marker-coordinate")]
    [DataRow("nonfinite-reference-line")]
    [DataRow("unknown-claim-evidence")]
    [DataRow("unknown-claim-rule")]
    [DataRow("unknown-recap-evidence")]
    [DataRow("duplicate-claim-id")]
    [DataRow("duplicate-claim-reference")]
    [DataRow("unsupported-claim")]
    [DataRow("rule-claim-without-fact")]
    [DataRow("empty-limitations")]
    [DataRow("blank-limitation")]
    [DataRow("casual-word-limit")]
    [DataRow("analyst-word-limit")]
    [DataRow("recap-word-limit")]
    [DataRow("wrong-explanation-mode")]
    [DataRow("wrong-audience-interpretation")]
    [DataRow("wrong-original-decision")]
    [DataRow("inconsistent-review-outcome")]
    [DataRow("inconsistent-after-score")]
    [DataRow("noncanonical-start-score")]
    [DataRow("S2-second-independent-fact")]
    [DataRow("S2-wrong-comparison-key")]
    [DataRow("S2-nonreciprocal-comparison")]
    [DataRow("S2-wrong-after-score")]
    [DataRow("S3-invented-ball-relation")]
    [DataRow("S3-invented-second-last-relation")]
    [DataRow("S3-missing-value-marked-supplied")]
    [DataRow("S3-invented-pass-observation")]
    [DataRow("S3-invented-review-outcome")]
    [DataRow("S3-invented-final-score")]
    [DataRow("S3-invented-marker")]
    [DataRow("S3-invented-reference-line")]
    [DataRow("S3-invented-comparison")]
    [DataRow("S3-complete-explanation")]
    [DataRow("null-scenario")]
    [DataRow("null-facts")]
    [DataRow("null-fact")]
    [DataRow("null-match")]
    [DataRow("null-diagram")]
    [DataRow("null-explanations")]
    [DataRow("null-claim")]
    [DataRow("null-claim-references")]
    public async Task InvalidDeliveredContentFailsClosedWithAContractViolation(string mutation)
    {
        var original = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        var invalid = Mutate(original, mutation);
        var error = Assert.ThrowsExactly<ContractViolationException>(() => new SyntheticScenarioRepository(invalid), mutation);
        Assert.IsFalse(string.IsNullOrWhiteSpace(error.Message));
    }

    [TestMethod]
    [DataRow("match-context")]
    [DataRow("rule-metadata")]
    [DataRow("pair-content-version")]
    public async Task IndividuallyValidRecordsStillMustSatisfyLibraryAndPairInvariants(string mutation)
    {
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        records[1] = mutation switch
        {
            "match-context" => records[1] with { Match = records[1].Match with { IncidentMinute = 68 } },
            "rule-metadata" => records[1] with
            {
                Rules = records[1].Rules.Select((rule, index) => index == 0 ? rule with { Summary = "A different summary." } : rule).ToArray()
            },
            "pair-content-version" => records[1] with { ContentVersion = "synthetic-1.0.1" },
            _ => throw new ArgumentException("Unknown pair-invariant test case.", nameof(mutation))
        };
        foreach (var scenario in records)
        {
            ContractRules.Scenario(scenario);
        }
        Assert.ThrowsExactly<ContractViolationException>(() => new SyntheticScenarioRepository(records), mutation);
    }

    [TestMethod]
    public void NullDatasetIsAnExplicitArgumentError()
    {
        var error = Assert.ThrowsExactly<ArgumentNullException>(() => new SyntheticScenarioRepository(null!));
        Assert.AreEqual("scenarios", error.ParamName);
    }

    [TestMethod]
    public async Task FailedConstructionCannotModifyAnExistingLibraryOrRepairInvalidInput()
    {
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        var repository = new SyntheticScenarioRepository(records);
        records[2] = records[2] with { ScoreAfterReview = new(1, 0) };
        var invalidBefore = ContractJson.Write(records);
        Assert.ThrowsExactly<ContractViolationException>(() => new SyntheticScenarioRepository(records));
        Assert.AreEqual(invalidBefore, ContractJson.Write(records));
        var missing = await repository.FindAsync(ScenarioId.S3, TestContext.CancellationToken);
        Assert.IsNotNull(missing);
        Assert.IsNull(missing.ScoreAfterReview);
        Assert.IsNull(missing.SuppliedReviewOutcome);
    }

    private static Scenario[] Mutate(Scenario[] records, string mutation)
    {
        if (mutation == "missing-scenario")
        {
            return records[..2];
        }
        if (mutation == "extra-scenario")
        {
            return [.. records, records[0]];
        }
        if (mutation == "duplicate-scenario-id")
        {
            return [records[0], records[0], records[2]];
        }
        if (mutation == "null-scenario")
        {
            return [records[0], records[1], null!];
        }
        var index = mutation.StartsWith("S3-", StringComparison.Ordinal) ? 2
            : mutation.StartsWith("S2-", StringComparison.Ordinal) ? 1 : 0;
        records[index] = MutateScenario(records[index], mutation);
        return records;
    }

    private static Scenario MutateScenario(Scenario scenario, string mutation) => mutation switch
    {
        "unknown-scenario-id" => scenario with { Id = (ScenarioId)100 },
        "old-schema" => scenario with { SchemaVersion = "0.1" },
        "empty-content-version" => scenario with { ContentVersion = "" },
        "not-synthetic" => scenario with { Synthetic = false },
        "duplicate-fact-id" => ChangeFact(scenario, FactKey.ReceiverInOpponentsHalf, fact => fact with { Id = "F-PASS" }),
        "duplicate-fact-key" => ChangeFact(scenario, FactKey.ReceiverInOpponentsHalf, fact => fact with { Key = FactKey.PassTimeObserved }),
        "reserved-fact-id" => ChangeFact(scenario, FactKey.PassTimeObserved, fact => fact with { Id = "DECISION-REVIEW" }),
        "wrong-fact-value-type" => ChangeFact(scenario, FactKey.ReceiverVsSecondLast, fact => fact with { Value = new BooleanFactValue(true) }),
        "unsupported-fact-value-type" => ChangeFact(scenario, FactKey.ReceiverVsSecondLast, fact => fact with { Value = new UnknownFactValue() }),
        "empty-fact-provenance" => ChangeFact(scenario, FactKey.PassTimeObserved, fact => fact with { SourceLabel = " " }),
        "duplicate-rule-id" => scenario with { Rules = [scenario.Rules[0], scenario.Rules[0], scenario.Rules[2]] },
        "non-primary-rule-url" => ChangeRule(scenario, rule => rule with { Url = "https://example.com/offside" }),
        "wrong-rule-edition" => ChangeRule(scenario, rule => rule with { Edition = "2025/26" }),
        "invalid-source-check-date" => ChangeRule(scenario, rule => rule with { CheckedOn = "2026-02-30" }),
        "missing-source-check-date" => ChangeRule(scenario, rule => rule with { CheckedOn = null }),
        "unsubstantiated-expert-review" => ChangeRule(scenario, rule => rule with { ReviewStatus = ReviewStatus.ExpertReviewed }),
        "duplicate-event-id" => ChangeEvent(scenario, 1, item => item with { Id = "E-PASS" }),
        "negative-event-time" => ChangeEvent(scenario, 0, item => item with { OffsetMs = -1 }),
        "equal-event-times" => ChangeEvent(scenario, 1, item => item with { OffsetMs = 0 }),
        "decreasing-event-times" => ChangeEvent(scenario, 2, item => item with { OffsetMs = 500 }),
        "wrong-event-stage-order" => ChangeEvent(scenario, 1, item => item with { Kind = EventKind.Shot }),
        "missing-review-ready" => scenario with { Events = scenario.Events.Take(5).ToArray() },
        "repeated-review-ready" => scenario with
        {
            Events = [.. scenario.Events, new("E-EXTRA", 7_000, EventKind.ReviewReady, "Another ready stage", [])]
        },
        "unknown-event-reference" => ChangeEvent(scenario, 0, item => item with { RevealFactIds = ["F-UNKNOWN"] }),
        "duplicate-event-reference" => ChangeEvent(scenario, 0, item => item with { RevealFactIds = ["F-PASS", "F-PASS"] }),
        "duplicate-marker-id" => scenario with
        {
            Diagram = scenario.Diagram with { Markers = [scenario.Diagram.Markers[0], scenario.Diagram.Markers[0]] }
        },
        "invalid-marker-coordinate" => scenario with
        {
            Diagram = scenario.Diagram with { Markers = [scenario.Diagram.Markers[0] with { X = 101 }] }
        },
        "nonfinite-marker-coordinate" => scenario with
        {
            Diagram = scenario.Diagram with { Markers = [scenario.Diagram.Markers[0] with { X = double.NaN }] }
        },
        "nonfinite-reference-line" => scenario with
        {
            Diagram = scenario.Diagram with { SecondLastReferenceX = double.PositiveInfinity }
        },
        "unknown-claim-evidence" => ChangeCasual(scenario, body => body with { Headline = body.Headline with { EvidenceIds = ["F-UNKNOWN"] } }),
        "unknown-claim-rule" => ChangeCasual(scenario, body => body with { Headline = body.Headline with { RuleIds = ["R-UNKNOWN"] } }),
        "unknown-recap-evidence" => ChangeCasual(scenario, body => body with { Recap = body.Recap with { EvidenceIds = ["MATCH-UNKNOWN"] } }),
        "duplicate-claim-id" => ChangeCasual(scenario, body => body with { Recap = body.Recap with { Id = body.Headline.Id } }),
        "duplicate-claim-reference" => ChangeCasual(scenario, body => body with { Headline = body.Headline with { EvidenceIds = ["F-PASS", "F-PASS"] } }),
        "unsupported-claim" => ChangeCasual(scenario, body => body with { Headline = body.Headline with { EvidenceIds = [], RuleIds = [] } }),
        "rule-claim-without-fact" => ChangeCasual(scenario, body => body with { Headline = body.Headline with { EvidenceIds = ["DECISION-REVIEW"] } }),
        "empty-limitations" => ChangeCasual(scenario, body => body with { Limitations = [] }),
        "blank-limitation" => ChangeCasual(scenario, body => body with { Limitations = [" "] }),
        "casual-word-limit" => ChangeCasual(scenario, body => body with { Headline = body.Headline with { Text = Words(91) } }),
        "analyst-word-limit" => scenario with
        {
            AuthoredExplanations = scenario.AuthoredExplanations with
            {
                Analyst = scenario.AuthoredExplanations.Analyst with
                {
                    Headline = scenario.AuthoredExplanations.Analyst.Headline with { Text = Words(221) }
                }
            }
        },
        "recap-word-limit" => ChangeCasual(scenario, body => body with { Recap = body.Recap with { Text = Words(41) } }),
        "wrong-explanation-mode" => ChangeCasual(scenario, body => body with { SourceMode = SourceMode.LiveAi }),
        "wrong-audience-interpretation" => ChangeCasual(scenario, body => body with { Interpretation = Interpretation.NoOffsideSupported }),
        "wrong-original-decision" => scenario with { OriginalDecision = (OriginalDecision)100 },
        "inconsistent-review-outcome" => scenario with { SuppliedReviewOutcome = ReviewOutcome.GoalConfirmed },
        "inconsistent-after-score" => scenario with { ScoreAfterReview = new(1, 0) },
        "noncanonical-start-score" => scenario with { Match = scenario.Match with { ScoreBefore = new(2, 2) }, ScoreAfterReview = new(2, 2) },
        "S2-second-independent-fact" => ChangeFact(scenario, FactKey.ReceiverAheadOfBall, fact => fact with { Value = new BooleanFactValue(false) }),
        "S2-wrong-comparison-key" => scenario with { Comparison = scenario.Comparison! with { ChangedFactKey = FactKey.ReceiverAheadOfBall } },
        "S2-nonreciprocal-comparison" => scenario with { Comparison = scenario.Comparison! with { OtherScenarioId = ScenarioId.S3 } },
        "S2-wrong-after-score" => scenario with { ScoreAfterReview = new(0, 0) },
        "S3-invented-ball-relation" => ChangeFact(scenario, FactKey.ReceiverAheadOfBall,
            fact => fact with { Value = new BooleanFactValue(true), Status = EvidenceStatus.Supplied }),
        "S3-invented-second-last-relation" => ChangeFact(scenario, FactKey.ReceiverVsSecondLast,
            fact => fact with { Value = new PositionFactValue(ReceiverPosition.Level), Status = EvidenceStatus.Supplied }),
        "S3-missing-value-marked-supplied" => ChangeFact(scenario, FactKey.ReceiverAheadOfBall, fact => fact with { Status = EvidenceStatus.Supplied }),
        "S3-invented-pass-observation" => ChangeFact(scenario, FactKey.PassTimeObserved, fact => fact with { Value = new BooleanFactValue(true) }),
        "S3-invented-review-outcome" => scenario with { SuppliedReviewOutcome = ReviewOutcome.GoalConfirmed },
        "S3-invented-final-score" => scenario with { ScoreAfterReview = new(1, 0) },
        "S3-invented-marker" => scenario with
        {
            Diagram = scenario.Diagram with { Markers = [new("M-INVENTED", MarkerRole.Receiver, "Invented receiver", 70, 50)] }
        },
        "S3-invented-reference-line" => scenario with { Diagram = scenario.Diagram with { SecondLastReferenceX = 70 } },
        "S3-invented-comparison" => scenario with { Comparison = new("PAIR-01", ScenarioId.S1, FactKey.ReceiverVsSecondLast) },
        "S3-complete-explanation" => ChangeCasual(scenario, body => body with { Status = ResponseStatus.Complete }),
        "null-facts" => scenario with { Facts = null! },
        "null-fact" => scenario with { Facts = [null!, .. scenario.Facts.Skip(1)] },
        "null-match" => scenario with { Match = null! },
        "null-diagram" => scenario with { Diagram = null! },
        "null-explanations" => scenario with { AuthoredExplanations = null! },
        "null-claim" => ChangeCasual(scenario, body => body with { Headline = null! }),
        "null-claim-references" => ChangeCasual(scenario, body => body with { Headline = body.Headline with { EvidenceIds = null! } }),
        _ => throw new ArgumentException("Unknown invalid-content test case.", nameof(mutation))
    };

    private static Scenario ChangeFact(Scenario scenario, FactKey key, Func<Fact, Fact> change) =>
        scenario with { Facts = scenario.Facts.Select(fact => fact.Key == key ? change(fact) : fact).ToArray() };

    private static Scenario ChangeRule(Scenario scenario, Func<RuleReference, RuleReference> change) =>
        scenario with { Rules = scenario.Rules.Select((rule, index) => index == 0 ? change(rule) : rule).ToArray() };

    private static Scenario ChangeEvent(Scenario scenario, int target, Func<ReplayEvent, ReplayEvent> change) =>
        scenario with { Events = scenario.Events.Select((item, index) => index == target ? change(item) : item).ToArray() };

    private static Scenario ChangeCasual(Scenario scenario, Func<ExplanationBody, ExplanationBody> change) =>
        scenario with { AuthoredExplanations = scenario.AuthoredExplanations with { Casual = change(scenario.AuthoredExplanations.Casual) } };

    private static string Words(int count) => string.Join(' ', Enumerable.Repeat("word", count));

    private sealed record UnknownFactValue : IFactValue;
}
