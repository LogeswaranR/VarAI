using VarAI.Contracts;

namespace VarAI.Server.Explanations;

public sealed class ExplanationProviderException : Exception
{
    public ErrorCode Code { get; }

    public ExplanationProviderException(ErrorCode code) : base("The explanation provider did not return a usable response.")
    {
        if (code is not (ErrorCode.ModelNotConfigured or ErrorCode.ModelUnavailable or ErrorCode.InvalidOutput))
        {
            throw new ArgumentOutOfRangeException(nameof(code));
        }
        Code = code;
    }
}
