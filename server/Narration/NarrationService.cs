using System.Collections.Concurrent;
using System.Diagnostics;
using VarAI.Server.Explanations;
using VarAI.Server.Feeds;
using VarAI.Server.Telemetry;

namespace VarAI.Server.Narration;

/// <summary>
/// Produces narration for the synthetic match's cues. Facts come from code, the model only writes words, and every model
/// answer is mechanically verified before it can be used. Results are remembered, model calls are capped for the life of
/// the process, run with bounded concurrency, and pause after repeated failures; any failure yields the cue's
/// deterministic English text, labelled as a fallback.
/// </summary>
public sealed class NarrationService : IDisposable
{
    private static readonly HashSet<string> RetryableReasons = new(StringComparer.Ordinal)
    {
        FallbackReasons.Unavailable,
        FallbackReasons.Timeout,
        FallbackReasons.InvalidOutput,
        FallbackReasons.VerifierFailed,
        FallbackReasons.Cooldown,
    };

    private readonly NarrationFactsFactory factsFactory;
    private readonly INarrationModel? model;
    private readonly NarrationOptions options;
    private readonly TimeProvider time;
    private readonly ILogger<NarrationService> logger;
    private readonly SemaphoreSlim slots;
    private readonly CancellationTokenSource stopping = new();
    private readonly ConcurrentDictionary<string, NarrationFacts> factsByCue = new(StringComparer.Ordinal);
    private readonly Dictionary<(string CueId, string Hash, NarrationLanguage Language), Entry> memo = [];
    private readonly object gate = new();
    private int callsStarted;
    private int consecutiveFailures;
    private DateTimeOffset cooldownUntil = DateTimeOffset.MinValue;

    public NarrationService(
        NarrationFactsFactory factsFactory, INarrationModel? model, NarrationOptions options, TimeProvider time,
        ILogger<NarrationService> logger)
    {
        this.factsFactory = factsFactory ?? throw new ArgumentNullException(nameof(factsFactory));
        this.model = model;
        this.options = options ?? throw new ArgumentNullException(nameof(options));
        this.time = time ?? throw new ArgumentNullException(nameof(time));
        this.logger = logger ?? throw new ArgumentNullException(nameof(logger));
        options.Validate();
        slots = new SemaphoreSlim(options.MaxConcurrency, options.MaxConcurrency);
    }

    public bool Enabled => model is not null && options.Enabled;

    public NarrationStatus Status
    {
        get
        {
            lock (gate)
            {
                return new NarrationStatus(
                    Enabled, Enabled ? model!.Deployment : null, callsStarted, options.MaxModelCalls,
                    time.GetUtcNow() < cooldownUntil);
            }
        }
    }

    public NarrationFacts FactsOf(OverlayCue cue)
    {
        ArgumentNullException.ThrowIfNull(cue);
        return factsByCue.GetOrAdd(cue.OverlayId, _ => factsFactory.Create(cue));
    }

    /// <summary>
    /// Returns the narration for a cue, starting a generation if there is none. The generation is shared by all callers and
    /// is not cancelled when one caller stops waiting.
    /// </summary>
    public Task<CueNarration> GetAsync(OverlayCue cue, NarrationLanguage language, CancellationToken cancellationToken)
    {
        var facts = FactsOf(cue);
        if (!Enabled)
        {
            return Task.FromResult(Count(FallbackNarration.Create(facts, language, FallbackReasons.Disabled)));
        }

        Entry entry;
        lock (gate)
        {
            var key = (facts.CueId, facts.Hash, language);
            memo.TryGetValue(key, out entry!);
            if (entry is null || CanRetry(entry))
            {
                var created = new Entry { CallsMade = entry?.CallsMade ?? 0 };
                created.Task = Task.Run(() => RunAsync(created, facts, language));
                memo[key] = created;
                entry = created;
            }
        }

        return entry.Task.WaitAsync(cancellationToken);
    }

