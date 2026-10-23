using VarAI.Server.Feeds;
using VarAI.Server.Narration;

namespace VarAI.Server.Gate;

public static class GateRegistration
{
    public const string Section = "Gate";

    public static IServiceCollection AddVarAiGate(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton(_ =>
        {
            var options = configuration.GetSection(Section).Get<GateOptions>() ?? new GateOptions();
            options.Validate();
            return options;
        });
        services.AddSingleton(provider => new GateSessionStore(
            provider.GetRequiredService<SyntheticMatchTimeline>(), provider.GetRequiredService<NarrationService>(),
            provider.GetRequiredService<GateOptions>(), provider.GetRequiredService<TimeProvider>(),
            provider.GetRequiredService<ILoggerFactory>()));
        return services;
    }
}
