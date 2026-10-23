namespace VarAI.Server.Explanations;

public sealed class AzureOpenAiConfiguration(
    string? endpoint, string? deploymentName, string? apiKey, int maximumCompletionTokens = 2_048)
{
    public string? Endpoint { get; } = endpoint;
    public string? DeploymentName { get; } = deploymentName;
    public int MaximumCompletionTokens { get; } = maximumCompletionTokens;
    internal string? ApiKey { get; } = apiKey;

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
            !IsToken(DeploymentName, 128) || !IsToken(ApiKey, 4_096) ||
            MaximumCompletionTokens is < 1 or > 8_192)
        {
            return false;
        }
        requestUri = new Uri(endpoint, "openai/v1/chat/completions");
        return true;
    }

    private static bool IsToken(string? value, int maximumLength) =>
        value is { Length: > 0 } && value.Length <= maximumLength &&
        value.All(character => character is >= '!' and <= '~');

    public override string ToString() => "Azure OpenAI server configuration (credentials redacted).";
}
