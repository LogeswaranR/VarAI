using Azure.Monitor.OpenTelemetry.AspNetCore;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace VarAI.Server.Telemetry;

public static class TelemetryRegistration
{
    public const string ConnectionStringKey = "APPLICATIONINSIGHTS_CONNECTION_STRING";
    public const string ServiceName = "varai-server";

    /// <summary>
    /// Exports traces, metrics and logs to Application Insights, but only when a connection string is configured. Without
    /// one nothing is registered and no telemetry leaves the process. The connection string is read here and never logged.
    /// </summary>
    public static bool AddVarAiTelemetry(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        var connectionString = configuration[ConnectionStringKey];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return false;
        }

        services.AddOpenTelemetry()
            .AddVarAiInstrumentation()
            .UseAzureMonitor(options =>
            {
                options.ConnectionString = connectionString;
                // Every span of this small demo is wanted, and the live-metrics stream adds background network calls.
                options.SamplingRatio = 1.0F;
                options.TracesPerSecond = null;
                options.EnableLiveMetrics = false;
            });
        return true;
    }

    /// <summary>The part that does not depend on a destination: the service name, our span source and our meter.</summary>
    public static OpenTelemetryBuilder AddVarAiInstrumentation(this OpenTelemetryBuilder builder) =>
        builder
            .ConfigureResource(resource => resource.AddService(ServiceName))
            .WithTracing(tracing => tracing.AddSource(VarAiTelemetry.SourceName))
            .WithMetrics(metrics => metrics.AddMeter(VarAiTelemetry.SourceName));
}
