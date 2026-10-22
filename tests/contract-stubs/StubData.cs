using VarAI.Contracts;

namespace VarAI.ContractStubs;

public static class StubData
{
    public static string ReadResource(string name)
    {
        using var stream = typeof(StubData).Assembly.GetManifestResourceStream($"VarAI.ContractStubs.{name}")
            ?? throw new InvalidOperationException($"Missing contract fixture resource: {name}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    public static Scenario[] Scenarios()
    {
        var scenarios = ContractJson.Read<Scenario[]>(ReadResource("scenarios.json"));
        ContractRules.Require(scenarios.Select(item => item.Id).SequenceEqual(Enum.GetValues<ScenarioId>()),
            "Fixtures must contain S1, S2 and S3 exactly once.");
        foreach (var scenario in scenarios)
        {
            ContractRules.Scenario(scenario);
        }
        ContractRules.Pair(scenarios[0], scenarios[1]);
        return scenarios;
    }

    public static ContractError[] Errors()
    {
        var errors = ContractJson.Read<ContractError[]>(ReadResource("errors.json"));
        ContractRules.Require(errors.Select(item => item.Code).SequenceEqual(Enum.GetValues<ErrorCode>()),
            "Fixtures must cover every error code exactly once.");
        foreach (var error in errors)
        {
            ContractRules.Error(error);
        }
        return errors;
    }

    public static ExplanationRequest Request(ScenarioId id, Audience audience, SourceMode mode) =>
        new(ContractRules.SchemaVersion, $"stub-{id}-{audience}-{mode}", id, "stub-0.2.0", audience, mode);
}

public sealed class StubScenarioRepository : IScenarioRepository
{
    public Task<IReadOnlyList<ScenarioSummary>> ListAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IReadOnlyList<ScenarioSummary> summaries = StubData.Scenarios()
            .Select(item => new ScenarioSummary(item.Id, item.ContentVersion, item.Synthetic, item.Label)).ToArray();
        return Task.FromResult(summaries);
    }

    public Task<Scenario?> FindAsync(ScenarioId id, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(StubData.Scenarios().SingleOrDefault(item => item.Id == id));
    }
}

public sealed class StubExplanationService(IScenarioRepository repository, ErrorCode? forcedError = null)
    : IExplanationService
{
    public async Task<IExplanationResult> ExplainAsync(ExplanationRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            ContractRules.Request(request);
        }
        catch (ContractViolationException)
        {
            return ContractErrors.Create(ErrorCode.InvalidRequest,
                string.IsNullOrWhiteSpace(request.RequestId) ? "stub-invalid-request" : request.RequestId);
        }
        if (forcedError is not null)
        {
            return StubData.Errors().Single(error => error.Code == forcedError) with { RequestId = request.RequestId };
        }
        var scenario = await repository.FindAsync(request.ScenarioId, cancellationToken);
        if (scenario is null)
        {
            return ContractErrors.Create(ErrorCode.ScenarioNotFound, request.RequestId);
        }
        if (scenario.ContentVersion != request.ContentVersion)
        {
            return ContractErrors.Create(ErrorCode.ContentVersionMismatch, request.RequestId);
        }
        var body = request.Audience == Audience.Casual
            ? scenario.AuthoredExplanations.Casual : scenario.AuthoredExplanations.Analyst;
        var limitations = body.Limitations.ToList();
        if (request.SourceMode == SourceMode.LiveAi)
        {
            limitations.Add("SIMULATED LIVE-AI TEST STUB: no model was called; this is authored fixture content.");
        }
        var result = new ExplanationSuccess(
            request.SchemaVersion, request.RequestId, request.ScenarioId, request.ContentVersion,
            request.Audience, request.SourceMode, body.Status, body.Interpretation,
            body.Headline, body.Points, limitations, body.Recap);
        ContractRules.Success(result, request, scenario);
        return result;
    }
}

public sealed class ConstantProviderStub(string response) : IExplanationProvider
{
    public Task<string> GenerateAsync(GenerationInput input, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(response);
    }
}

public sealed class CancellableProviderStub : IExplanationProvider
{
    public async Task<string> GenerateAsync(GenerationInput input, CancellationToken cancellationToken)
    {
        await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
        throw new InvalidOperationException("The cancellation-only provider must not return a response.");
    }
}
