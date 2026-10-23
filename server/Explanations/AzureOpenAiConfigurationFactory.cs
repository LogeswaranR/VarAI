namespace VarAI.Server.Explanations;

/// <summary>
/// Reads the shared Azure OpenAI connection settings (the section is named Explanations for historical reasons) for the
/// offside explainer and the match narrator. Missing values stay null so validation, not configuration binding, decides.
/// </summary>
public static class AzureOpenAiConfigurationFactory
{
    public const string Section = "Explanations:AzureOpenAi";

    public static AzureOpenAiConfiguration FromConfiguration(IConfiguration configuration, int maximumCompletionTokens = 2_048)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var section = configuration.GetSection(Section);
        var mode = section["AuthMode"];
        var credential = string.IsNullOrWhiteSpace(mode)
            ? AzureOpenAiCredentialKind.ApiKey
            : Enum.TryParse(mode, ignoreCase: false, out AzureOpenAiCredentialKind parsed) && Enum.IsDefined(parsed)
                ? parsed
                : throw new InvalidOperationException(
                    $"{Section}:AuthMode must be one of {string.Join(", ", Enum.GetNames<AzureOpenAiCredentialKind>())}.");
        return new AzureOpenAiConfiguration(section["Endpoint"], section["DeploymentName"], NullIfEmpty(section["ApiKey"]), maximumCompletionTokens)
        {
            Credential = credential,
            ManagedIdentityClientId = NullIfEmpty(section["ManagedIdentityClientId"]),
            TokenScope = NullIfEmpty(section["TokenScope"]),
        };
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
