using VarAI.Contracts;

namespace VarAI.Server.Feeds;

/// <summary>Consumes an ordered synthetic feed without access to its unreceived suffix.</summary>
public sealed class IncrementalMatchProcessor
{
    private readonly List<SyntheticMatchEvent> events = [];
    private readonly HashSet<string> eventIds = new(StringComparer.Ordinal);
    private readonly MatchInsightEngine.EventInterpreter eventRules = new();
    private readonly MatchInsightEngine.MomentumInterpreter momentumRules = new();
    private readonly PriorityQueue<MatchInsightEngine.PendingCue, (int Time, int Priority, int Order)> waiting = new();
    private readonly List<MatchInsightEngine.PendingCue> pending = [];
    private MomentumSample? previousMomentum;
    private Score score = new(0, 0);
    private int minute = 1;
    private int index;
    private int cueCount;
    private int cueOrder;
    private int advancedThrough = -1;
    private bool completed;

    public IReadOnlyList<StreamItem> Append(SyntheticMatchEvent item)
    {
        if (completed || item.MatchId != SyntheticMatchGenerator.MatchId || !item.Synthetic ||
            item.Sequence != events.Count + 1 || eventIds.Contains(item.EventId) || item.MatchClockMs <= advancedThrough ||
            item.MatchClockMs < (events.LastOrDefault()?.MatchClockMs ?? 0) ||
            item.MatchClockMs > SyntheticMatchGenerator.MatchEndMs)
        {
            throw new ArgumentException("Expected the next ordered synthetic event, after the closed clock boundary.", nameof(item));
        }

        var output = AdvanceTo(item.MatchClockMs - 1).ToList();
        eventIds.Add(item.EventId);
        events.Add(item);
        var enriched = item with { Metrics = MatchMetrics.ComputeFor(events, events.Count - 1) };
        events[^1] = enriched;
        score = item.ScoreAfter ?? score;
        output.Add(Emit(item.MatchClockMs, MatchStreamKinds.Event, enriched));
        eventRules.Add(events, events.Count - 1, pending);
        QueuePending();
        return output;
    }

    /// <summary>Closes a clock boundary after all events at or before it have been received.</summary>
    public IReadOnlyList<StreamItem> AdvanceTo(int timeMs)
    {
        if (completed || timeMs < advancedThrough || timeMs < -1)
        {
            throw new ArgumentOutOfRangeException(nameof(timeMs), "The closed match clock cannot move backwards.");
        }

        var output = new List<StreamItem>();
        while (true)
        {
            var sampleTime = minute <= SyntheticMatchGenerator.MatchEndMs / 60_000 ? minute * 60_000 : int.MaxValue;
            var cueTime = waiting.TryPeek(out _, out var priority) ? priority.Time : int.MaxValue;
            var next = Math.Min(sampleTime, cueTime);
            if (next > timeMs || next == int.MaxValue)
            {
                break;
            }

            if (sampleTime <= cueTime)
            {
                var sample = MatchInsightEngine.ComputeMomentumAt(events, minute++);
                output.Add(Emit(sampleTime, MatchStreamKinds.Momentum, sample));
                if (previousMomentum is not null)
                {
                    momentumRules.Add(events, sample, previousMomentum, pending);
                    QueuePending();
                }

                previousMomentum = sample;
            }
            else
            {
                var cue = MatchInsightEngine.CreateCue(waiting.Dequeue(), $"{SyntheticMatchGenerator.MatchId}-LIVE-OV-{++cueCount:000}");
                output.Add(Emit(cue.InMs, MatchStreamKinds.Overlay, cue));
            }
        }

        advancedThrough = timeMs;
        return output;
    }

    public IReadOnlyList<StreamItem> Complete()
    {
        if (completed || events.LastOrDefault() is not
            { EventType: MatchEventTypes.PeriodEnd, MatchClockMs: SyntheticMatchGenerator.MatchEndMs })
        {
            throw new InvalidOperationException("A live match completes only after its final period-end event.");
        }

        var output = AdvanceTo(SyntheticMatchGenerator.MatchEndMs).ToList();
        var endMs = Math.Max(SyntheticMatchGenerator.MatchEndMs,
            waiting.UnorderedItems.Select(item => item.Element.InMs).DefaultIfEmpty(0).Max());
        output.AddRange(AdvanceTo(endMs));
        output.Add(Emit(endMs, MatchStreamKinds.Complete,
            new MatchComplete(SyntheticMatchGenerator.MatchId, events.Count, minute - 1, cueCount, score)));
        completed = true;
        return output;
    }

    private StreamItem Emit(int timeMs, string kind, object payload) => new(++index, timeMs, kind, payload);

    private void QueuePending()
    {
        foreach (var cue in pending)
        {
            waiting.Enqueue(cue, (cue.InMs, -cue.Priority, cueOrder++));
        }

        pending.Clear();
    }

    public static IEnumerable<StreamItem> Process(IEnumerable<SyntheticMatchEvent> source)
    {
        var processor = new IncrementalMatchProcessor();
        foreach (var item in source)
        {
            foreach (var output in processor.Append(item))
            {
                yield return output;
            }
        }

        foreach (var output in processor.Complete())
        {
            yield return output;
        }
    }
}
