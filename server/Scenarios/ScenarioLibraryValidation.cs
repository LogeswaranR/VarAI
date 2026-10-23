using System.Text.Json;
using VarAI.Contracts;

namespace VarAI.Scenarios;

internal static class ScenarioLibraryValidation
{
    internal static IReadOnlyList<Scenario> ValidateAndFreeze(IEnumerable<Scenario> scenarios)
    {
        ArgumentNullException.ThrowIfNull(scenarios);
        var records = scenarios.ToArray();
        Scenario[] snapshot;
        try
        {
            // The strict contract round trip rejects malformed nested data and detaches caller-owned collections.
            snapshot = ContractJson.Read<Scenario[]>(ContractJson.Write(records));
        }
        catch (Exception exception) when (exception is JsonException or NotSupportedException or ArgumentException)
        {
            // System.Text.Json reports non-finite numeric values as ArgumentException.
            throw new ContractViolationException("The scenario library contains unsupported contract data.", exception);
        }

        ContractRules.Require(snapshot.Select(scenario => scenario.Id).Distinct().Count() == snapshot.Length,
            "Scenario IDs must be unique within a library.");
        ContractRules.Require(snapshot.Select(scenario => scenario.Id).Order().SequenceEqual(Enum.GetValues<ScenarioId>()),
            "A scenario library must contain S1, S2 and S3 exactly once.");
        foreach (var scenario in snapshot)
        {
            ContractRules.Scenario(scenario);
            ContractRules.Require(scenario.Match.ScoreBefore == new Score(0, 0),
                "This synthetic family starts from the canonical 0-0 score.");
        }

        var first = snapshot.Single(scenario => scenario.Id == ScenarioId.S1);
        var second = snapshot.Single(scenario => scenario.Id == ScenarioId.S2);
        ContractRules.Pair(first, second);

        return Freeze(snapshot.OrderBy(scenario => scenario.Id).Select(FreezeScenario));
    }

    private static Scenario FreezeScenario(Scenario scenario) => scenario with
    {
        Facts = Freeze(scenario.Facts),
        Rules = Freeze(scenario.Rules),
        Events = Freeze(scenario.Events.Select(item => item with { RevealFactIds = Freeze(item.RevealFactIds) })),
        Diagram = scenario.Diagram with { Markers = Freeze(scenario.Diagram.Markers) },
        AuthoredExplanations = new(
            FreezeBody(scenario.AuthoredExplanations.Casual), FreezeBody(scenario.AuthoredExplanations.Analyst))
    };

    private static ExplanationBody FreezeBody(ExplanationBody body) => body with
    {
        Headline = FreezeClaim(body.Headline),
        Points = Freeze(body.Points.Select(FreezeClaim)),
        Limitations = Freeze(body.Limitations),
        Recap = FreezeClaim(body.Recap)
    };

    private static Claim FreezeClaim(Claim claim) => claim with
    {
        EvidenceIds = Freeze(claim.EvidenceIds),
        RuleIds = Freeze(claim.RuleIds)
    };

    private static IReadOnlyList<T> Freeze<T>(IEnumerable<T> items) => Array.AsReadOnly(items.ToArray());
}
