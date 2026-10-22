using System.Text.Json;
using System.Text.Json.Nodes;
using VarAI.Contracts;
using VarAI.ContractStubs;

namespace VarAI.Server.Tests;

[TestClass]
public sealed class ContractTests
{
    public required TestContext TestContext { get; set; }

    public static IEnumerable<object[]> InvalidScenarios
    {
        get
        {
            using var document = JsonDocument.Parse(StubData.ReadResource("invalid-scenarios.json"));
            return document.RootElement.EnumerateArray()
                .Select(item => new object[] { item.GetProperty("name").GetString()!, item.GetRawText() }).ToArray();
        }
    }

    public static IEnumerable<object[]> Matrix =>
        from id in Enum.GetValues<ScenarioId>()
        from audience in Enum.GetValues<Audience>()
        from mode in Enum.GetValues<SourceMode>()
        select new object[] { id, audience, mode };

    [TestMethod]
    public void FixturesContainTheThreeDraftScenariosAndSevenErrors()
    {
        var scenarios = StubData.Scenarios();
        Assert.HasCount(3, scenarios);
        Assert.HasCount(7, StubData.Errors());
        foreach (var scenario in scenarios)
        {
            Assert.IsTrue(scenario.Synthetic);
            StringAssert.StartsWith(scenario.ContentVersion, "stub-");
            Assert.IsTrue(scenario.Rules.All(rule =>
                rule.Edition == "2026/27" && rule.CheckedOn is null && rule.ReviewStatus == ReviewStatus.Draft));
        }
        var missing = scenarios.Single(scenario => scenario.Id == ScenarioId.S3);
        Assert.IsNull(missing.ScoreAfterReview);
        Assert.IsNull(missing.SuppliedReviewOutcome);
        Assert.HasCount(2, missing.Facts.Where(fact => fact.Status == EvidenceStatus.Missing).ToArray());
        Assert.AreEqual(new BooleanFactValue(false), missing.Facts.Single(fact => fact.Key == FactKey.PassTimeObserved).Value);
    }

