using VarAI.Contracts;

namespace VarAI.Server.Explanations;

public sealed class ExplanationService(
    IScenarioRepository repository,
    IExplanationProvider provider,
    IExplanationOutputValidator outputValidator,
    TimeProvider timeProvider) : IExplanationService
{
    private static readonly TimeSpan Deadline = TimeSpan.FromMilliseconds(ContractRules.AttemptDeadlineMs);
    private readonly IScenarioRepository repository = repository ?? throw new ArgumentNullException(nameof(repository));
    private readonly IExplanationProvider provider = provider ?? throw new ArgumentNullException(nameof(provider));
    private readonly IExplanationOutputValidator outputValidator = outputValidator ?? throw new ArgumentNullException(nameof(outputValidator));
    private readonly TimeProvider timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));

    public async Task<IExplanationResult> ExplainAsync(ExplanationRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var started = timeProvider.GetTimestamp();
        var requestId = string.IsNullOrWhiteSpace(request?.RequestId) ? $"attempt-{Guid.NewGuid():N}" : request!.RequestId;
        using var deadline = new CancellationTokenSource(Deadline, timeProvider);
        using var attempt = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, deadline.Token);
        IExplanationResult result;
        try
        {
            result = await ExplainCoreAsync(request, requestId, attempt.Token);
        }
        catch (OperationCanceledException) when (attempt.IsCancellationRequested)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return ContractErrors.Create(ErrorCode.Timeout, requestId);
        }

        cancellationToken.ThrowIfCancellationRequested();
        return deadline.IsCancellationRequested || timeProvider.GetElapsedTime(started) >= Deadline
            ? ContractErrors.Create(ErrorCode.Timeout, requestId)
            : result;
    }

    private async Task<IExplanationResult> ExplainCoreAsync(
        ExplanationRequest? request, string requestId, CancellationToken cancellationToken)
    {
        try
        {
            ContractRules.Require(request is not null, "Invalid request identity.");
            ContractRules.Request(request!);
        }
        catch (ContractViolationException)
        {
            return ContractErrors.Create(ErrorCode.InvalidRequest, requestId);
        }

        Scenario? scenario;
        try
        {
            scenario = await WaitAsync(repository.FindAsync(request!.ScenarioId, cancellationToken), cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            if (scenario is null)
            {
                return ContractErrors.Create(ErrorCode.ScenarioNotFound, requestId);
            }

            // Validate a private snapshot, including null/shape checks absent from typed records.
            scenario = ContractJson.Read<Scenario>(ContractJson.Write(scenario));
            ContractRules.Scenario(scenario);
            ContractRules.Require(scenario.Id == request.ScenarioId, "Repository returned a different scenario.");
        }
        catch (Exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return ContractErrors.Create(ErrorCode.InvalidOutput, requestId);
        }

        if (scenario.ContentVersion != request!.ContentVersion)
        {
            return ContractErrors.Create(ErrorCode.ContentVersionMismatch, requestId);
        }
        cancellationToken.ThrowIfCancellationRequested();

        ExplanationSuccess response;
        if (request.SourceMode == SourceMode.Authored)
        {
            var body = request.Audience == Audience.Casual
                ? scenario.AuthoredExplanations.Casual : scenario.AuthoredExplanations.Analyst;
            response = new(request.SchemaVersion, request.RequestId, scenario.Id, scenario.ContentVersion,
                request.Audience, body.SourceMode, body.Status, body.Interpretation,
                body.Headline, body.Points, body.Limitations, body.Recap);
        }
        else
        {
            var input = new GenerationInput(
                scenario.SchemaVersion, scenario.Id, scenario.ContentVersion, request.Audience,
                scenario.OriginalDecision, scenario.SuppliedReviewOutcome, scenario.Match.ScoreBefore,
                scenario.ScoreAfterReview, scenario.Interpretation,
                Array.AsReadOnly(scenario.Facts.ToArray()), Array.AsReadOnly(scenario.Rules.ToArray()));
            string rawOutput;
            try
            {
                rawOutput = await WaitAsync(provider.GenerateAsync(input, cancellationToken), cancellationToken);
                cancellationToken.ThrowIfCancellationRequested();
            }
            catch (ExplanationProviderException exception)
            {
                cancellationToken.ThrowIfCancellationRequested();
                return ContractErrors.Create(exception.Code, requestId);
            }
            catch (Exception)
            {
                cancellationToken.ThrowIfCancellationRequested();
                return ContractErrors.Create(ErrorCode.ModelUnavailable, requestId);
            }

            try
            {
                response = outputValidator.ParseAndValidate(rawOutput, request, scenario, cancellationToken);
            }
            catch (Exception)
            {
                cancellationToken.ThrowIfCancellationRequested();
                return ContractErrors.Create(ErrorCode.InvalidOutput, requestId);
            }
        }

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            ContractRules.Success(response, request, scenario);
            return Freeze(response);
        }
        catch (Exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return ContractErrors.Create(ErrorCode.InvalidOutput, requestId);
        }
    }

    private static async Task<T> WaitAsync<T>(Task<T> task, CancellationToken cancellationToken)
    {
        try
        {
            return await task.WaitAsync(cancellationToken);
        }
        finally
        {
            if (!task.IsCompleted)
            {
                // Observe a non-cooperative dependency's eventual fault, without continuing the attempt.
                _ = task.ContinueWith(static completed => _ = completed.Exception, CancellationToken.None,
                    TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
        }
    }

    private static ExplanationSuccess Freeze(ExplanationSuccess response) => response with
    {
        Headline = Freeze(response.Headline),
        Points = Array.AsReadOnly(response.Points.Select(Freeze).ToArray()),
        Limitations = Array.AsReadOnly(response.Limitations.ToArray()),
        Recap = Freeze(response.Recap)
    };

    private static Claim Freeze(Claim claim) => claim with
    {
        EvidenceIds = Array.AsReadOnly(claim.EvidenceIds.ToArray()),
        RuleIds = Array.AsReadOnly(claim.RuleIds.ToArray())
    };
}
