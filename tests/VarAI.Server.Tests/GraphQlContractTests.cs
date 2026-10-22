using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using VarAI.Contracts;
using VarAI.ContractStubs;

namespace VarAI.Server.Tests;

[TestClass]
public sealed class GraphQlContractTests
{
    public required TestContext TestContext { get; set; }

    public static IEnumerable<object[]> Matrix => ContractTests.Matrix;

    [TestMethod]
    [DynamicData(nameof(Matrix))]
    public async Task FullOperationMatrixRunsThroughTheExecutableSchema(ScenarioId id, Audience audience, SourceMode mode)
    {
        await using var executor = await StubExecutor.CreateAsync();
        var request = StubData.Request(id, audience, mode);
        var payload = await executor.ExecuteAsync(Operations(), "Explain",
            ContractJson.Write(new { input = request }), TestContext.CancellationToken);
        Assert.IsFalse(payload.TryGetProperty("errors", out _), payload.ToString());
        var result = JsonNode.Parse(payload.GetProperty("data").GetProperty("explain").GetRawText())!.AsObject();
        Assert.AreEqual("ExplanationSuccess", result["__typename"]!.GetValue<string>());
        result.Remove("__typename");
        var response = ContractJson.Read<ExplanationSuccess>(result.ToJsonString());
        ContractRules.Success(response, request, StubData.Scenarios().Single(scenario => scenario.Id == id));
    }

    [TestMethod]
    public async Task EveryErrorCodeIsAnExplicitUnionMember()
    {
        foreach (var code in Enum.GetValues<ErrorCode>())
        {
            await using var executor = await StubExecutor.CreateAsync(code);
            var request = StubData.Request(ScenarioId.S1, Audience.Analyst, SourceMode.LiveAi);
            var payload = await executor.ExecuteAsync(Operations(), "Explain",
                ContractJson.Write(new { input = request }), TestContext.CancellationToken);
            Assert.IsFalse(payload.TryGetProperty("errors", out _));
            var result = JsonNode.Parse(payload.GetProperty("data").GetProperty("explain").GetRawText())!.AsObject();
            Assert.AreEqual("ContractError", result["__typename"]!.GetValue<string>());
            result.Remove("__typename");
            var error = ContractJson.Read<ContractError>(result.ToJsonString());
            ContractRules.Error(error);
            Assert.AreEqual(code, error.Code);
            Assert.AreEqual(request.RequestId, error.RequestId);
        }
    }

    [TestMethod]
    public async Task ScenarioQueriesKeepUnavailableValuesExplicitlyNull()
    {
        await using var executor = await StubExecutor.CreateAsync();
        var payload = await executor.ExecuteAsync(Operations(), "Scenario",
            """{"id":"S3","requestId":"query-missing"}""", TestContext.CancellationToken);
        Assert.IsFalse(payload.TryGetProperty("errors", out _));
        var scenario = payload.GetProperty("data").GetProperty("scenario");
        Assert.AreEqual("Scenario", scenario.GetProperty("__typename").GetString());
        Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("suppliedReviewOutcome").ValueKind);
        Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("scoreAfterReview").ValueKind);
        Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("comparison").ValueKind);
        Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("facts")[2].GetProperty("value").ValueKind);
        Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("diagram").GetProperty("secondLastReferenceX").ValueKind);
        Assert.AreEqual(JsonValueKind.Null, scenario.GetProperty("rules")[0].GetProperty("checkedOn").ValueKind);
        var unknown = await executor.ExecuteAsync(Operations(), "Scenario",
            """{"id":"S4","requestId":"query-unknown"}""", TestContext.CancellationToken);
        Assert.AreEqual("SCENARIO_NOT_FOUND",
            unknown.GetProperty("data").GetProperty("scenario").GetProperty("code").GetString());
    }

    [TestMethod]
    [DataRow("missing-input")]
    [DataRow("missing-mode")]
    [DataRow("null-mode")]
    [DataRow("unknown-mode")]
    [DataRow("arbitrary-prompt")]
    public async Task MalformedGraphQlInputsAreNotSilentlyDefaulted(string mutation)
    {
        var input = JsonNode.Parse(ContractJson.Write(StubData.Request(
            ScenarioId.S1, Audience.Casual, SourceMode.Authored)))!.AsObject();
        switch (mutation)
        {
            case "missing-mode": input.Remove("sourceMode"); break;
            case "null-mode": input["sourceMode"] = null; break;
            case "unknown-mode": input["sourceMode"] = "live-ai"; break;
            case "arbitrary-prompt": input["prompt"] = "invented input"; break;
        }
        var variables = mutation == "missing-input" ? "{}" : new JsonObject { ["input"] = input }.ToJsonString();
        await using var executor = await StubExecutor.CreateAsync();
        var payload = await executor.ExecuteAsync(Operations(), "Explain", variables, TestContext.CancellationToken);
        Assert.IsTrue(payload.TryGetProperty("errors", out var errors), payload.ToString());
        Assert.IsGreaterThan(0, errors.GetArrayLength());
        Assert.IsTrue(!payload.TryGetProperty("data", out var data) || data.ValueKind == JsonValueKind.Null);
    }

    [TestMethod]
    public async Task VersionMismatchAndBlankRequestRemainExplicitErrors()
    {
        await using var executor = await StubExecutor.CreateAsync();
        var request = StubData.Request(ScenarioId.S1, Audience.Casual, SourceMode.Authored);
        foreach (var (changed, expected) in new[]
        {
            (request with { ContentVersion = "not-this-content" }, "CONTENT_VERSION_MISMATCH"),
            (request with { SchemaVersion = "0.1" }, "INVALID_REQUEST"),
            (request with { RequestId = " " }, "INVALID_REQUEST")
        })
        {
            var payload = await executor.ExecuteAsync(Operations(), "Explain",
                ContractJson.Write(new { input = changed }), TestContext.CancellationToken);
            Assert.IsFalse(payload.TryGetProperty("errors", out _), payload.ToString());
            Assert.AreEqual(expected, payload.GetProperty("data").GetProperty("explain").GetProperty("code").GetString());
        }
    }

    [TestMethod]
    public async Task TheApplicationStillHasNoGraphQlEndpointOrStubDependency()
    {
        using var application = new WebApplicationFactory<Program>();
        using var client = application.CreateClient();
        using var response = await client.PostAsync("/graphql",
            new StringContent("""{"query":"{ scenarios { id } }"}"""), TestContext.CancellationToken);
        Assert.AreEqual(System.Net.HttpStatusCode.NotFound, response.StatusCode);
        Assert.IsFalse(typeof(Program).Assembly.GetReferencedAssemblies()
            .Any(assembly => assembly.Name == "VarAI.ContractStubs"));
        Assert.IsFalse(typeof(StubData).Assembly.GetReferencedAssemblies()
            .Any(assembly => assembly.Name == "VarAI.Server"));
    }

    private static string Operations()
    {
        using var stream = typeof(GraphQlContractTests).Assembly.GetManifestResourceStream("ContractOperations")
            ?? throw new InvalidOperationException("Missing test operations resource.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
