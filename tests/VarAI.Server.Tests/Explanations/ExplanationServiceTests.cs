using VarAI.Contracts;
using VarAI.Server.Explanations;
using static VarAI.Server.Tests.Explanations.ExplanationFixtures;

namespace VarAI.Server.Tests.Explanations;

[TestClass]
public sealed class ExplanationServiceTests
{
    public required TestContext TestContext { get; set; }

    public static IEnumerable<object[]> Matrix =>
        from id in Enum.GetValues<ScenarioId>()
        from audience in Enum.GetValues<Audience>()
        from mode in Enum.GetValues<SourceMode>()
        select new object[] { id, audience, mode };

    private static IEnumerable<string> CompatibleRequestIds =>
    [
        new string('x', 129),
        new string('x', 256),
        "review/attempt-1",
        "révision/試行-😀",
        "review attempt+1?stage=2&source=api",
        "line\r\ninjection",
        "<unsafe>",
        "review\\\"attempt\"",
        " review/attempt-1 ",
        "\t\u0085\u00a0review/attempt-1\u2003\r\n"
    ];

    public static IEnumerable<object[]> RequestIdSuccessCases =>
        from requestId in CompatibleRequestIds
        from mode in Enum.GetValues<SourceMode>()
        select new object[] { requestId, mode };

    public static IEnumerable<object[]> RequestIdErrorCases =>
        from requestId in CompatibleRequestIds
        from code in Enum.GetValues<ErrorCode>()
        select new object[] { requestId, code };

    [TestMethod]
    [DynamicData(nameof(RequestIdSuccessCases))]
    public async Task ExplainAsync_ValidRequestIdCorrelationIsPreservedOnSuccess(string requestId, SourceMode mode)
    {
        var request = Request(mode: mode) with { RequestId = requestId };
        ContractRules.Request(request);
        var repository = new Repository();
        var provider = new Provider();
        var response = Assert.IsInstanceOfType<ExplanationSuccess>(
            await Service(repository, provider).ExplainAsync(request, TestContext.CancellationToken));

        ContractRules.Success(response, request, Scenario());
        Assert.AreEqual(requestId, response.RequestId);
        Assert.AreEqual(requestId, ContractJson.Read<ExplanationSuccess>(ContractJson.Write(response)).RequestId);
        Assert.AreEqual(1, repository.Calls);
        Assert.AreEqual(mode == SourceMode.LiveAi ? 1 : 0, provider.Calls);
    }

    [TestMethod]
    [DynamicData(nameof(RequestIdErrorCases))]
    public async Task ExplainAsync_ValidRequestIdCorrelationSurvivesEveryDomainError(string requestId, ErrorCode code)
    {
        var request = Request() with { RequestId = requestId };
        ContractRules.Request(request);
        request = code switch
        {
            ErrorCode.InvalidRequest => request with { SchemaVersion = "0.1" },
            ErrorCode.ContentVersionMismatch => request with { ContentVersion = "different-version" },
            _ => request
        };
        var clock = new ManualTimeProvider();
        var repository = new Repository
        {
            Find = (id, _) => Task.FromResult<Scenario?>(code == ErrorCode.ScenarioNotFound ? null : Scenario(id))
        };
        var provider = new Provider
        {
            Generate = async (input, token) =>
            {
                if (code == ErrorCode.Timeout)
                {
                    await Task.Delay(Timeout.InfiniteTimeSpan, token);
                }
                return code switch
                {
                    ErrorCode.ModelNotConfigured => throw new ExplanationProviderException(code),
                    ErrorCode.ModelUnavailable => throw new HttpRequestException("FICTITIOUS_SECRET_AND_RAW_PAYLOAD"),
                    ErrorCode.InvalidOutput => "FICTITIOUS_SECRET_AND_RAW_PAYLOAD",
                    _ => Raw(Scenario(input.ScenarioId), input.Audience)
                };
            }
        };
        var pending = Service(repository, provider, clock: clock).ExplainAsync(request, TestContext.CancellationToken);
        if (code == ErrorCode.Timeout)
        {
            clock.Advance(TimeSpan.FromMilliseconds(ContractRules.AttemptDeadlineMs));
        }
        var error = Error(await pending, code, requestId);
        var json = ContractJson.Write(error);
        Assert.AreEqual(requestId, ContractJson.Read<ContractError>(json).RequestId);
        Assert.DoesNotContain("FICTITIOUS_SECRET_AND_RAW_PAYLOAD", json);
        Assert.AreEqual(code == ErrorCode.InvalidRequest ? 0 : 1, repository.Calls);
        Assert.AreEqual(code is ErrorCode.ModelNotConfigured or ErrorCode.ModelUnavailable
            or ErrorCode.Timeout or ErrorCode.InvalidOutput ? 1 : 0, provider.Calls);
    }

