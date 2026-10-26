using System.Text.Json;
using VarAI.Contracts;
using VarAI.Server.Feeds;

namespace VarAI.Server.Tests.Feeds;

[TestClass]
public sealed class IncrementalMatchProcessorTests
{
    private static readonly IReadOnlyList<SyntheticMatchEvent> Events = SyntheticMatchGenerator.Generate().Events;
    private static string Json(object value) => JsonSerializer.Serialize(value);

    [TestMethod]
    public void FullMatchHasOrderedIdsMatchingMetricsAndActualCompletionCounts()
    {
        var items = IncrementalMatchProcessor.Process(Events).ToArray();
        CollectionAssert.AreEqual(Enumerable.Range(1, items.Length).ToArray(), items.Select(item => item.Index).ToArray());
        Assert.IsTrue(items.Zip(items.Skip(1)).All(pair => pair.First.TimeMs <= pair.Second.TimeMs));
        var enriched = items.Where(item => item.Kind == MatchStreamKinds.Event).Select(item => (SyntheticMatchEvent)item.Payload).ToArray();
        Assert.AreEqual(Json(MatchMetrics.Compute(Events)), Json(enriched));
        var momentum = items.Where(item => item.Kind == MatchStreamKinds.Momentum).Select(item => (MomentumSample)item.Payload).ToArray();
        Assert.AreEqual(Json(new SyntheticMatchTimeline().Momentum), Json(momentum));
        var complete = (MatchComplete)items[^1].Payload;
        Assert.AreEqual(Events.Count, complete.EventCount);
        Assert.AreEqual(92, complete.MomentumCount);
        Assert.AreEqual(items.Count(item => item.Kind == MatchStreamKinds.Overlay), complete.OverlayCount);
        Assert.AreEqual(new Score(1, 1), complete.FinalScore);
        var times = Events.ToDictionary(item => item.EventId, item => item.MatchClockMs);
        Assert.IsTrue(items.Where(item => item.Kind == MatchStreamKinds.Overlay).Select(item => (OverlayCue)item.Payload)
            .All(cue => cue.SourceEventIds.All(id => times[id] <= cue.InMs) && cue.OverlayId.Contains("-LIVE-OV-", StringComparison.Ordinal)));
    }

    [TestMethod]
    [DataRow(600_000)]
    [DataRow(2_700_000)]
    [DataRow(4_041_500)]
    [DataRow(4_080_000)]
    public void PrefixIsIdenticalWithoutReceivingAnyFutureEvents(int throughMs)
    {
        var expected = IncrementalMatchProcessor.Process(Events).Where(item => item.TimeMs <= throughMs).ToArray();
        var processor = new IncrementalMatchProcessor();
        var prefix = Events.Where(item => item.MatchClockMs <= throughMs).SelectMany(processor.Append).ToList();
        prefix.AddRange(processor.AdvanceTo(throughMs));
        Assert.AreEqual(Json(expected), Json(prefix));
    }

    [TestMethod]
    public void AlteringFutureGoalsAndReviewOutcomesCannotChangePastOutput()
    {
        const int cutoff = 4_041_500;
        var changed = Events.Select(item => item.MatchClockMs > cutoff ? item with
        {
            ScoreAfter = item.ScoreAfter is null ? null : new Score(3, 2),
            Outcome = item.EventType == MatchEventTypes.Review ? "CONFIRMED" : item.Outcome
        } : item).ToArray();
        var originalOutput = IncrementalMatchProcessor.Process(Events).ToArray();
        var changedOutput = IncrementalMatchProcessor.Process(changed).ToArray();
        Assert.AreEqual(Json(originalOutput.Where(item => item.TimeMs <= cutoff)), Json(changedOutput.Where(item => item.TimeMs <= cutoff)));
        Assert.AreNotEqual(Json(originalOutput), Json(changedOutput));
        Assert.IsEmpty(SyntheticMatchGenerator.Describe().Highlights, "Live metadata cannot announce future review outcomes.");
    }

    [TestMethod]
    public void ShotCueDoesNotUseTheNextGoalToSuppressAnAlreadyKnownFastShot()
    {
        var replay = new SyntheticMatchTimeline();
        var shot = replay.Events.First(item => item.EventType == MatchEventTypes.Shot && item.Metrics?.SpeedKph >= 110 &&
            Events[item.Sequence].EventType == MatchEventTypes.Goal);
        var liveCues = IncrementalMatchProcessor.Process(Events).Where(item => item.Kind == MatchStreamKinds.Overlay)
            .Select(item => (OverlayCue)item.Payload).ToArray();
        Assert.IsTrue(liveCues.Any(cue => cue.Kind == OverlayKinds.ShotSpeed && cue.SourceEventIds.Contains(shot.EventId)));
        Assert.IsFalse(replay.Overlays.Any(cue => cue.Kind == OverlayKinds.ShotSpeed && cue.SourceEventIds.Contains(shot.EventId)));
        Assert.IsTrue(liveCues.Where(cue => cue.Kind == OverlayKinds.HardPass).All(cue => !cue.Rule.Contains("plus any assisting pass", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void MinuteBoundaryIncludesAllEventsAtThatTimestampAndRejectsLateArrivals()
    {
        var pass = Events.First(item => item.EventType == MatchEventTypes.Pass);
        var processor = new IncrementalMatchProcessor();
        processor.Append(pass with { Sequence = 1, EventId = "one", MatchClockMs = 60_000 });
        processor.Append(pass with { Sequence = 2, EventId = "two", MatchClockMs = 60_000, TeamId = SyntheticMatchGenerator.AwayTeamId });
        var sample = (MomentumSample)processor.AdvanceTo(60_000).Single(item => item.Kind == MatchStreamKinds.Momentum).Payload;
        Assert.AreEqual(50.0, sample.HomeBallActionSharePct);
        Assert.ThrowsExactly<ArgumentException>(() => processor.Append(pass with { Sequence = 3, EventId = "late", MatchClockMs = 60_000 }));
    }

    [TestMethod]
    public void InvalidOrderDuplicatesAndPrematureCompletionAreExplicitFailures()
    {
        var processor = new IncrementalMatchProcessor();
        processor.Append(Events[0]);
        Assert.ThrowsExactly<ArgumentException>(() => processor.Append(Events[0]));
        Assert.ThrowsExactly<ArgumentException>(() => processor.Append(Events[2]));
        Assert.ThrowsExactly<ArgumentException>(() => processor.Append(Events[1] with { Synthetic = false }));
        Assert.ThrowsExactly<ArgumentException>(() => processor.Append(Events[1] with { EventId = Events[0].EventId }));
        Assert.ThrowsExactly<InvalidOperationException>(() => processor.Complete());
        processor.Append(Events[1]);
    }

    [TestMethod]
    public void EnumerationDoesNotAnalyseTheEntireMatchBeforeItsFirstEvent()
    {
        var received = 0;
        IEnumerable<SyntheticMatchEvent> Source()
        {
            foreach (var item in Events)
            {
                received++;
                yield return item;
            }
        }

        using var enumerator = IncrementalMatchProcessor.Process(Source()).GetEnumerator();
        Assert.IsTrue(enumerator.MoveNext());
        Assert.AreEqual(MatchStreamKinds.Event, enumerator.Current.Kind);
        Assert.AreEqual(1, received);
    }
}
