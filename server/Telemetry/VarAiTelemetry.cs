using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace VarAI.Server.Telemetry;

/// <summary>
/// The single ActivitySource and Meter for VarAI. Spans and counters are always emitted in-process (cheap and testable);
/// they only leave the process when an exporter such as Azure Monitor is configured.
/// </summary>
public static class VarAiTelemetry
{
    public const string SourceName = "VarAI.Server";

    public static readonly ActivitySource Source = new(SourceName, "1.0.0");
    public static readonly Meter Meter = new(SourceName, "1.0.0");

    public static readonly Counter<long> ModelCalls =
        Meter.CreateCounter<long>("varai.narration.model_calls", "{call}", "Model calls started by the narrator.");

    public static readonly Counter<long> ModelTokens =
        Meter.CreateCounter<long>("varai.narration.tokens", "{token}", "Tokens reported by the model service.");

    public static readonly Histogram<double> ModelLatency =
        Meter.CreateHistogram<double>("varai.narration.latency", "ms", "Model call latency including verification.");

    public static readonly Counter<long> Narrations =
        Meter.CreateCounter<long>("varai.narration.results", "{narration}", "Narration results by source and fallback reason.");

    public static readonly Counter<long> Decisions =
        Meter.CreateCounter<long>("varai.gate.decisions", "{decision}", "Operator and system decisions by action.");
}
