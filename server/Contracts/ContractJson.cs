using System.Text.Json;
using System.Text.Json.Serialization;

namespace VarAI.Contracts;

public static class ContractJson
{
    public static JsonSerializerOptions Options { get; } = CreateOptions();

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = false,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            RespectRequiredConstructorParameters = true,
            RespectNullableAnnotations = true,
            WriteIndented = true
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper, false));
        options.MakeReadOnly(populateMissingResolver: true);
        return options;
    }

    public static T Read<T>(string json) where T : notnull
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            CheckStructure(document.RootElement);
            var value = JsonSerializer.Deserialize<T>(json, Options)
                ?? throw new ContractViolationException("The contract document must not be null.");
            ContractRules.Require(JsonElement.DeepEquals(document.RootElement, JsonSerializer.SerializeToElement(value, Options)),
                "Contract values must not be coerced, omitted or silently normalized.");
            return value;
        }
        catch (JsonException exception)
        {
            throw new ContractViolationException(
                $"Malformed contract document at {exception.Path ?? "$"}.", exception);
        }
    }

    private static void CheckStructure(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in value.EnumerateArray())
            {
                ContractRules.Require(item.ValueKind != JsonValueKind.Null, "Contract lists cannot contain null entries.");
                CheckStructure(item);
            }
        }
        else if (value.ValueKind == JsonValueKind.Object)
        {
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            {
                ContractRules.Require(keys.Add(property.Name), "Duplicate JSON property.");
                CheckStructure(property.Value);
            }
        }
    }

    public static string Write<T>(T value) => JsonSerializer.Serialize(value, Options);
}

public sealed class ContractViolationException(string message, Exception? innerException = null)
    : Exception(message, innerException);