    private bool CanRetry(Entry entry) =>
        entry.Result is { Source: NarrationSources.Fallback, FallbackReason: { } reason } &&
        RetryableReasons.Contains(reason) && entry.CallsMade < options.MaxAttemptsPerNarration &&
        time.GetUtcNow() - entry.CompletedAt >= options.RetryAfter;

    private async Task<CueNarration> RunAsync(Entry entry, NarrationFacts facts, NarrationLanguage language)
    {
        using var activity = VarAiTelemetry.Source.StartActivity("narration.generate");
        activity?.SetTag("varai.cue.id", facts.CueId);
        activity?.SetTag("varai.cue.kind", facts.Kind);
        activity?.SetTag("varai.language", language.Code());
        CueNarration result;
        try
        {
            result = await GenerateAsync(entry, facts, language, activity);
        }
        catch (Exception exception)
        {
            logger.LogError("Narration {CueId} {Language} failed unexpectedly: {ExceptionType}",
                facts.CueId, language.Code(), exception.GetType().Name);
            result = FallbackNarration.Create(facts, language, FallbackReasons.Unavailable);
        }

        lock (gate)
        {
            entry.Result = result;
            entry.CompletedAt = time.GetUtcNow();
        }

        activity?.SetTag("varai.narration.source", result.Source);
        activity?.SetTag("varai.narration.fallback_reason", result.FallbackReason);
        return Count(result);
    }

    private async Task<CueNarration> GenerateAsync(Entry entry, NarrationFacts facts, NarrationLanguage language, Activity? activity)
    {
        using var queueDeadline = new CancellationTokenSource(options.QueueTimeout, time);
        using var queue = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token, queueDeadline.Token);
        try
        {
            await slots.WaitAsync(queue.Token);
        }
        catch (OperationCanceledException)
        {
            return FallbackNarration.Create(facts, language, FallbackReasons.Timeout);
        }

        try
        {
            if (TryReserveCall() is { } refused)
            {
                return FallbackNarration.Create(facts, language, refused);
            }

            lock (gate)
            {
                entry.CallsMade++;
            }

            VarAiTelemetry.ModelCalls.Add(1, new KeyValuePair<string, object?>("language", language.Code()));
            var started = time.GetTimestamp();
            using var callDeadline = new CancellationTokenSource(options.CallTimeout, time);
            using var call = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token, callDeadline.Token);
            NarrationModelResult output;
            try
            {
                output = await model!.GenerateAsync(facts, language, call.Token);
            }
            catch (AzureOpenAiChatException exception)
            {
                RecordTransportFailure();
                return FallbackNarration.Create(facts, language, exception.Failure switch
                {
                    AzureOpenAiChatFailure.NotConfigured => FallbackReasons.NotConfigured,
                    AzureOpenAiChatFailure.InvalidOutput => FallbackReasons.InvalidOutput,
                    _ => FallbackReasons.Unavailable,
                });
            }
            catch (OperationCanceledException)
            {
                RecordTransportFailure();
                return FallbackNarration.Create(facts, language, FallbackReasons.Timeout);
            }
            catch (Exception)
            {
                RecordTransportFailure();
                return FallbackNarration.Create(facts, language, FallbackReasons.Unavailable);
            }

            RecordTransportSuccess();
            var verification = NarrationVerifier.Verify(output.Content, facts, language);
            var latencyMs = (int)time.GetElapsedTime(started).TotalMilliseconds;
            var usage = new NarrationUsage(
                model.Deployment, output.ReportedModel, output.Usage?.PromptTokens ?? 0, output.Usage?.CompletionTokens ?? 0,
                output.Usage?.ReasoningTokens ?? 0, output.Usage?.CachedPromptTokens ?? 0, latencyMs);
            Report(facts, language, usage, verification.Verdict, activity);

