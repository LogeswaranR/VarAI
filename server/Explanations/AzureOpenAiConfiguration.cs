namespace VarAI.Server.Explanations;

public enum AzureOpenAiCredentialKind
{
    /// <summary>Resource key sent in the api-key header (the original local mode).</summary>
    ApiKey,

    /// <summary>Microsoft Entra token from the Azure Container Apps managed identity; no key exists anywhere.</summary>
    ManagedIdentity,

    /// <summary>Microsoft Entra token from the developer's `az login` session; no key exists anywhere.</summary>
    AzureCli,
}

public sealed class AzureOpenAiConfiguration(
    string? endpoint, string? deploymentName, string? apiKey, int maximumCompletionTokens = 2_048)
{
    public const string DefaultTokenScope = "https://ai.azure.com/.default";
    public const string LegacyTokenScope = "https://cognitiveservices.azure.com/.default";

    public string? Endpoint { get; } = endpoint;
    public string? DeploymentName { get; } = deploymentName;
    public int MaximumCompletionTokens { get; } = maximumCompletionTokens;
    internal string? ApiKey { get; } = apiKey;

    public AzureOpenAiCredentialKind Credential { get; init; } = AzureOpenAiCredentialKind.ApiKey;

    /// <summary>Client ID of a user-assigned managed identity; null selects the system-assigned identity.</summary>
    public string? ManagedIdentityClientId { get; init; }

    /// <summary>Entra token scope; null selects <see cref="DefaultTokenScope"/>. Only the two documented scopes are accepted.</summary>
    public string? TokenScope { get; init; }

    internal string EffectiveTokenScope => TokenScope ?? DefaultTokenScope;

    internal bool TryGetRequestUri(out Uri requestUri)
    {
        requestUri = null!;
        if (Endpoint is null || Endpoint != Endpoint.Trim() ||
            !Uri.TryCreate(Endpoint, UriKind.Absolute, out var endpoint) ||
            endpoint.Scheme != Uri.UriSchemeHttps || !endpoint.IsDefaultPort ||
            endpoint.UserInfo.Length != 0 || endpoint.Query.Length != 0 || endpoint.Fragment.Length != 0 ||
            endpoint.AbsolutePath != "/" || !endpoint.Host.EndsWith(".openai.azure.com", StringComparison.Ordinal))
        {
            return false;
        }
        var resource = endpoint.Host[..^".openai.azure.com".Length];
        if (resource.Length is < 1 or > 63 || resource[0] == '-' || resource[^1] == '-' ||
            resource.Any(character => !char.IsAsciiLetterOrDigit(character) && character != '-') ||
            !IsToken(DeploymentName, 128) || !HasValidCredential() ||
            MaximumCompletionTokens is < 1 or > 8_192)
        {
            return false;
        }
        requestUri = new Uri(endpoint, "openai/v1/chat/completions");
        return true;
    }

    private bool HasValidCredential() => Credential switch
    {
        AzureOpenAiCredentialKind.ApiKey => IsToken(ApiKey, 4_096) && ManagedIdentityClientId is null && TokenScope is null,
        AzureOpenAiCredentialKind.ManagedIdentity => ApiKey is null && IsKeylessSetup(allowClientId: true),
        AzureOpenAiCredentialKind.AzureCli => ApiKey is null && IsKeylessSetup(allowClientId: false),
        _ => false,
    };

    private bool IsKeylessSetup(bool allowClientId) =>
        (TokenScope is null || TokenScope is DefaultTokenScope or LegacyTokenScope) &&
        (ManagedIdentityClientId is null ||
            (allowClientId && ManagedIdentityClientId.Length == 36 && Guid.TryParseExact(ManagedIdentityClientId, "D", out _)));

    private static bool IsToken(string? value, int maximumLength) =>
        value is { Length: > 0 } && value.Length <= maximumLength &&
        value.All(character => character is >= '!' and <= '~');

    public override string ToString() => "Azure OpenAI server configuration (credentials redacted).";
}
