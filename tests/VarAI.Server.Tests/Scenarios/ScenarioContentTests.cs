using System.Text.Json;
using VarAI.Contracts;
using VarAI.Scenarios;

namespace VarAI.Server.Tests.Scenarios;

[TestClass]
public sealed class ScenarioContentTests
{
    public required TestContext TestContext { get; set; }

    public static IEnumerable<object[]> Audiences =>
        from id in Enum.GetValues<ScenarioId>()
        from audience in Enum.GetValues<Audience>()
        select new object[] { id, audience };

    [TestMethod]
    public async Task DeliveredLibraryContainsCompleteSyntheticRecordsAndOrderedEvents()
    {
        var scenarios = await ScenarioTestData.LoadAsync(TestContext.CancellationToken);
        CollectionAssert.AreEqual(Enum.GetValues<ScenarioId>(), scenarios.Select(scenario => scenario.Id).ToArray());
        foreach (var scenario in scenarios)
        {
            ContractRules.Scenario(scenario);
            Assert.AreEqual("0.2", scenario.SchemaVersion);
            Assert.AreEqual("synthetic-1.0.0", scenario.ContentVersion);
            Assert.IsTrue(scenario.Synthetic);
            StringAssert.Contains(scenario.Label, "Synthetic");
            StringAssert.Contains(scenario.Label, scenario.ContentVersion);
            Assert.AreEqual("Alder Vale Comets", scenario.Match.HomeTeam);
            Assert.AreEqual("Brindle Reach Lanterns", scenario.Match.AwayTeam);
            Assert.AreEqual(67, scenario.Match.IncidentMinute);
            Assert.AreEqual(new Score(0, 0), scenario.Match.ScoreBefore);
            CollectionAssert.AreEquivalent(Enum.GetValues<FactKey>(), scenario.Facts.Select(fact => fact.Key).ToArray());
            Assert.IsTrue(scenario.Facts.All(fact => fact.SourceLabel.StartsWith("Synthetic authored", StringComparison.Ordinal)));
            CollectionAssert.AreEqual(Enum.GetValues<EventKind>(), scenario.Events.Select(item => item.Kind).ToArray());
            CollectionAssert.AreEqual(new[] { 0, 1_200, 2_100, 3_000, 4_400, 6_000 },
                scenario.Events.Select(item => item.OffsetMs).ToArray());
            StringAssert.Contains(scenario.Events[0].Label, "compressed demonstration timing");
            StringAssert.Contains(scenario.Events[^1].Label, "evidence pack ready");
            CollectionAssert.AreEquivalent(scenario.Facts.Select(fact => fact.Id).ToArray(),
                scenario.Events.SelectMany(item => item.RevealFactIds).ToArray());
        }
    }

    [TestMethod]
    public async Task PairChangesOnlyReceiverVersusSecondLastAndHasReciprocalLinks()
    {
        var scenarios = await ScenarioTestData.LoadAsync(TestContext.CancellationToken);
        var first = scenarios[0];
        var second = scenarios[1];
        ContractRules.Pair(first, second);
        var changed = first.Facts.Where(left => left != second.Facts.Single(right => right.Key == left.Key)).ToArray();
        Assert.HasCount(1, changed);
        Assert.AreEqual(FactKey.ReceiverVsSecondLast, changed[0].Key);
        Assert.AreEqual(new PositionFactValue(ReceiverPosition.Nearer), changed[0].Value);
        Assert.AreEqual(new PositionFactValue(ReceiverPosition.Level),
            second.Facts.Single(fact => fact.Key == FactKey.ReceiverVsSecondLast).Value);
        Assert.AreEqual(new Comparison("PAIR-01", ScenarioId.S2, FactKey.ReceiverVsSecondLast), first.Comparison);
        Assert.AreEqual(new Comparison("PAIR-01", ScenarioId.S1, FactKey.ReceiverVsSecondLast), second.Comparison);
        Assert.AreEqual(first.Match, second.Match);
        Assert.AreEqual(first.ContentVersion, second.ContentVersion);
        CollectionAssert.AreEqual(first.Rules.ToArray(), second.Rules.ToArray());
        Assert.AreEqual(ContractJson.Write(first.Events), ContractJson.Write(second.Events));
        Assert.AreEqual(76, first.Diagram.Markers.Single(marker => marker.Role == MarkerRole.Receiver).X);
        Assert.AreEqual(70, second.Diagram.Markers.Single(marker => marker.Role == MarkerRole.Receiver).X);
        Assert.AreEqual(first.Diagram.SecondLastReferenceX, second.Diagram.SecondLastReferenceX);
    }