            if (verification.Verdict.Passed && verification.Text is { } text)
            {
                return new CueNarration(
                    facts.CueId, language.Code(), language.Code(), NarrationSources.Ai, null, text, verification.Verdict, usage);
            }

            var reason = verification.Verdict.Failures.Any(failure => failure.Check == NarrationVerifier.Schema)
                ? FallbackReasons.InvalidOutput
                : FallbackReasons.VerifierFailed;
            return FallbackNarration.Create(facts, language, reason, verification.Verdict, usage);
        }
        finally
        {
            slots.Release();
        }
    }

    private void Report(
        NarrationFacts facts, NarrationLanguage language, NarrationUsage usage, NarrationVerdict verdict, Activity? activity)
    {
        var languageTag = new KeyValuePair<string, object?>("language", language.Code());
        VarAiTelemetry.ModelTokens.Add(usage.PromptTokens, languageTag, new KeyValuePair<string, object?>("type", "input"));
        VarAiTelemetry.ModelTokens.Add(usage.CompletionTokens, languageTag, new KeyValuePair<string, object?>("type", "output"));
        VarAiTelemetry.ModelLatency.Record(usage.LatencyMs, languageTag);
        activity?.SetTag("gen_ai.request.model", usage.Deployment);
        activity?.SetTag("gen_ai.response.model", usage.ReportedModel);
        activity?.SetTag("gen_ai.usage.input_tokens", usage.PromptTokens);
        activity?.SetTag("gen_ai.usage.output_tokens", usage.CompletionTokens);
        activity?.SetTag("varai.usage.reasoning_tokens", usage.ReasoningTokens);
        activity?.SetTag("varai.latency_ms", usage.LatencyMs);
        activity?.SetTag("varai.verifier.passed", verdict.Passed);
        activity?.SetTag("varai.verifier.failed_checks", string.Join(',', verdict.Failures.Select(failure => failure.Check).Distinct()));
        logger.LogInformation(
            "Narration {CueId} {Language}: tokens in/out/reasoning {Prompt}/{Completion}/{Reasoning}, {LatencyMs} ms, " +
            "mechanical checks passed={Passed}, failed={FailedChecks}",
            facts.CueId, language.Code(), usage.PromptTokens, usage.CompletionTokens, usage.ReasoningTokens, usage.LatencyMs,
            verdict.Passed, string.Join(',', verdict.Failures.Select(failure => failure.Check).Distinct()));
    }

    private CueNarration Count(CueNarration narration)
    {
        VarAiTelemetry.Narrations.Add(
            1,
            new KeyValuePair<string, object?>("source", narration.Source),
            new KeyValuePair<string, object?>("reason", narration.FallbackReason ?? "none"),
            new KeyValuePair<string, object?>("language", narration.RequestedLanguage));
        return narration;
    }

    private string? TryReserveCall()
    {
        lock (gate)
        {
            if (time.GetUtcNow() < cooldownUntil)
            {
                return FallbackReasons.Cooldown;
            }

            if (callsStarted >= options.MaxModelCalls)
            {
                return FallbackReasons.BudgetExhausted;
            }

            callsStarted++;
            return null;
        }
    }

    private void RecordTransportFailure()
    {
        lock (gate)
        {
            if (++consecutiveFailures >= options.FailureThreshold)
            {
                cooldownUntil = time.GetUtcNow() + options.Cooldown;
                consecutiveFailures = 0;
            }
        }
    }

    private void RecordTransportSuccess()
    {
        lock (gate)
        {
            consecutiveFailures = 0;
        }
    }

    public void Dispose()
    {
        stopping.Cancel();
        stopping.Dispose();
        slots.Dispose();
        (model as IDisposable)?.Dispose();
    }

    private sealed class Entry
    {
        public Task<CueNarration> Task { get; set; } = null!;
        public CueNarration? Result { get; set; }
        public DateTimeOffset CompletedAt { get; set; }
        public int CallsMade { get; set; }
    }
}
