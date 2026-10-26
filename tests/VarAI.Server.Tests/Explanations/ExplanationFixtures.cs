using VarAI.Contracts;
using VarAI.ContractStubs;
using VarAI.Server.Explanations;

namespace VarAI.Server.Tests.Explanations;

internal static class ExplanationFixtures
{
    internal static Scenario Scenario(ScenarioId id = ScenarioId.S1) =>
        StubData.Scenarios().Single(scenario => scenario.Id == id);

    internal static ExplanationRequest Request(
        ScenarioId id = ScenarioId.S1, Audience audience = Audience.Casual, SourceMode mode = SourceMode.LiveAi) =>
        StubData.Request(id, audience, mode);

    internal static GeneratedExplanation Output(Scenario scenario, Audience audience)
    {
        var body = audience == Audience.Casual ? scenario.AuthoredExplanations.Casual : scenario.AuthoredExplanations.Analyst;
        var limitations = new List<string>
        {
            ExplanationOutputValidator.SyntheticLimitation,
            ExplanationOutputValidator.ProvisionalLimitation
        };
        if (scenario.Id == ScenarioId.S3)
        {
            limitations.Add(ExplanationOutputValidator.MissingEvidenceLimitation);
        }
        return new(scenario.SchemaVersion, scenario.Id, scenario.ContentVersion, audience,
            SourceMode.LiveAi, body.Status, body.Interpretation, body.Headline, body.Points, limitations, body.Recap);
    }

    internal static string Raw(Scenario scenario, Audience audience) => ContractJson.Write(Output(scenario, audience));

    internal static ExplanationService Service(
        IScenarioRepository? repository = null, IExplanationProvider? provider = null,
        IExplanationOutputValidator? validator = null, TimeProvider? clock = null) =>
        new(repository ?? new Repository(), provider ?? new Provider(),
            validator ?? new ExplanationOutputValidator(), clock ?? new ManualTimeProvider());

    internal static ContractError Error(IExplanationResult result, ErrorCode code, string? requestId = null)
    {
        var error = Assert.IsInstanceOfType<ContractError>(result);
        ContractRules.Error(error);
        Assert.AreEqual(code, error.Code);
        if (requestId is not null)
        {
            Assert.AreEqual(requestId, error.RequestId);
        }
        Assert.AreEqual(ContractErrors.IsRetryable(code), error.Retryable);
        Assert.AreEqual(ContractErrors.Create(code, error.RequestId).Message, error.Message);
        return error;
    }

    internal static string Words(int count) =>
        string.Join("\u0085\u00a0\u2003\t\n", Enumerable.Repeat("word", count));

    internal sealed class Repository : IScenarioRepository
    {
        internal Func<ScenarioId, CancellationToken, Task<Scenario?>> Find { get; init; } =
            (id, token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult<Scenario?>(Scenario(id));
            };
        internal int Calls { get; private set; }

        public Task<Scenario?> FindAsync(ScenarioId id, CancellationToken cancellationToken)
        {
            Calls++;
            return Find(id, cancellationToken);
        }

        public Task<IReadOnlyList<ScenarioSummary>> ListAsync(CancellationToken cancellationToken) =>
            throw new InvalidOperationException("The explanation service must never list or substitute scenarios.");
    }

    internal sealed class Provider : IExplanationProvider
    {
        internal Func<GenerationInput, CancellationToken, Task<string>> Generate { get; init; } =
            (input, token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult(Raw(Scenario(input.ScenarioId), input.Audience));
            };
        internal int Calls { get; private set; }
        internal GenerationInput? LastInput { get; private set; }
        internal CancellationToken LastToken { get; private set; }

        public Task<string> GenerateAsync(GenerationInput input, CancellationToken cancellationToken)
        {
            Calls++;
            LastInput = input;
            LastToken = cancellationToken;
            return Generate(input, cancellationToken);
        }
    }

    internal sealed class Validator : IExplanationOutputValidator
    {
        internal Action? OnParse { get; init; }
        internal int Calls { get; private set; }

        public ExplanationSuccess ParseAndValidate(
            string rawOutput, ExplanationRequest request, Scenario scenario, CancellationToken cancellationToken)
        {
            Calls++;
            OnParse?.Invoke();
            return new ExplanationOutputValidator().ParseAndValidate(rawOutput, request, scenario, cancellationToken);
        }
    }
}
