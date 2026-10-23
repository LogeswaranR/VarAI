using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VarAI.Contracts;
using VarAI.Scenarios;
using VarAI.Server.Explanations;
using VarAI.Server.Tests.Explanations;

namespace VarAI.Server.Tests.Integration;

[TestClass]
public sealed class GraphQlHttpTests
{
    public required TestContext TestContext { get; set; }

    private static WebApplicationFactory<Program> Application(Action<IServiceCollection>? configure = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseEnvironment("Development").ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Explanations:LiveEnabled"] = "false"
                })).ConfigureServices(services => configure?.Invoke(services)));

    private async Task<JsonElement> Post(HttpClient client, string operation, object variables)
    {
        using var stream = typeof(GraphQlHttpTests).Assembly.GetManifestResourceStream("ContractOperations")!;
        using var reader = new StreamReader(stream);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/graphql")
        {
            Content = JsonContent.Create(new { query = reader.ReadToEnd(), operationName = operation, variables })
        };
        request.Headers.Accept.ParseAdd("application/graphql-response+json");
        using var response = await client.SendAsync(request, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("application/graphql-response+json", response.Content.Headers.ContentType?.MediaType);
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.CancellationToken);
        Assert.IsFalse(payload.TryGetProperty("errors", out _), payload.ToString());
        return payload.GetProperty("data");
    }

    [TestMethod]
    public void RegistersOnlyRealProductionCollaborators()
    {
        using var application = Application();
        Assert.IsInstanceOfType<SyntheticScenarioRepository>(application.Services.GetRequiredService<IScenarioRepository>());
        Assert.IsInstanceOfType<ExplanationService>(application.Services.GetRequiredService<IExplanationService>());
        Assert.IsInstanceOfType<ExplanationOutputValidator>(application.Services.GetRequiredService<IExplanationOutputValidator>());
        Assert.IsInstanceOfType<AzureOpenAiExplanationProvider>(application.Services.GetRequiredService<IExplanationProvider>());
        Assert.AreSame(TimeProvider.System, application.Services.GetRequiredService<TimeProvider>());
    }

    [TestMethod]
    [DataRow("S1", "CASUAL", "COMPLETE", "OFFSIDE_SUPPORTED")]
    [DataRow("S1", "ANALYST", "COMPLETE", "OFFSIDE_SUPPORTED")]
    [DataRow("S2", "CASUAL", "COMPLETE", "NO_OFFSIDE_SUPPORTED")]
    [DataRow("S2", "ANALYST", "COMPLETE", "NO_OFFSIDE_SUPPORTED")]
    [DataRow("S3", "CASUAL", "LIMITED", "INSUFFICIENT_EVIDENCE")]
    [DataRow("S3", "ANALYST", "LIMITED", "INSUFFICIENT_EVIDENCE")]
    public async Task AuthoredJourneyUsesActualContentOverHttp(string id, string audience, string status, string interpretation)
    {
        using var application = Application();
        using var client = application.CreateClient();
        var summaries = await Post(client, "Scenarios", new { });
        Assert.AreEqual(3, summaries.GetProperty("scenarios").GetArrayLength());
        var data = await Post(client, "Scenario", new { id, requestId = "scenario-http" });
        var scenario = data.GetProperty("scenario");
        Assert.AreEqual("Alder Vale Comets", scenario.GetProperty("match").GetProperty("homeTeam").GetString());
        Assert.AreEqual("SOURCE_CHECKED", scenario.GetProperty("rules")[0].GetProperty("reviewStatus").GetString());
        var requestId = $" Unicode identity / {id} / {audience} ";
        var explanation = (await Post(client, "Explain", new
        {
            input = new
            {
                schemaVersion = "0.2",
                requestId,
                scenarioId = id,
                contentVersion = scenario.GetProperty("contentVersion").GetString(),
                audience,
                sourceMode = "AUTHORED"
            }
        })).GetProperty("explain");
        Assert.AreEqual("ExplanationSuccess", explanation.GetProperty("__typename").GetString());
        Assert.AreEqual(requestId, explanation.GetProperty("requestId").GetString());
        Assert.AreEqual("AUTHORED", explanation.GetProperty("sourceMode").GetString());
        Assert.AreEqual(status, explanation.GetProperty("status").GetString());
        Assert.AreEqual(interpretation, explanation.GetProperty("interpretation").GetString());
        var authored = scenario.GetProperty("authoredExplanations").GetProperty(audience.ToLowerInvariant());
        Assert.AreEqual(authored.GetProperty("recap").GetProperty("text").GetString(),
            explanation.GetProperty("recap").GetProperty("text").GetString());
        if (id == "S3")
        {
            Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("suppliedReviewOutcome").ValueKind);
            Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("scoreAfterReview").ValueKind);
            Assert.AreEqual(0, scenario.GetProperty("diagram").GetProperty("markers").GetArrayLength());
        }
    }

    [TestMethod]
    public async Task ExplicitLiveWithoutConfigurationIsAnErrorAndNeverAuthoredFallback()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var requestId = $"  {new string('x', 300)} Ü  ";
        var response = (await Post(client, "Explain", new
        {
            input = new
            {
                schemaVersion = "0.2",
                requestId,
                scenarioId = "S1",
                contentVersion = SyntheticScenarioLibrary.ContentVersion,
                audience = "CASUAL",
                sourceMode = "LIVE_AI"
            }
        })).GetProperty("explain");
        Assert.AreEqual("ContractError", response.GetProperty("__typename").GetString());
        Assert.AreEqual("MODEL_NOT_CONFIGURED", response.GetProperty("code").GetString());
        Assert.AreEqual(requestId, response.GetProperty("requestId").GetString());
        Assert.IsFalse(response.GetProperty("retryable").GetBoolean());
        Assert.IsFalse(response.TryGetProperty("headline", out _));
        Assert.IsFalse(response.TryGetProperty("recap", out _));
    }

    [TestMethod]
    public async Task VersionAndUnknownScenarioRemainTypedErrors()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var unknown = (await Post(client, "Scenario", new { id = "S99", requestId = "unknown-id" })).GetProperty("scenario");
        Assert.AreEqual("SCENARIO_NOT_FOUND", unknown.GetProperty("code").GetString());
        Assert.AreEqual("unknown-id", unknown.GetProperty("requestId").GetString());
        var mismatch = (await Post(client, "Explain", new
        {
            input = new
            {
                schemaVersion = "0.2",
                requestId = "version-id",
                scenarioId = "S1",
                contentVersion = "obsolete",
                audience = "CASUAL",
                sourceMode = "AUTHORED"
            }
        })).GetProperty("explain");
        Assert.AreEqual("CONTENT_VERSION_MISMATCH", mismatch.GetProperty("code").GetString());
        Assert.IsFalse(mismatch.GetProperty("retryable").GetBoolean());
    }

    [TestMethod]
    [DataRow(ErrorCode.InvalidRequest, "INVALID_REQUEST")]
    [DataRow(ErrorCode.ScenarioNotFound, "SCENARIO_NOT_FOUND")]
    [DataRow(ErrorCode.ContentVersionMismatch, "CONTENT_VERSION_MISMATCH")]
    [DataRow(ErrorCode.ModelNotConfigured, "MODEL_NOT_CONFIGURED")]
    [DataRow(ErrorCode.ModelUnavailable, "MODEL_UNAVAILABLE")]
    [DataRow(ErrorCode.Timeout, "TIMEOUT")]
    [DataRow(ErrorCode.InvalidOutput, "INVALID_OUTPUT")]
    public async Task AllSevenErrorsTraverseRealHttpWithExplicitTestOnlyFaults(ErrorCode code, string expectedCode)
    {
        var clock = new ManualTimeProvider();
        var provider = new ExplanationFixtures.Provider
        {
            Generate = (_, token) =>
            {
                if (code == ErrorCode.Timeout)
                {
                    clock.Advance(TimeSpan.FromMilliseconds(ContractRules.AttemptDeadlineMs - 1));
                    Assert.IsFalse(token.IsCancellationRequested);
                    clock.Advance(TimeSpan.FromMilliseconds(1));
                    return Task.FromCanceled<string>(token);
                }
                if (code == ErrorCode.InvalidOutput)
                {
                    return Task.FromResult("FICTITIOUS_INVALID_PROVIDER_OUTPUT");
                }
                throw new ExplanationProviderException(ErrorCode.ModelUnavailable);
            }
        };
        using var application = Application(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(clock);
            if (code == ErrorCode.ScenarioNotFound)
            {
                services.RemoveAll<IScenarioRepository>();
                services.AddSingleton<IScenarioRepository>(new ExplanationFixtures.Repository
                {
                    Find = (_, token) =>
                    {
                        token.ThrowIfCancellationRequested();
                        return Task.FromResult<Scenario?>(null);
                    }
                });
            }
            if (code is ErrorCode.ModelUnavailable or ErrorCode.Timeout or ErrorCode.InvalidOutput)
            {
                services.RemoveAll<IExplanationProvider>();
                services.AddSingleton<IExplanationProvider>(provider);
            }
        });
        Assert.IsInstanceOfType<ExplanationService>(application.Services.GetRequiredService<IExplanationService>());
        using var client = application.CreateClient();
        var requestId = $" acceptance/{expectedCode} Ü ";
        var error = (await Post(client, "Explain", new
        {
            input = new
            {
                schemaVersion = code == ErrorCode.InvalidRequest ? "unsupported" : ContractRules.SchemaVersion,
                requestId,
                scenarioId = "S1",
                contentVersion = code == ErrorCode.ContentVersionMismatch ? "obsolete" : SyntheticScenarioLibrary.ContentVersion,
                audience = "CASUAL",
                sourceMode = "LIVE_AI"
            }
        })).GetProperty("explain");
        Assert.AreEqual("ContractError", error.GetProperty("__typename").GetString());
        Assert.AreEqual("ERROR", error.GetProperty("status").GetString());
        Assert.AreEqual(expectedCode, error.GetProperty("code").GetString());
        Assert.AreEqual(requestId, error.GetProperty("requestId").GetString());
        Assert.AreEqual(ContractErrors.IsRetryable(code), error.GetProperty("retryable").GetBoolean());
        Assert.AreEqual(ContractErrors.Create(code, requestId).Message, error.GetProperty("message").GetString());
        Assert.IsFalse(error.TryGetProperty("headline", out _));
        Assert.IsFalse(error.TryGetProperty("recap", out _));
        Assert.AreEqual(code is ErrorCode.ModelUnavailable or ErrorCode.Timeout or ErrorCode.InvalidOutput ? 1 : 0,
            provider.Calls);
        if (code == ErrorCode.Timeout)
        {
            Assert.IsTrue(provider.LastToken.IsCancellationRequested);
        }
    }

    [TestMethod]
    [DataRow(ScenarioId.S1, "AUTHORED")]
    [DataRow(ScenarioId.S2, "AUTHORED")]
    [DataRow(ScenarioId.S3, "AUTHORED")]
    [DataRow(ScenarioId.S1, "LIVE_AI")]
    [DataRow(ScenarioId.S2, "LIVE_AI")]
    [DataRow(ScenarioId.S3, "LIVE_AI")]
    public async Task TeamLabelInvarianceTraversesHttpWithIsolatedRepositoryAndSimulatedProvider(
        ScenarioId id, string mode)
    {
        var realRepository = new SyntheticScenarioRepository();
        var scenario = await realRepository.FindAsync(id, TestContext.CancellationToken);
        Assert.IsNotNull(scenario);
        var renamed = scenario with
        {
            Match = scenario.Match with { HomeTeam = "Example Home", AwayTeam = "Example Away" }
        };
        var originalProvider = new ExplanationFixtures.Provider
        {
            Generate = (input, token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult(ExplanationFixtures.Raw(scenario, input.Audience));
            }
        };
        var renamedProvider = new ExplanationFixtures.Provider
        {
            Generate = (input, token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult(ExplanationFixtures.Raw(renamed, input.Audience));
            }
        };
        using var originalApp = Application(services => ConfigureScenario(services, scenario, originalProvider));
        using var renamedApp = Application(services => ConfigureScenario(services, renamed, renamedProvider));
        using var originalClient = originalApp.CreateClient();
        using var renamedClient = renamedApp.CreateClient();
        foreach (var audience in new[] { "CASUAL", "ANALYST" })
        {
            var variables = new
            {
                input = new
                {
                    schemaVersion = ContractRules.SchemaVersion,
                    requestId = $"labels/{id}/{mode}/{audience}",
                    scenarioId = id.ToString(),
                    contentVersion = scenario.ContentVersion,
                    audience,
                    sourceMode = mode
                }
            };
            var original = (await Post(originalClient, "Explain", variables)).GetProperty("explain");
            var changed = (await Post(renamedClient, "Explain", variables)).GetProperty("explain");
            Assert.AreEqual("ExplanationSuccess", original.GetProperty("__typename").GetString());
            Assert.AreEqual("ExplanationSuccess", changed.GetProperty("__typename").GetString());
            Assert.AreEqual(mode, changed.GetProperty("sourceMode").GetString());
            foreach (var field in new[] { "requestId", "scenarioId", "contentVersion", "audience", "status",
                         "interpretation", "headline", "points", "limitations", "recap" })
            {
                Assert.AreEqual(original.GetProperty(field).GetRawText(), changed.GetProperty(field).GetRawText(), field);
            }
            if (mode == "LIVE_AI")
            {
                Assert.IsNotNull(originalProvider.LastInput);
                Assert.IsNotNull(renamedProvider.LastInput);
                Assert.AreEqual(ContractJson.Write(originalProvider.LastInput),
                    ContractJson.Write(renamedProvider.LastInput));
            }
        }
        Assert.AreEqual(mode == "LIVE_AI" ? 2 : 0, originalProvider.Calls);
        Assert.AreEqual(originalProvider.Calls, renamedProvider.Calls);
        var stored = await realRepository.FindAsync(id, TestContext.CancellationToken);
        Assert.AreEqual("Alder Vale Comets", stored?.Match.HomeTeam);
        Assert.AreEqual("Brindle Reach Lanterns", stored?.Match.AwayTeam);
    }

    private static void ConfigureScenario(IServiceCollection services, Scenario scenario, IExplanationProvider provider)
    {
        services.RemoveAll<IScenarioRepository>();
        services.AddSingleton<IScenarioRepository>(new ExplanationFixtures.Repository
        {
            Find = (id, token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult<Scenario?>(id == scenario.Id ? scenario : null);
            }
        });
        services.RemoveAll<IExplanationProvider>();
        services.AddSingleton(provider);
    }

    [TestMethod]
    public async Task InvalidGraphQlIsNotReturnedAsASuccessfulDomainPayload()
    {
        using var application = Application();
        using var client = application.CreateClient();
        using var response = await client.PostAsJsonAsync("/graphql",
            new { query = "mutation { explain(input: { arbitraryPrompt: \"no\" }) { __typename } }" },
            TestContext.CancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.CancellationToken);
        Assert.IsTrue(payload.TryGetProperty("errors", out var errors));
        Assert.IsGreaterThan(0, errors.GetArrayLength());
        Assert.IsTrue(!payload.TryGetProperty("data", out var data) || data.ValueKind == JsonValueKind.Null);
    }

    [TestMethod]
    public async Task NonJsonGraphQlIsRejectedRatherThanServedAsSpa()
    {
        using var application = Application();
        using var client = application.CreateClient();
        using var content = new StringContent("{ scenarios { id } }", Encoding.UTF8, "text/plain");
        using var response = await client.PostAsync("/graphql", content, TestContext.CancellationToken);
        Assert.IsFalse(response.IsSuccessStatusCode);
        Assert.AreNotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [TestMethod]
    [DataRow("/assets/missing.js")]
    [DataRow("/assets/missing")]
    [DataRow("/graphql/missing")]
    public async Task MissingAssetsAndGraphQlSubpathsAre404(string path)
    {
        using var application = Application();
        using var client = application.CreateClient();
        using var response = await client.GetAsync(path, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }
}