    [TestMethod]
    [DynamicData(nameof(InvalidScenarios))]
    public void MalformedScenarioIsRejectedWithoutDefaults(string name, string caseJson)
    {
        using var testCase = JsonDocument.Parse(caseJson);
        var id = testCase.RootElement.GetProperty("scenarioId").GetString();
        var original = StubData.Scenarios().Single(scenario => scenario.Id.ToString() == id);
        var node = JsonNode.Parse(ContractJson.Write(original))!;
        Apply(node, testCase.RootElement);

        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractRules.Scenario(ContractJson.Read<Scenario>(node.ToJsonString())), name);
    }

    [TestMethod]
    public void DuplicatePropertiesAndNumericEnumsAreRejected()
    {
        var request = ContractJson.Write(StubData.Request(ScenarioId.S1, Audience.Casual, SourceMode.Authored));
        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractJson.Read<ExplanationRequest>(request.Replace("\"schemaVersion\": \"0.2\"",
                "\"schemaVersion\": \"0.1\", \"schemaVersion\": \"0.2\"", StringComparison.Ordinal)));
        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractJson.Read<ExplanationRequest>(request.Replace("\"CASUAL\"", "0", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void ErrorShapesAndRequestCorrelationAreValidated()
    {
        var error = StubData.Errors()[0];
        Assert.ThrowsExactly<ContractViolationException>(() => ContractRules.Error(error with { Retryable = true }));
        Assert.ThrowsExactly<ContractViolationException>(() => ContractRules.Error(error with { Status = ResponseStatus.Complete }));
        Assert.ThrowsExactly<ContractViolationException>(() => ContractRules.Error(error with { RequestId = "" }));
        Assert.ThrowsExactly<ContractViolationException>(() => ContractRules.Error(error with { Message = "" }));
        var request = StubData.Request(ScenarioId.S1, Audience.Casual, SourceMode.Authored);
        var scenario = StubData.Scenarios()[0];
        var body = scenario.AuthoredExplanations.Casual;
        var response = new ExplanationSuccess(request.SchemaVersion, request.RequestId, request.ScenarioId,
            request.ContentVersion, request.Audience, request.SourceMode, body.Status, body.Interpretation,
            body.Headline, body.Points, body.Limitations, body.Recap);
        ContractRules.Success(response, request, scenario);
        foreach (var invalid in new[]
        {
            response with { RequestId = "stale" },
            response with { ContentVersion = "stale" },
            response with { ScenarioId = ScenarioId.S2 },
            response with { Audience = Audience.Analyst },
            response with { SourceMode = SourceMode.LiveAi }
        })
        {
            Assert.ThrowsExactly<ContractViolationException>(() => ContractRules.Success(invalid, request, scenario));
        }
    }

    [TestMethod]
    [DynamicData(nameof(Matrix))]
    public async Task StubMatrixPreservesMetadataAndProvenance(ScenarioId id, Audience audience, SourceMode mode)
    {
        var repository = new StubScenarioRepository();
        var request = StubData.Request(id, audience, mode);
        var result = await new StubExplanationService(repository).ExplainAsync(request, TestContext.CancellationToken);
        var success = Assert.IsInstanceOfType<ExplanationSuccess>(result);
        var scenario = await repository.FindAsync(id, TestContext.CancellationToken);
        Assert.IsNotNull(scenario);
        ContractRules.Success(success, request, scenario);
        Assert.AreEqual(mode == SourceMode.LiveAi,
            success.Limitations.Any(text => text.StartsWith("SIMULATED LIVE-AI", StringComparison.Ordinal)));
        Assert.AreEqual(id == ScenarioId.S3 ? ResponseStatus.Limited : ResponseStatus.Complete, success.Status);
    }

    [TestMethod]
    [DataRow(Audience.Casual, 90)]
    [DataRow(Audience.Analyst, 220)]
    public void ExplanationWordLimitAcceptsBoundaryAndRejectsOneMore(Audience audience, int limit)
    {
        var scenario = StubData.Scenarios()[0];
        var body = scenario.AuthoredExplanations.Casual;
        body = body with
        {
            Headline = body.Headline with { Text = Words(limit - 1) },
            Points = [body.Points[0] with { Text = "word" }]
        };
        ContractRules.Body(body, scenario, audience);
        Assert.AreEqual(limit, ContractRules.WordCount(body.Headline.Text) + ContractRules.WordCount(body.Points[0].Text));
        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractRules.Body(body with { Headline = body.Headline with { Text = Words(limit) } }, scenario, audience));
    }

    [TestMethod]
    public void RecapLimitAndUnicodeWhitespaceAreExact()
    {
        var scenario = StubData.Scenarios()[0];
        var body = scenario.AuthoredExplanations.Casual;
        ContractRules.Body(body with { Recap = body.Recap with { Text = Words(40) } }, scenario, Audience.Casual);
        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractRules.Body(body with { Recap = body.Recap with { Text = Words(41) } }, scenario, Audience.Casual));
        Assert.AreEqual(5, ContractRules.WordCount("one\u0085two\u00a0three\tfour\nfive"));
    }

    [TestMethod]
    public void ExpertReviewNeedsAnExternalRecordForThisContentVersion()
    {
        var scenario = StubData.Scenarios()[0];
        var rule = scenario.Rules[0] with { ReviewStatus = ReviewStatus.ExpertReviewed, CheckedOn = "2026-10-21" };
        scenario = scenario with { Rules = [rule] };
        Assert.ThrowsExactly<ContractViolationException>(() => ContractRules.Scenario(scenario));
        var record = new ExpertReviewRecord(scenario.Id, scenario.ContentVersion, rule.Id,
            ContractRules.RuleEdition, "SYNTHETIC-TEST-REVIEW-RECORD-NOT-AN-ACTUAL-REVIEW");
        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractRules.Scenario(scenario, [record with { ContentVersion = "different-version" }]));
        ContractRules.Scenario(scenario, [record]);
    }

    [TestMethod]
    public void PairAllowsOnlyTheControlledDifference()
    {
        var scenarios = StubData.Scenarios();
        ContractRules.Pair(scenarios[0], scenarios[1]);
        Assert.ThrowsExactly<ContractViolationException>(() => ContractRules.Pair(scenarios[0], scenarios[2]));
        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractRules.Pair(scenarios[0], scenarios[1] with { ContentVersion = "different-version" }));
        var alteredFacts = scenarios[1].Facts.Select(fact => fact.Key == FactKey.ReceiverAheadOfBall
            ? fact with { Value = new BooleanFactValue(false) } : fact).ToArray();
        Assert.ThrowsExactly<ContractViolationException>(() =>
            ContractRules.Pair(scenarios[0], scenarios[1] with { Facts = alteredFacts }));
    }

    [TestMethod]
    public void TeamNamesAndIllustrativeCoordinatesDoNotDetermineInterpretation()
    {
        var scenario = StubData.Scenarios()[0];
        var changed = scenario with
        {
            Match = scenario.Match with { HomeTeam = "Other Synthetic Team" },
            Diagram = scenario.Diagram with
            {
                Markers = scenario.Diagram.Markers.Select(marker => marker with { X = 1, Y = 99 }).ToArray()
            }
        };
        ContractRules.Scenario(changed);
        Assert.AreEqual(scenario.Interpretation, changed.Interpretation);
        Assert.AreEqual(scenario.AuthoredExplanations, changed.AuthoredExplanations);
    }

    [TestMethod]
    public void AdditionalOrderedReplayEventsRemainValid()
    {
        var scenario = StubData.Scenarios()[0];
        var events = scenario.Events.ToList();
        events.Insert(3, new("E-SECOND-SHOT", 2500, EventKind.Shot, "Another labelled synthetic shot", []));
        ContractRules.Scenario(scenario with { Events = events });
    }

    [TestMethod]
    public async Task ForcedErrorsRemainErrorsAndNeverFallBackToAuthored()
    {
        var request = StubData.Request(ScenarioId.S1, Audience.Casual, SourceMode.LiveAi);
        foreach (var code in Enum.GetValues<ErrorCode>())
        {
            var result = await new StubExplanationService(new StubScenarioRepository(), code)
                .ExplainAsync(request, TestContext.CancellationToken);
            var error = Assert.IsInstanceOfType<ContractError>(result);
            ContractRules.Error(error);
            Assert.AreEqual(code, error.Code);
            Assert.AreEqual(request.RequestId, error.RequestId);
        }
    }

    [TestMethod]
    public async Task ProvidersAreRawDeterministicAndCancellableWithoutDiagramInput()
    {
        var scenario = StubData.Scenarios()[0];
        var input = new GenerationInput(scenario.SchemaVersion, scenario.Id, scenario.ContentVersion,
            Audience.Casual, scenario.OriginalDecision, scenario.SuppliedReviewOutcome, scenario.Match.ScoreBefore,
            scenario.ScoreAfterReview, scenario.Interpretation, scenario.Facts, scenario.Rules);
        Assert.IsFalse(typeof(GenerationInput).GetProperties().Any(property =>
            property.PropertyType == typeof(Diagram) || property.PropertyType == typeof(AuthoredExplanations)));
        Assert.AreEqual("{malformed-provider-output", await new ConstantProviderStub("{malformed-provider-output")
            .GenerateAsync(input, TestContext.CancellationToken));
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var pending = new CancellableProviderStub().GenerateAsync(input, cancellation.Token);
        Assert.IsFalse(pending.IsCompleted);
        await cancellation.CancelAsync();
        await Assert.ThrowsAsync<OperationCanceledException>(() => pending);
    }

    private static string Words(int count) => string.Join(" ", Enumerable.Repeat("word", count));

    private static void Apply(JsonNode root, JsonElement testCase)
    {
        var segments = testCase.GetProperty("path").GetString()!.Split('/').Skip(1).ToArray();
        var parent = root;
        foreach (var segment in segments.SkipLast(1))
        {
            parent = parent is JsonArray array ? array[int.Parse(segment)]! : parent[segment]!;
        }
        var key = segments[^1];
        if (testCase.GetProperty("operation").GetString() == "remove")
        {
            Assert.IsInstanceOfType<JsonObject>(parent).Remove(key);
        }
        else
        {
            var value = JsonNode.Parse(testCase.GetProperty("value").GetRawText());
            if (parent is JsonArray array)
            {
                array[int.Parse(key)] = value;
            }
            else
            {
                parent[key] = value;
            }
        }
    }
}
