using VarAI.Contracts;
using VarAI.Scenarios;

namespace VarAI.Server.Tests.Scenarios;

internal static class ScenarioTestData
{
    internal static async Task<Scenario[]> LoadAsync(CancellationToken cancellationToken)
    {
        IScenarioRepository repository = new SyntheticScenarioRepository();
        var scenarios = new List<Scenario>();
        foreach (var id in Enum.GetValues<ScenarioId>())
        {
            var scenario = await repository.FindAsync(id, cancellationToken);
            Assert.IsNotNull(scenario);
            scenarios.Add(scenario);
        }
        return scenarios.ToArray();
    }

    internal static async Task<Scenario[]> MutableCopyAsync(CancellationToken cancellationToken) =>
        ContractJson.Read<Scenario[]>(ContractJson.Write(await LoadAsync(cancellationToken)));

    internal static ExplanationBody Body(Scenario scenario, Audience audience) =>
        audience == Audience.Casual ? scenario.AuthoredExplanations.Casual : scenario.AuthoredExplanations.Analyst;

    internal static IEnumerable<Claim> Claims(ExplanationBody body) =>
        new[] { body.Headline }.Concat(body.Points).Append(body.Recap);
}
