using VarAI.Contracts;
using VarAI.ContractStubs;

namespace VarAI.Server.Tests;

[TestClass]
public sealed class FeatureHarnessTests
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task VAR101_RepositoryCanBeExercisedWithoutAnyOtherPackage()
    {
        IScenarioRepository repository = new StubScenarioRepository();
        var summaries = await repository.ListAsync(TestContext.CancellationToken);
        CollectionAssert.AreEquivalent(Enum.GetValues<ScenarioId>(), summaries.Select(item => item.Id).ToArray());
        foreach (var summary in summaries)
        {
            var scenario = await repository.FindAsync(summary.Id, TestContext.CancellationToken);
            Assert.IsNotNull(scenario);
            ContractRules.Scenario(scenario);
            Assert.AreEqual(summary.ContentVersion, scenario.ContentVersion);
        }
    }

    [TestMethod]
    public async Task VAR105_ServiceAndProviderSeamsCanBeExercisedWithoutRealFeatures()
    {
        IScenarioRepository repository = new StubScenarioRepository();
        IExplanationService service = new StubExplanationService(repository);
        var scenario = await repository.FindAsync(ScenarioId.S3, TestContext.CancellationToken);
        Assert.IsNotNull(scenario);
        var request = StubData.Request(ScenarioId.S3, Audience.Analyst, SourceMode.LiveAi);
        var response = Assert.IsInstanceOfType<ExplanationSuccess>(
            await service.ExplainAsync(request, TestContext.CancellationToken));
        ContractRules.Success(response, request, scenario);
        Assert.AreEqual(ResponseStatus.Limited, response.Status);

        IExplanationProvider provider = new ConstantProviderStub(ContractJson.Write(scenario.AuthoredExplanations.Analyst));
        var input = new GenerationInput(scenario.SchemaVersion, scenario.Id, scenario.ContentVersion,
            Audience.Analyst, scenario.OriginalDecision, scenario.SuppliedReviewOutcome, scenario.Match.ScoreBefore,
            scenario.ScoreAfterReview, scenario.Interpretation, scenario.Facts, scenario.Rules);
        var body = ContractJson.Read<ExplanationBody>(await provider.GenerateAsync(input, TestContext.CancellationToken));
        ContractRules.Body(body, scenario, Audience.Analyst);
    }
}
