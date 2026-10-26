using VarAI.Contracts;

namespace VarAI.Scenarios;

public sealed class SyntheticScenarioRepository : IScenarioRepository
{
    private readonly Dictionary<ScenarioId, Scenario> scenarios;
    private readonly IReadOnlyList<ScenarioSummary> summaries;

    public SyntheticScenarioRepository() : this(SyntheticScenarioLibrary.Create())
    {
    }

    public SyntheticScenarioRepository(IEnumerable<Scenario> scenarios)
    {
        var validated = ScenarioLibraryValidation.ValidateAndFreeze(scenarios);
        this.scenarios = validated.ToDictionary(scenario => scenario.Id);
        summaries = Array.AsReadOnly(validated.Select(scenario =>
            new ScenarioSummary(scenario.Id, scenario.ContentVersion, scenario.Synthetic, scenario.Label)).ToArray());
    }

    public Task<IReadOnlyList<ScenarioSummary>> ListAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(summaries);
    }

    public Task<Scenario?> FindAsync(ScenarioId id, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(scenarios.GetValueOrDefault(id));
    }

    // A package-local version guard; the shared repository interface and GraphQL operations are unchanged.
    public Task<IScenarioResult> FindAsync(
        ScenarioId id, string contentVersion, string requestId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(requestId))
        {
            return Result(ContractErrors.Create(ErrorCode.InvalidRequest, Guid.NewGuid().ToString("N")));
        }
        if (string.IsNullOrWhiteSpace(contentVersion))
        {
            return Result(ContractErrors.Create(ErrorCode.InvalidRequest, requestId));
        }
        if (!scenarios.TryGetValue(id, out var scenario))
        {
            return Result(ContractErrors.Create(ErrorCode.ScenarioNotFound, requestId));
        }
        if (scenario.ContentVersion != contentVersion)
        {
            return Result(ContractErrors.Create(ErrorCode.ContentVersionMismatch, requestId));
        }
        return Result(scenario);
    }

    private static Task<IScenarioResult> Result(IScenarioResult result) => Task.FromResult(result);
}