    [TestMethod]
    public async Task MissingEvidenceRemainsExplicitlyNullIncludingSerializedOutput()
    {
        var scenario = (await ScenarioTestData.LoadAsync(TestContext.CancellationToken))[2];
        Assert.IsNull(scenario.SuppliedReviewOutcome);
        Assert.IsNull(scenario.ScoreAfterReview);
        Assert.IsNull(scenario.Comparison);
        Assert.AreEqual(Interpretation.InsufficientEvidence, scenario.Interpretation);
        Assert.AreEqual(OriginalDecision.GoalAwarded, scenario.OriginalDecision);
        Assert.AreEqual(DiagramStatus.Unavailable, scenario.Diagram.Status);
        Assert.IsEmpty(scenario.Diagram.Markers);
        Assert.IsNull(scenario.Diagram.SecondLastReferenceX);
        var observation = scenario.Facts.Single(fact => fact.Key == FactKey.PassTimeObserved);
        Assert.AreEqual(EvidenceStatus.Supplied, observation.Status);
        Assert.AreEqual(new BooleanFactValue(false), observation.Value);
        var missing = scenario.Facts.Where(fact => fact.Status == EvidenceStatus.Missing).ToArray();
        CollectionAssert.AreEquivalent(new[] { FactKey.ReceiverAheadOfBall, FactKey.ReceiverVsSecondLast },
            missing.Select(fact => fact.Key).ToArray());
        Assert.IsTrue(missing.All(fact => fact.Value is null));
        Assert.AreEqual(new BooleanFactValue(true),
            scenario.Facts.Single(fact => fact.Key == FactKey.ReceiverInOpponentsHalf).Value);

        using var json = JsonDocument.Parse(ContractJson.Write(scenario));
        foreach (var name in new[] { "suppliedReviewOutcome", "scoreAfterReview", "comparison" })
        {
            Assert.AreEqual(JsonValueKind.Null, json.RootElement.GetProperty(name).ValueKind);
        }
        Assert.AreEqual(JsonValueKind.Null, json.RootElement.GetProperty("diagram").GetProperty("secondLastReferenceX").ValueKind);
        Assert.HasCount(2, json.RootElement.GetProperty("facts").EnumerateArray()
            .Where(fact => fact.GetProperty("value").ValueKind == JsonValueKind.Null).ToArray());
    }

    [TestMethod]
    [DataRow(ScenarioId.S1, Interpretation.OffsideSupported, ReviewOutcome.GoalDisallowed, 0)]
    [DataRow(ScenarioId.S2, Interpretation.NoOffsideSupported, ReviewOutcome.GoalConfirmed, 1)]
    public async Task SuppliedOutcomeIsSeparateFromOriginalAward(
        ScenarioId id, Interpretation interpretation, ReviewOutcome outcome, int homeScore)
    {
        var scenario = (await ScenarioTestData.LoadAsync(TestContext.CancellationToken)).Single(item => item.Id == id);
        Assert.AreEqual(OriginalDecision.GoalAwarded, scenario.OriginalDecision);
        Assert.AreEqual(outcome, scenario.SuppliedReviewOutcome);
        Assert.AreEqual(new Score(homeScore, 0), scenario.ScoreAfterReview);
        Assert.AreEqual(interpretation, scenario.Interpretation);
        Assert.AreEqual(interpretation, scenario.AuthoredExplanations.Casual.Interpretation);
        Assert.AreEqual(interpretation, scenario.AuthoredExplanations.Analyst.Interpretation);
    }

    [TestMethod]
    [DynamicData(nameof(Audiences))]
    public async Task AllSixAuthoredBodiesHaveBoundedCitedClaimsAndHonestLimitations(ScenarioId id, Audience audience)
    {
        var scenario = (await ScenarioTestData.LoadAsync(TestContext.CancellationToken)).Single(item => item.Id == id);
        var body = ScenarioTestData.Body(scenario, audience);
        ContractRules.Body(body, scenario, audience);
        Assert.AreEqual(SourceMode.Authored, body.SourceMode);
        Assert.AreEqual(scenario.Interpretation, body.Interpretation);
        Assert.AreEqual(id == ScenarioId.S3 ? ResponseStatus.Limited : ResponseStatus.Complete, body.Status);
        var wordCount = ContractRules.WordCount(body.Headline.Text) + body.Points.Sum(point => ContractRules.WordCount(point.Text));
        Assert.IsLessThanOrEqualTo(audience == Audience.Casual ? 90 : 220, wordCount);
        Assert.IsLessThanOrEqualTo(40, ContractRules.WordCount(body.Recap.Text));
        TestContext.WriteLine($"{id}/{audience}: explanation {wordCount}, recap {ContractRules.WordCount(body.Recap.Text)} words.");
        Assert.IsTrue(body.Limitations.Any(text => text.Contains("Synthetic authored", StringComparison.Ordinal)));
        Assert.IsTrue(body.Limitations.Any(text => text.Contains("Provisional", StringComparison.Ordinal) &&
            text.Contains("no expert review", StringComparison.Ordinal)));
        Assert.IsTrue(body.Limitations.Any(text => text.Contains("not footage", StringComparison.Ordinal)));
        if (id == ScenarioId.S3)
        {
            Assert.IsTrue(body.Limitations.Any(text => text.Contains("neither confirmation nor disallowance", StringComparison.Ordinal)));
        }
        foreach (var claim in ScenarioTestData.Claims(body))
        {
            Assert.IsNotEmpty(claim.EvidenceIds);
            Assert.IsTrue(claim.EvidenceIds.All(evidenceId =>
                ContractRules.ContextEvidenceIds.Contains(evidenceId) || scenario.Facts.Any(fact => fact.Id == evidenceId)));
            Assert.IsTrue(claim.RuleIds.All(ruleId => scenario.Rules.Any(rule => rule.Id == ruleId)));
            Assert.IsFalse(claim.Text.Contains('%', StringComparison.Ordinal));
        }
        CollectionAssert.IsSubsetOf(new[] { "DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-AFTER" },
            body.Recap.EvidenceIds.ToArray());
    }