    [TestMethod]
    [DynamicData(nameof(Matrix))]
    public async Task ExplainAsync_AllScenariosAudiencesAndModesPreserveContract(
        ScenarioId id, Audience audience, SourceMode mode)
    {
        var scenario = Scenario(id);
        var provider = new Provider();
        var validator = new Validator();
        var request = Request(id, audience, mode) with { RequestId = $"current-{Guid.NewGuid():N}" };
        var response = Assert.IsInstanceOfType<ExplanationSuccess>(
            await Service(provider: provider, validator: validator).ExplainAsync(request, TestContext.CancellationToken));
        ContractRules.Success(response, request, scenario);
        Assert.AreEqual(mode == SourceMode.LiveAi ? 1 : 0, provider.Calls);
        Assert.AreEqual(mode == SourceMode.LiveAi ? 1 : 0, validator.Calls);
        Assert.AreEqual(id == ScenarioId.S3 ? ResponseStatus.Limited : ResponseStatus.Complete, response.Status);
        if (mode == SourceMode.Authored)
        {
            var expected = audience == Audience.Casual ? scenario.AuthoredExplanations.Casual : scenario.AuthoredExplanations.Analyst;
            var actual = new ExplanationBody(response.SourceMode, response.Status, response.Interpretation,
                response.Headline, response.Points, response.Limitations, response.Recap);
            Assert.AreEqual(ContractJson.Write(expected), ContractJson.Write(actual));
        }
    }

    [TestMethod]
    [DynamicData(nameof(Matrix))]
    public async Task ExplainAsync_TeamLabelAndDiagramSwapsDoNotChangeInterpretationOrProviderFacts(
        ScenarioId id, Audience audience, SourceMode mode)
    {
        var original = Scenario(id);
        var changed = original with
        {
            Match = original.Match with { HomeTeam = original.Match.AwayTeam, AwayTeam = original.Match.HomeTeam },
            Diagram = original.Diagram with
            {
                Markers = original.Diagram.Markers.Select(marker => marker with { X = 1, Y = 99 }).ToArray()
            }
        };
        var provider = new Provider();
        var request = Request(id, audience, mode);
        var baseline = Assert.IsInstanceOfType<ExplanationSuccess>(
            await Service(provider: provider).ExplainAsync(request, TestContext.CancellationToken));
        var baselineInput = provider.LastInput is null ? null : ContractJson.Write(provider.LastInput);
        var repository = new Repository { Find = (_, _) => Task.FromResult<Scenario?>(changed) };
        var response = Assert.IsInstanceOfType<ExplanationSuccess>(
            await Service(repository, provider).ExplainAsync(request, TestContext.CancellationToken));
        Assert.AreEqual(ContractJson.Write(baseline), ContractJson.Write(response));
        Assert.AreEqual(baselineInput, provider.LastInput is null ? null : ContractJson.Write(provider.LastInput));
        Assert.AreEqual(original.Interpretation, response.Interpretation);
    }

