namespace VarAI.Contracts;

public static class ContractErrors
{
    public static bool IsRetryable(ErrorCode code) =>
        code is ErrorCode.ModelUnavailable or ErrorCode.Timeout or ErrorCode.InvalidOutput;

    public static ContractError Create(ErrorCode code, string requestId)
    {
        ContractRules.Text(requestId, "requestId");
        var message = code switch
        {
            ErrorCode.InvalidRequest => "The request is invalid.",
            ErrorCode.ScenarioNotFound => "The requested scenario is unavailable.",
            ErrorCode.ContentVersionMismatch => "The scenario version has changed. Reload the scenario.",
            ErrorCode.ModelNotConfigured => "Live explanations are not configured.",
            ErrorCode.ModelUnavailable => "The explanation provider is unavailable.",
            ErrorCode.Timeout => "The explanation attempt timed out.",
            ErrorCode.InvalidOutput => "The explanation response could not be validated.",
            _ => throw new ContractViolationException("Unknown error code.")
        };
        return new(ContractRules.SchemaVersion, requestId, ResponseStatus.Error, code, message, IsRetryable(code));
    }
}
