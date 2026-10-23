using VarAI.Server.Explanations;
using VarAI.Server.Feeds;

namespace VarAI.Server.Narration;

public static class NarrationRegistration
{
    public const string Section = "Narration";

    /// <summary>
    /// Registers the narrator. It is off unless Narration:Enabled is true; when on it uses the shared Azure OpenAI settings
    /// and, outside local development, a keyless Microsoft Entra credential (managed identity).
    /// </summary>
    public static IServiceCollection AddVarAiNarration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton(_ =>
        {
            var options = configuration.GetSection(Section).Get<NarrationOptions>() ?? new NarrationOptions();
            options.Validate();
            return options;
        });
        services.AddSingleton(provider => new NarrationFactsFactory(provider.GetRequiredService<SyntheticMatchTimeline>()));
        services.AddSingleton(provider =>
        {
            var options = provider.GetRequiredService<NarrationOptions>();
            var logger = provider.GetRequiredService<ILogger<NarrationService>>();
            var time = provider.GetRequiredService<TimeProvider>();
            INarrationModel? model = null;
            if (options.Enabled)
            {
                var azure = AzureOpenAiConfigurationFactory.FromConfiguration(
                    configuration, configuration.GetValue($"{Section}:MaxCompletionTokens", 2_048));
                var client = new AzureOpenAiChatClient(
                    azure, AzureOpenAiChatClient.CreateHttpMessageHandler(), AzureOpenAiAuthorizers.Create(azure, time));
                if (client.IsConfigured)
                {
                    logger.LogInformation(
                        "Narration is enabled with deployment {Deployment} using {Credential} authentication and reasoning effort {Effort}.",
                        azure.DeploymentName, azure.Credential, options.NormalisedReasoningEffort ?? "default");
                }
                else
                {
                    logger.LogWarning(
                        "Narration is enabled but the Azure OpenAI settings are missing or invalid, so every narration will " +
                        "fall back to deterministic English.");
                }

                model = new AzureOpenAiNarrationModel(client, options.NormalisedReasoningEffort);
            }

            return new NarrationService(provider.GetRequiredService<NarrationFactsFactory>(), model, options, time, logger);
        });
        return services;
    }
}