    [TestMethod]
    [DataRow("schema")]
    [DataRow("version-empty")]
    [DataRow("version-null")]
    [DataRow("scenario")]
    [DataRow("audience")]
    [DataRow("mode")]
    public async Task ExplainAsync_InvalidFieldsFailBeforeRepositoryOrProvider(string invalid)
    {
        var valid = Request();
        var request = invalid switch
        {
            "schema" => valid with { SchemaVersion = "0.1" },
            "version-empty" => valid with { ContentVersion = " \u0085" },
            "version-null" => valid with { ContentVersion = null! },
            "scenario" => valid with { ScenarioId = (ScenarioId)99 },
            "audience" => valid with { Audience = (Audience)99 },
            _ => valid with { SourceMode = (SourceMode)99 }
        };
        var repository = new Repository();
        var provider = new Provider();
        Error(await Service(repository, provider).ExplainAsync(request, TestContext.CancellationToken),
            ErrorCode.InvalidRequest, request.RequestId);
        Assert.AreEqual(0, repository.Calls);
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow(" \u0085\u00a0")]
    [DataRow("\r\n\t")]
    [DataRow("\u2003\u2028\u2029")]
    public async Task ExplainAsync_BlankRequestIdCorrelationGetsFreshSafeIdentity(string? requestId)
    {
        var repository = new Repository();
        var provider = new Provider();
        var service = Service(repository, provider);
        var request = Request() with { RequestId = requestId! };
        var first = Error(await service.ExplainAsync(request, TestContext.CancellationToken), ErrorCode.InvalidRequest);
        var second = Error(await service.ExplainAsync(request, TestContext.CancellationToken), ErrorCode.InvalidRequest);
        Assert.MatchesRegex(@"^attempt-[a-f0-9]{32}$", first.RequestId);
        Assert.MatchesRegex(@"^attempt-[a-f0-9]{32}$", second.RequestId);
        Assert.AreNotEqual(first.RequestId, second.RequestId);
        Assert.AreEqual(0, repository.Calls);
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    public async Task ExplainAsync_NullRequestGetsFreshSafeRequestIdCorrelation()
    {
        var repository = new Repository();
        var provider = new Provider();
        var service = Service(repository, provider);
        var first = Error(await service.ExplainAsync(null!, TestContext.CancellationToken), ErrorCode.InvalidRequest);
        var second = Error(await service.ExplainAsync(null!, TestContext.CancellationToken), ErrorCode.InvalidRequest);
        Assert.MatchesRegex(@"^attempt-[a-f0-9]{32}$", first.RequestId);
        Assert.MatchesRegex(@"^attempt-[a-f0-9]{32}$", second.RequestId);
        Assert.AreNotEqual(first.RequestId, second.RequestId);
        Assert.AreEqual(0, repository.Calls);
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    public async Task ExplainAsync_MissingScenarioAndExactVersionMismatchNeverCallProvider()
    {
        var request = Request();
        var provider = new Provider();
        var repository = new Repository { Find = (_, _) => Task.FromResult<Scenario?>(null) };
        Error(await Service(repository, provider).ExplainAsync(request, TestContext.CancellationToken),
            ErrorCode.ScenarioNotFound, request.RequestId);
        foreach (var version in new[] { request.ContentVersion.ToUpperInvariant(), request.ContentVersion + " " })
        {
            Error(await Service(provider: provider).ExplainAsync(request with { ContentVersion = version },
                TestContext.CancellationToken), ErrorCode.ContentVersionMismatch, request.RequestId);
        }
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    [DataRow("wrong-scenario")]
    [DataRow("facts-null")]
    [DataRow("fact-null")]
    [DataRow("match-null")]
    [DataRow("wrong-value")]
    [DataRow("wrong-mode")]
    [DataRow("empty-limitations")]
    [DataRow("unverified-expert")]
    public async Task ExplainAsync_MalformedRepositoryDataFailsClosed(string invalid)
    {
        var scenario = Scenario();
        scenario = invalid switch
        {
            "wrong-scenario" => Scenario(ScenarioId.S2),
            "facts-null" => scenario with { Facts = null! },
            "fact-null" => scenario with { Facts = [null!] },
            "match-null" => scenario with { Match = null! },
            "wrong-value" => scenario with
            {
                Facts = scenario.Facts.Select(fact => fact.Key == FactKey.ReceiverAheadOfBall
                    ? fact with { Value = new BooleanFactValue(false) } : fact).ToArray()
            },
            "wrong-mode" => scenario with
            {
                AuthoredExplanations = scenario.AuthoredExplanations with
                {
                    Casual = scenario.AuthoredExplanations.Casual with { SourceMode = SourceMode.LiveAi }
                }
            },
            "empty-limitations" => scenario with
            {
                AuthoredExplanations = scenario.AuthoredExplanations with
                {
                    Analyst = scenario.AuthoredExplanations.Analyst with { Limitations = [] }
                }
            },
            _ => scenario with
            {
                Rules = scenario.Rules.Select(rule => rule with
                {
                    ReviewStatus = ReviewStatus.ExpertReviewed,
                    CheckedOn = "2026-10-21"
                }).ToArray()
            }
        };
        var provider = new Provider();
        var repository = new Repository { Find = (_, _) => Task.FromResult<Scenario?>(scenario) };
        Error(await Service(repository, provider).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.InvalidOutput);
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    public async Task ExplainAsync_RepositoryFailureIsSafeAndDoesNotSubstituteAnotherScenario()
    {
        var repository = new Repository
        {
            Find = (_, _) => throw new InvalidOperationException("FICTITIOUS_SECRET_DO_NOT_RETURN")
        };
        var provider = new Provider();
        Error(await Service(repository, provider).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.InvalidOutput);
        Assert.AreEqual(1, repository.Calls);
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    [DataRow(ErrorCode.ModelNotConfigured)]
    [DataRow(ErrorCode.ModelUnavailable)]
    [DataRow(ErrorCode.InvalidOutput)]
    public async Task ExplainAsync_TypedProviderFailuresStaySafeWithoutFallbackOrRetry(ErrorCode code)
    {
        var provider = new Provider { Generate = (_, _) => throw new ExplanationProviderException(code) };
        var request = Request();
        Error(await Service(provider: provider).ExplainAsync(request, TestContext.CancellationToken), code, request.RequestId);
        Assert.AreEqual(1, provider.Calls);
    }

    [TestMethod]
    [DataRow("http")]
    [DataRow("unrelated-cancellation")]
    [DataRow("provider-timeout")]
    public async Task ExplainAsync_UnexpectedProviderFailuresAreUnavailableNotDeadlineTimeout(string kind)
    {
        var provider = new Provider
        {
            Generate = (_, _) => throw (kind switch
            {
                "http" => new HttpRequestException("FICTITIOUS_SECRET_AND_RAW_PAYLOAD"),
                "unrelated-cancellation" => new OperationCanceledException(),
                _ => new TimeoutException("The provider's own timeout is not the service deadline.")
            })
        };
        Error(await Service(provider: provider).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.ModelUnavailable);
        Assert.AreEqual(1, provider.Calls);
    }

    [TestMethod]
    public async Task ExplainAsync_AuthoredModeDoesNotNeedConfiguredProvider()
    {
        var provider = new Provider { Generate = (_, _) => throw new ExplanationProviderException(ErrorCode.ModelNotConfigured) };
        Assert.IsInstanceOfType<ExplanationSuccess>(await Service(provider: provider).ExplainAsync(
            Request(mode: SourceMode.Authored), TestContext.CancellationToken));
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    public async Task ExplainAsync_ProviderReceivesOnlyApprovedImmutableFactsAndIndependentOutcomes()
    {
        foreach (var id in Enum.GetValues<ScenarioId>())
        {
            var scenario = Scenario(id);
            var provider = new Provider();
            await Service(provider: provider).ExplainAsync(Request(id), TestContext.CancellationToken);
            var input = provider.LastInput;
            Assert.IsNotNull(input);
            Assert.AreEqual(OriginalDecision.GoalAwarded, input.OriginalDecision);
            Assert.AreEqual(scenario.SuppliedReviewOutcome, input.SuppliedReviewOutcome);
            Assert.AreEqual(scenario.ScoreAfterReview, input.ScoreAfterReview);
            CollectionAssert.AreEqual(scenario.Facts.ToArray(), input.Facts.ToArray());
            CollectionAssert.AreEqual(scenario.Rules.ToArray(), input.Rules.ToArray());
            Assert.ThrowsExactly<NotSupportedException>(() => ((IList<Fact>)input.Facts)[0] = scenario.Facts[1]);
            var json = ContractJson.Write(input);
            foreach (var forbidden in new[] { "diagram", "markers", "authoredExplanations", "homeTeam", "awayTeam", "requestId", "prompt" })
            {
                Assert.DoesNotContain($"\"{forbidden}\"", json);
            }
            if (id == ScenarioId.S3)
            {
                Assert.HasCount(2, input.Facts.Where(fact => fact.Status == EvidenceStatus.Missing && fact.Value is null).ToArray());
            }
        }
    }

    [TestMethod]
    public async Task ExplainAsync_ReturnedAuthoredCollectionsCannotMutateTheRepositoryOrResponse()
    {
        var scenario = Scenario();
        var repository = new Repository { Find = (_, _) => Task.FromResult<Scenario?>(scenario) };
        var result = Assert.IsInstanceOfType<ExplanationSuccess>(await Service(repository).ExplainAsync(
            Request(mode: SourceMode.Authored), TestContext.CancellationToken));
        var originalHeadline = result.Headline.Text;
        ((IList<Claim>)scenario.AuthoredExplanations.Casual.Points)[0] =
            scenario.AuthoredExplanations.Casual.Points[0] with { Text = "Changed elsewhere." };
        Assert.AreEqual(originalHeadline, result.Headline.Text);
        Assert.AreNotEqual(scenario.AuthoredExplanations.Casual.Points[0].Text, result.Points[0].Text);
        Assert.ThrowsExactly<NotSupportedException>(() => ((IList<string>)result.Limitations).Add("Changed."));
    }
}
