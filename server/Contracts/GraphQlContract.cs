using HotChocolate;
using HotChocolate.Execution.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace VarAI.Contracts;

public static class GraphQlContract
{
    public static IRequestExecutorBuilder AddVarAiContract(this IServiceCollection services) =>
        services.AddGraphQL()
            .ModifyOptions(options => options.SortFieldsByName = true)
            .AddQueryType<ContractQuery>()
            .AddMutationType<ContractMutation>()
            .AddType<Scenario>()
            .AddType<ExplanationSuccess>()
            .AddType<ContractError>()
            .AddType<BooleanFactValue>()
            .AddType<PositionFactValue>()
            .AddType<InvolvementFactValue>()
            .AddType<PlayTypeFactValue>();
}

[GraphQLName("Query")]
public sealed class ContractQuery
{
    public Task<IReadOnlyList<ScenarioSummary>> GetScenariosAsync(
        [Service] IScenarioRepository repository, CancellationToken cancellationToken) =>
        repository.ListAsync(cancellationToken);

    public async Task<IScenarioResult> GetScenarioAsync(
        string id, string requestId, [Service] IScenarioRepository repository, CancellationToken cancellationToken)
    {
        ContractRules.Text(requestId, "requestId");
        if (!Enum.TryParse<ScenarioId>(id, out var scenarioId) || !Enum.IsDefined(scenarioId) || scenarioId.ToString() != id)
        {
            return ContractErrors.Create(ErrorCode.ScenarioNotFound, requestId);
        }
        var scenario = await repository.FindAsync(scenarioId, cancellationToken);
        return scenario is null ? ContractErrors.Create(ErrorCode.ScenarioNotFound, requestId) : scenario;
    }
}

[GraphQLName("Mutation")]
public sealed class ContractMutation
{
    public Task<IExplanationResult> ExplainAsync(
        ExplanationRequest input, [Service] IExplanationService service, CancellationToken cancellationToken) =>
        service.ExplainAsync(input, cancellationToken);
}
