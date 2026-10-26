using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using VarAI.Server.Feeds;
using VarAI.Server.Narration;

namespace VarAI.Server.Tests.Integration;

[TestClass]
public sealed class NarrationConfigurationTests
{
    public required TestContext TestContext { get; set; }

    private static WebApplicationFactory<Program> Application(Dictionary<string, string?> settings) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseEnvironment("Development").ConfigureAppConfiguration((_, configuration) =>
            {
                var values = new Dictionary<string, string?> { ["Explanations:LiveEnabled"] = "false" };
                foreach (var pair in settings)
                {
                    values[pair.Key] = pair.Value;
                }

                configuration.AddInMemoryCollection(values);
            }));

    [TestMethod]
    public async Task NarrationLimitsBindFromConfiguration()
    {
        using var application = Application(new()
        {
            ["Narration:Enabled"] = "true",
            ["Narration:MaxModelCalls"] = "7",
            ["Explanations:AzureOpenAi:Endpoint"] = "https://fictional-narration-test.openai.azure.com/",
            ["Explanations:AzureOpenAi:DeploymentName"] = "fictional-deployment",
            ["Explanations:AzureOpenAi:AuthMode"] = "ManagedIdentity",
            ["Explanations:AzureOpenAi:ManagedIdentityClientId"] = "11111111-2222-3333-4444-555555555555",
        });
        using var client = application.CreateClient();

        using var response = await client.GetAsync("/api/narration", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.CancellationToken));
        Assert.IsTrue(document.RootElement.GetProperty("enabled").GetBoolean());
        Assert.AreEqual("fictional-deployment", document.RootElement.GetProperty("deployment").GetString());
        Assert.AreEqual(7, document.RootElement.GetProperty("callLimit").GetInt32());
        Assert.AreEqual(0, document.RootElement.GetProperty("callsUsed").GetInt32());
    }

    [TestMethod]
    public async Task EnabledButMisconfiguredNarrationFallsBackWithoutAnyNetworkCall()
    {
        using var application = Application(new()
        {
            ["Narration:Enabled"] = "true",
            ["Explanations:AzureOpenAi:Endpoint"] = "https://not-an-azure-openai-endpoint.example.invalid/",
            ["Explanations:AzureOpenAi:DeploymentName"] = "fictional-deployment",
            ["Explanations:AzureOpenAi:AuthMode"] = "ManagedIdentity",
        });
        var service = application.Services.GetRequiredService<NarrationService>();
        var cue = application.Services.GetRequiredService<SyntheticMatchTimeline>().Overlays[0];

        var narration = await service.GetAsync(cue, NarrationLanguage.Tamil, TestContext.CancellationToken);

        Assert.AreEqual(NarrationSources.Fallback, narration.Source);
        Assert.AreEqual(FallbackReasons.NotConfigured, narration.FallbackReason);
        Assert.AreEqual("en", narration.Language);
        Assert.AreEqual(cue.Headline, narration.Text.Headline);
    }

    public static IEnumerable<object[]> InvalidSettings =>
    [
        ["unknown auth mode", "Explanations:AzureOpenAi:AuthMode", "Passwordless", "AuthMode"],
        ["auth mode is case sensitive", "Explanations:AzureOpenAi:AuthMode", "managedidentity", "AuthMode"],
        ["no concurrency", "Narration:MaxConcurrency", "0", "MaxConcurrency"],
        ["negative call budget", "Narration:MaxModelCalls", "-1", "MaxModelCalls"],
        ["zero attempts", "Narration:MaxAttemptsPerNarration", "0", "MaxAttemptsPerNarration"],
        ["gated speed above the cap", "Gate:MaximumSpeed", "60", "MaximumSpeed"],
        ["no sessions", "Gate:MaxSessions", "0", "MaxSessions"],
        ["unknown reasoning effort", "Narration:ReasoningEffort", "turbo", "ReasoningEffort"],
        ["zero decision window", "Gate:SlaSeconds", "0", "SlaSeconds"],
    ];

    [TestMethod]
    [DynamicData(nameof(InvalidSettings))]
    public void InvalidSettingsStopTheServerAtStartupInsteadOfOnTheFirstRequest(
        string description, string key, string value, string expectedFragment)
    {
        using var application = Application(new()
        {
            ["Narration:Enabled"] = "true",
            [key] = value,
        });

        var failure = Assert.Throws<Exception>(() => application.CreateClient(), description);

        Assert.Contains(expectedFragment, Flatten(failure), description);
    }

    private static string Flatten(Exception exception)
    {
        var text = new System.Text.StringBuilder();
        for (var current = exception; current is not null; current = current.InnerException)
        {
            text.Append(current.GetType().Name).Append(": ").AppendLine(current.Message);
        }

        return text.ToString();
    }
}
