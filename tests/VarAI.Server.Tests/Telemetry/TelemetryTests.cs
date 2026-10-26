using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using VarAI.Server.Gate;
using VarAI.Server.Narration;
using VarAI.Server.Telemetry;
using VarAI.Server.Tests.Gate;
using static VarAI.Server.Tests.Narration.NarrationTestData;

namespace VarAI.Server.Tests.Telemetry;

[TestClass]
public sealed class TelemetryTests
{
    private const string FakeKey = "00000000-1111-2222-3333-444444444444";
    private const string FakeConnectionString = $"InstrumentationKey={FakeKey};IngestionEndpoint=https://localhost.invalid/";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public void WithoutAConnectionStringNothingIsRegisteredAndNothingCanLeaveTheProcess()
    {
        var services = new ServiceCollection().AddLogging();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection().Build();

        var enabled = services.AddVarAiTelemetry(configuration);

        Assert.IsFalse(enabled);
        using var provider = services.BuildServiceProvider();
        Assert.IsNull(provider.GetService<TracerProvider>());
        Assert.IsNull(provider.GetService<MeterProvider>());
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("   ")]
    public void ABlankConnectionStringIsTreatedAsNotConfigured(string value)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { [TelemetryRegistration.ConnectionStringKey] = value }).Build();

        Assert.IsFalse(new ServiceCollection().AddVarAiTelemetry(configuration));
    }

    [TestMethod]
    public void WithAConnectionStringTracesAndMetricsProvidersAreRegistered()
    {
        var services = new ServiceCollection().AddLogging();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { [TelemetryRegistration.ConnectionStringKey] = FakeConnectionString })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);

        var enabled = services.AddVarAiTelemetry(configuration);

        Assert.IsTrue(enabled);
        using var provider = services.BuildServiceProvider();
        Assert.IsNotNull(provider.GetService<TracerProvider>());
        Assert.IsNotNull(provider.GetService<MeterProvider>());
    }

    [TestMethod]
    public async Task OurSpansFlowThroughTheOpenTelemetryPipelineUnderTheServiceName()
    {
        var exported = new ConcurrentBag<Activity>();
        var services = new ServiceCollection().AddLogging();
        services.AddOpenTelemetry()
            .AddVarAiInstrumentation()
            .WithTracing(tracing => tracing.AddProcessor(new SimpleActivityExportProcessor(new ListExporter(exported))));
        using var provider = services.BuildServiceProvider();
        var tracer = provider.GetRequiredService<TracerProvider>();
        using var otherSource = new ActivitySource("VarAI.Tests.Telemetry.NotRegistered");
        var model = new ScriptedNarrationModel((facts, _, _) => Task.FromResult(ScriptedNarrationModel.Ok(Faithful(Cue(facts.CueId)))));
        using var service = new NarrationService(
            Factory, model, new NarrationOptions { Enabled = true }, TimeProvider.System, NullLogger<NarrationService>.Instance);

        using (otherSource.StartActivity("not-exported"))
        {
            await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        }

        Assert.IsTrue(tracer.ForceFlush(10_000));
        var span = exported.Single(activity =>
            activity.OperationName == "narration.generate" && activity.GetTagItem("varai.cue.id") as string == Sprint.OverlayId);
        Assert.AreEqual(1200, span.GetTagItem("gen_ai.usage.input_tokens"));
        Assert.AreEqual("AI", span.GetTagItem("varai.narration.source"));
        var serviceName = tracer.GetResource().Attributes.Single(attribute => attribute.Key == "service.name").Value;
        Assert.AreEqual(TelemetryRegistration.ServiceName, serviceName);
        Assert.IsFalse(exported.Any(activity => activity.OperationName == "not-exported"), "Only registered sources are exported.");
    }

    [TestMethod]
    public void NarrationAndGateEmitTheDocumentedMetricInstruments()
    {
        var seen = new ConcurrentDictionary<string, ConcurrentBag<string>>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == VarAiTelemetry.SourceName)
            {
                meterListener.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((instrument, _, tags, _) => Record(seen, instrument, tags));
        listener.SetMeasurementEventCallback<double>((instrument, _, tags, _) => Record(seen, instrument, tags));
        listener.SetMeasurementEventCallback<int>((instrument, _, tags, _) => Record(seen, instrument, tags));
        listener.Start();

        var model = new ScriptedNarrationModel((facts, _, _) => Task.FromResult(ScriptedNarrationModel.Ok(Faithful(Cue(facts.CueId)))));
        using var harness = new GateHarness(model);
        var session = harness.Start();
        var cue = Timeline.Overlays.First(item => item.InMs > 4_000_000);
        harness.AdvanceTo(session, TimeSpan.FromSeconds((cue.InMs - 4_000_000) / 10_000.0));
        var deadline = Stopwatch.StartNew();
        while (session.Proposals().Count == 0 && deadline.ElapsedMilliseconds < 10_000)
        {
            Thread.Sleep(5);
        }

        var proposal = session.Proposals().First();
        session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Hold, null, null));

        var names = seen.Keys.ToArray();
        Assert.Contains("varai.narration.model_calls", names);
        Assert.Contains("varai.narration.tokens", names);
        Assert.Contains("varai.narration.latency", names);
        Assert.Contains("varai.narration.results", names);
        Assert.Contains("varai.gate.decisions", names);
        Assert.Contains("type=input", seen["varai.narration.tokens"].ToArray());
        Assert.Contains("type=output", seen["varai.narration.tokens"].ToArray());
        Assert.Contains("action=hold", seen["varai.gate.decisions"].ToArray());
        Assert.Contains("source=AI", seen["varai.narration.results"].ToArray());
    }

    [TestMethod]
    public async Task ASpanIsRecordedForEveryOperatorDecisionWithoutTheNoteOrTheText()
    {
        var spans = new ConcurrentBag<Activity>();
        using var testSource = new ActivitySource("VarAI.Tests.Telemetry.Gate");
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == VarAiTelemetry.SourceName || source.Name == testSource.Name,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = spans.Add,
        };
        ActivitySource.AddActivityListener(listener);
        using var root = testSource.StartActivity("root")!;
        using var harness = new GateHarness();
        var session = harness.Start();
        var cue = Timeline.Overlays.First(item => item.InMs > 4_000_000);
        harness.AdvanceTo(session, TimeSpan.FromSeconds((cue.InMs - 4_000_000) / 10_000.0));
        var proposal = session.Proposals().Single();

        session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Approve, null, "SECRET-NOTE-TEXT"));
        session.Decide(new DecisionRequest(proposal.ApprovalId, proposal.PayloadHash, DecisionActions.Approve, null, null));
        await Task.Yield();

        var decisions = spans.Where(span => span.TraceId == root.TraceId && span.OperationName == "gate.decide").ToArray();
        Assert.HasCount(2, decisions);
        Assert.IsTrue(decisions.Any(span => span.GetTagItem("varai.gate.result") as string == "APPROVED"));
        Assert.IsTrue(decisions.Any(span => span.GetTagItem("varai.gate.result") as string == "AlreadyDecided"));
        Assert.IsTrue(decisions.All(span => span.GetTagItem("varai.gate.approval_id") as string == "APR-001"));
        Assert.IsFalse(decisions.SelectMany(span => span.TagObjects).Any(tag => $"{tag.Value}".Contains("SECRET-NOTE-TEXT", StringComparison.Ordinal)),
            "Operator notes and narration text never become span attributes.");
        Assert.IsTrue(decisions.All(span => span.GetTagItem("varai.gate.session") as string == session.Reference));
        Assert.HasCount(8, session.Reference);
        Assert.IsFalse(decisions.SelectMany(span => span.TagObjects).Any(tag => $"{tag.Value}".Contains(session.SessionId, StringComparison.Ordinal)),
            "The session ID is a capability and never becomes a span attribute.");
    }

    [TestMethod]
    public async Task TheAppStartsAndServesHealthWithTelemetryEnabledAndNeverLogsTheConnectionString()
    {
        var logs = new ConcurrentBag<string>();
        using var application = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseEnvironment("Development")
                .UseSetting("Explanations:LiveEnabled", "false")
                .UseSetting(TelemetryRegistration.ConnectionStringKey, FakeConnectionString)
                .ConfigureLogging(logging => logging.AddProvider(new CapturingLoggerProvider(logs))));
        using var client = application.CreateClient();

        using var response = await client.GetAsync("/health", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsNotNull(application.Services.GetService<TracerProvider>());
        Assert.IsTrue(logs.Any(line => line.Contains("telemetry export is enabled", StringComparison.Ordinal)));
        Assert.IsFalse(logs.Any(line => line.Contains(FakeKey, StringComparison.Ordinal) || line.Contains("InstrumentationKey", StringComparison.Ordinal)),
            "The connection string is configuration, never a log value.");
    }

    [TestMethod]
    public async Task TheAppReportsTelemetryAsDisabledWhenNoConnectionStringIsSet()
    {
        var logs = new ConcurrentBag<string>();
        using var application = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseEnvironment("Development")
                .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Explanations:LiveEnabled"] = "false",
                    [TelemetryRegistration.ConnectionStringKey] = null,
                }))
                .ConfigureLogging(logging => logging.AddProvider(new CapturingLoggerProvider(logs))));
        using var client = application.CreateClient();

        using var response = await client.GetAsync("/health", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsNull(application.Services.GetService<TracerProvider>());
        Assert.IsTrue(logs.Any(line => line.Contains("telemetry export is disabled", StringComparison.Ordinal)));
    }

    private static void Record(ConcurrentDictionary<string, ConcurrentBag<string>> seen, Instrument instrument, ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        var bag = seen.GetOrAdd(instrument.Name, _ => []);
        foreach (var tag in tags)
        {
            bag.Add($"{tag.Key}={tag.Value}");
        }
    }

    private sealed class ListExporter(ConcurrentBag<Activity> exported) : BaseExporter<Activity>
    {
        public override ExportResult Export(in Batch<Activity> batch)
        {
            foreach (var activity in batch)
            {
                exported.Add(activity);
            }

            return ExportResult.Success;
        }
    }

    private sealed class CapturingLoggerProvider(ConcurrentBag<string> lines) : ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName) => new CapturingLogger(lines);

        public void Dispose()
        {
        }

        private sealed class CapturingLogger(ConcurrentBag<string> lines) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                lines.Add(formatter(state, exception) + (exception is null ? string.Empty : " " + exception));
        }
    }
}
