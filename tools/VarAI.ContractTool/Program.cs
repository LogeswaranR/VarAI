using System.Text.Json;
using VarAI.Contracts;
using VarAI.ContractStubs;

var check = args.SequenceEqual(["--check"]);
if (args.Length > 0 && !check)
{
    throw new ArgumentException("Usage: dotnet run --project tools/VarAI.ContractTool [-- --check]");
}
var root = Directory.GetCurrentDirectory();
var operations = await File.ReadAllTextAsync(Path.Combine(root, "contracts", "operations.graphql"));
await using var executor = await StubExecutor.CreateAsync();
await SaveAsync("contracts/schema.graphql", executor.Executor.Schema.ToString()
    ?? throw new InvalidOperationException("The GraphQL schema could not be exported."));
await SaveAsync("client/src/contracts/rules.generated.ts",
    "// Generated from C# ContractRules and ContractErrors; do not edit.\nexport const rules = " +
    ContractJson.Write(new
    {
        schemaVersion = ContractRules.SchemaVersion,
        ruleEdition = ContractRules.RuleEdition,
        attemptDeadlineMs = ContractRules.AttemptDeadlineMs,
        contextEvidenceIds = ContractRules.ContextEvidenceIds,
        eventKinds = Enum.GetValues<EventKind>(),
        wordLimits = Enum.GetValues<Audience>().ToDictionary(
            audience => JsonNamingPolicy.SnakeCaseUpper.ConvertName(audience.ToString()),
            ContractRules.ExplanationWordLimit),
        recapWordLimit = ContractRules.RecapWordLimit,
        retryable = Enum.GetValues<ErrorCode>().ToDictionary(
            code => JsonNamingPolicy.SnakeCaseUpper.ConvertName(code.ToString()), ContractErrors.IsRetryable),
        factExpectations = Enum.GetValues<ScenarioId>().ToDictionary(id => id.ToString(), id =>
            Enum.GetValues<FactKey>().Select(key => new
            {
                key,
                value = ContractRules.ExpectedFactValue(id, key),
                status = ContractRules.ExpectedFactValue(id, key) is null ? EvidenceStatus.Missing : EvidenceStatus.Supplied
            }).ToArray())
    }) + " as const\n");

var scenarioResponses = new List<JsonElement>();
foreach (var id in Enum.GetValues<ScenarioId>())
{
    scenarioResponses.Add(await ExecuteAsync(executor, "Scenario",
        ContractJson.Write(new { id = id.ToString(), requestId = $"stub-query-{id}" })));
}
var summaries = await ExecuteAsync(executor, "Scenarios");
var explanations = new List<object>();
foreach (var id in Enum.GetValues<ScenarioId>())
{
    foreach (var audience in Enum.GetValues<Audience>())
    {
        foreach (var mode in Enum.GetValues<SourceMode>())
        {
            var request = StubData.Request(id, audience, mode);
            explanations.Add(new
            {
                request,
                response = await ExecuteAsync(executor, "Explain", ContractJson.Write(new { input = request }))
            });
        }
    }
}
var errors = new List<object>();
foreach (var error in StubData.Errors())
{
    await using var errorExecutor = await StubExecutor.CreateAsync(error.Code);
    var request = StubData.Request(ScenarioId.S1, Audience.Casual, SourceMode.LiveAi)
        with
    { RequestId = error.RequestId };
    errors.Add(new
    {
        request,
        response = await ExecuteAsync(errorExecutor, "Explain", ContractJson.Write(new { input = request }))
    });
}
await SaveAsync("tests/contract-stubs/responses.generated.ts",
    """
    // Generated from shared fixtures through the in-memory GraphQL schema; never import into the app entry.
    import type { ExplainMutation, ExplainMutationVariables, ScenarioQuery, ScenariosQuery } from '../../client/src/contracts/graphql.generated'

    """ +
    "\nexport const scenarioResponses = " + ContractJson.Write(scenarioResponses) +
    " satisfies ReadonlyArray<{ readonly data: ScenarioQuery }>\n\n" +
    "export const summaryResponse = " + ContractJson.Write(summaries) +
    " satisfies { readonly data: ScenariosQuery }\n\n" +
    "export const explanationCases = " + ContractJson.Write(explanations) +
    " satisfies ReadonlyArray<{ readonly request: ExplainMutationVariables['input']; readonly response: { readonly data: ExplainMutation } }>\n\n" +
    "export const errorCases = " + ContractJson.Write(errors) +
    " satisfies ReadonlyArray<{ readonly request: ExplainMutationVariables['input']; readonly response: { readonly data: ExplainMutation } }>\n");

Console.WriteLine($"Contract {(check ? "drift check" : "generation")} passed: schema, 3 scenarios, 12 explanations, 7 errors.");

async Task<JsonElement> ExecuteAsync(StubExecutor target, string operation, string variables = "{}")
{
    var result = await target.ExecuteAsync(operations, operation, variables);
    if (result.TryGetProperty("errors", out _) || !result.TryGetProperty("data", out var data) ||
        data.ValueKind == JsonValueKind.Null)
    {
        throw new InvalidOperationException($"Contract fixture operation {operation} failed: {result}");
    }
    return result;
}

async Task SaveAsync(string relativePath, string content)
{
    var path = Path.Combine(root, relativePath);
    content = content.ReplaceLineEndings("\n").TrimEnd() + "\n";
    if (check)
    {
        if (!File.Exists(path) || await File.ReadAllTextAsync(path) != content)
        {
            throw new InvalidOperationException($"{relativePath} is stale. Run npm run contracts:generate.");
        }
    }
    else
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("The generated file must have a parent directory."));
        await File.WriteAllTextAsync(path, content);
    }
}