    [TestMethod]
    public async Task RuleMetadataMatchesTheSourceCheckedEditionWithoutExpertClaims()
    {
        var scenarios = await ScenarioTestData.LoadAsync(TestContext.CancellationToken);
        var expected = new[]
        {
            ("R-L11-POSITION", "11.1 — Offside position",
                "https://www.theifab.com/laws/latest/offside/#offside-position"),
            ("R-L11-INVOLVEMENT", "11.2 — Offside offence; interfering with play",
                "https://www.theifab.com/laws/latest/offside/#offside-offence"),
            ("R-VAR-AUTHORITY", "1 — Principles 4–6; 2(a) — Goal/no goal",
                "https://www.theifab.com/laws/latest/video-assistant-referee-var-protocol/#principles")
        };
        foreach (var scenario in scenarios)
        {
            Assert.HasCount(3, scenario.Rules);
            foreach (var (id, section, url) in expected)
            {
                var rule = scenario.Rules.Single(item => item.Id == id);
                Assert.AreEqual("IFAB", rule.Publisher);
                Assert.AreEqual("2026/27", rule.Edition);
                Assert.AreEqual("2026-10-22", rule.CheckedOn);
                Assert.AreEqual(ReviewStatus.SourceChecked, rule.ReviewStatus);
                Assert.AreEqual(section, rule.Section);
                Assert.AreEqual(url, rule.Url);
                Assert.IsFalse(string.IsNullOrWhiteSpace(rule.Summary));
            }
        }
    }

    [TestMethod]
    public async Task TeamLabelChangesCannotChangeAuthoredInterpretations()
    {
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        var relabelled = records.Select(scenario => scenario with
        {
            Match = scenario.Match with { HomeTeam = "Fictional North", AwayTeam = "Fictional South" }
        }).ToArray();
        var repository = new SyntheticScenarioRepository(relabelled);
        foreach (var original in records)
        {
            var result = await repository.FindAsync(original.Id, TestContext.CancellationToken);
            Assert.IsNotNull(result);
            Assert.AreEqual(original.Interpretation, result.Interpretation);
            Assert.AreEqual(original.SuppliedReviewOutcome, result.SuppliedReviewOutcome);
            Assert.AreEqual(original.AuthoredExplanations.Casual.Interpretation, result.AuthoredExplanations.Casual.Interpretation);
            Assert.AreEqual(original.AuthoredExplanations.Analyst.Interpretation, result.AuthoredExplanations.Analyst.Interpretation);
        }
    }

    [TestMethod]
    public async Task CoordinatesAreNotUsedToDeriveFactsOrOutcomes()
    {
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        var originals = records.Select(scenario => ContractJson.Write(scenario.Facts)).ToArray();
        for (var index = 0; index < 2; index++)
        {
            records[index] = records[index] with
            {
                Diagram = records[index].Diagram with
                {
                    Markers = records[index].Diagram.Markers.Select(marker => marker with { X = 1, Y = 99 }).ToArray(),
                    SecondLastReferenceX = 2
                }
            };
        }
        var repository = new SyntheticScenarioRepository(records);
        for (var index = 0; index < 2; index++)
        {
            var scenario = await repository.FindAsync(records[index].Id, TestContext.CancellationToken);
            Assert.IsNotNull(scenario);
            Assert.AreEqual(originals[index], ContractJson.Write(scenario.Facts));
            Assert.AreEqual(records[index].Interpretation, scenario.Interpretation);
            Assert.AreEqual(records[index].SuppliedReviewOutcome, scenario.SuppliedReviewOutcome);
        }
    }

    [TestMethod]
    public async Task DerivedEventWordingDoesNotCountAsASecondFootballFact()
    {
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        var originalFacts = ContractJson.Write(records[1].Facts);
        records[1] = records[1] with
        {
            Events = records[1].Events.Select(item => item.Kind == EventKind.ReviewReady
                ? item with { Label = "Prototype evidence pack ready; this variant has a supplied confirmation, not an official verdict." }
                : item).ToArray()
        };
        var repository = new SyntheticScenarioRepository(records);
        var result = await repository.FindAsync(ScenarioId.S2, TestContext.CancellationToken);
        Assert.IsNotNull(result);
        Assert.AreEqual(originalFacts, ContractJson.Write(result.Facts));
        Assert.AreEqual(Interpretation.NoOffsideSupported, result.Interpretation);
    }
}
