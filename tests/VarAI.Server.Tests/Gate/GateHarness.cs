using Microsoft.Extensions.Logging.Abstractions;
using VarAI.Server.Explanations;
using VarAI.Server.Feeds;
using VarAI.Server.Gate;
using VarAI.Server.Narration;
using VarAI.Server.Tests.Explanations;
using VarAI.Server.Tests.Narration;

namespace VarAI.Server.Tests.Gate;

internal sealed class ScriptedNarrationModel(
    Func<NarrationFacts, NarrationLanguage, CancellationToken, Task<NarrationModelResult>> respond) : INarrationModel
{
    private int calls;

    public string Deployment => "fictional-deployment";

    public int Calls => Volatile.Read(ref calls);

    public Task<NarrationModelResult> GenerateAsync(NarrationFacts facts, NarrationLanguage language, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref calls);
        return respond(facts, language, cancellationToken);
    }

    public static NarrationModelResult Ok(string json) => new(json, new ChatUsage(1200, 300, 120, 1000), "fictional-model-2026");
}

/// <summary>Drives gated sessions in virtual time so SLA behaviour is exact and no test waits on a real clock.</summary>
internal sealed class GateHarness : IDisposable
{
    public GateHarness(INarrationModel? model = null, GateOptions? options = null, NarrationOptions? narrationOptions = null, bool autoRun = false)
    {
        Options = options ?? new GateOptions { TickInterval = TimeSpan.FromMilliseconds(500) };
        Service = new NarrationService(
            NarrationTestData.Factory, model, narrationOptions ?? new NarrationOptions { Enabled = model is not null }, Time,
            NullLogger<NarrationService>.Instance);
        Store = new GateSessionStore(NarrationTestData.Timeline, Service, Options, Time, NullLoggerFactory.Instance, autoRun);
    }

    public ManualTimeProvider Time { get; } = new();

    public NarrationService Service { get; }

    public GateSessionStore Store { get; }

    public GateOptions Options { get; }

    public GateSession Start(double speed = 10, int fromSeconds = 4_000)
    {
        var result = Store.Create(speed, fromSeconds);
        Assert.IsNotNull(result.Session, result.Detail);
        return result.Session;
    }

    /// <summary>Moves virtual time to <paramref name="elapsed"/> since the session started and runs everything that is due.</summary>
    public void AdvanceTo(GateSession session, TimeSpan elapsed)
    {
        var delta = elapsed - session.Elapsed;
        if (delta > TimeSpan.Zero)
        {
            Time.Advance(delta);
        }

        session.Tick();
    }

    /// <summary>
    /// Waits until the conductor and the program stream both have a pending timer, i.e. the history burst has been delivered
    /// and the stream is waiting for its first timed item. Virtual time must not move before that.
    /// </summary>
    public async Task WaitUntilProgramIsWaitingAsync(CancellationToken cancellationToken)
    {
        var spins = 0;
        while (Time.PendingTimers < 2)
        {
            await Task.Delay(1, cancellationToken);
            if (++spins > 5_000)
            {
                throw new TimeoutException("The program feed never started waiting.");
            }
        }
    }

    /// <summary>Runs the program feed to its end by jumping virtual time from timer to timer, calling <paramref name="onStep"/> after each jump.</summary>
    public async Task<List<StreamItem>> RunProgramAsync(
        GateSession session, int afterIndex, Action<GateSession>? onStep, CancellationToken cancellationToken)
    {
        var items = new List<StreamItem>();
        var finished = false;
        var consumer = Task.Run(async () =>
        {
            await foreach (var item in session.ProgramAsync(afterIndex, cancellationToken))
            {
                lock (items)
                {
                    items.Add(item);
                }
            }

            Volatile.Write(ref finished, true);
        }, cancellationToken);

        await WaitUntilProgramIsWaitingAsync(cancellationToken);
        var idle = 0;
        while (!Volatile.Read(ref finished))
        {
            if (Time.AdvanceToNextTimer())
            {
                idle = 0;
                onStep?.Invoke(session);
            }
            else
            {
                await Task.Delay(1, cancellationToken);
                if (++idle > 5_000)
                {
                    throw new TimeoutException("The program feed stopped making progress.");
                }
            }
        }

        await consumer;
        lock (items)
        {
            return [.. items];
        }
    }

    public void Dispose()
    {
        Store.Dispose();
        Service.Dispose();
    }
}
