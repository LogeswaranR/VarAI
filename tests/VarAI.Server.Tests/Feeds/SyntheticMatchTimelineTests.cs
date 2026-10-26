using VarAI.Server.Feeds;

namespace VarAI.Server.Tests.Feeds;

[TestClass]
public sealed class SyntheticMatchTimelineTests
{
    private static readonly SyntheticMatchTimeline Timeline = new();

    public required TestContext TestContext { get; set; }

    private static StreamOptions Options(
        double speed = 120, int fromMs = 0, int afterIndex = 0, bool events = true, bool momentum = true, bool overlays = true) =>
        new(speed, fromMs, afterIndex, events, momentum, overlays);

    [TestMethod]
    public void OneOrderedSequenceInterleavesEventsMomentumAndCuesAndEndsWithCompletion()
    {
        var items = Timeline.Items;

        CollectionAssert.AreEqual(Enumerable.Range(1, items.Count).ToArray(), items.Select(item => item.Index).ToArray());
        Assert.IsTrue(items.Zip(items.Skip(1), (current, next) => current.TimeMs <= next.TimeMs).All(ordered => ordered));
        Assert.HasCount(Timeline.Events.Count, items.Where(item => item.Kind == MatchStreamKinds.Event));
        Assert.HasCount(Timeline.Momentum.Count, items.Where(item => item.Kind == MatchStreamKinds.Momentum));
        Assert.HasCount(Timeline.Overlays.Count, items.Where(item => item.Kind == MatchStreamKinds.Overlay));
        Assert.AreEqual(MatchStreamKinds.Complete, items[^1].Kind);
        Assert.AreEqual(1, items.Count(item => item.Kind == MatchStreamKinds.Complete));
        Assert.AreEqual(Timeline.Events.Count, Timeline.Complete.EventCount);
        Assert.AreEqual(1, Timeline.Complete.FinalScore.Home);
        Assert.AreEqual(1, Timeline.Complete.FinalScore.Away);
    }

    [TestMethod]
    public void EverySourceEventIsDeliveredBeforeTheCueThatCitesIt()
    {
        var indexById = Timeline.Items
            .Where(item => item.Kind == MatchStreamKinds.Event)
            .ToDictionary(item => ((SyntheticMatchEvent)item.Payload).EventId, item => item.Index, StringComparer.Ordinal);

        foreach (var item in Timeline.Items.Where(item => item.Kind == MatchStreamKinds.Overlay))
        {
            var cue = (OverlayCue)item.Payload;
            Assert.IsTrue(cue.SourceEventIds.All(id => indexById[id] < item.Index), cue.OverlayId);
        }
    }

    [TestMethod]
    public void PacingIsAPureScheduleScaledBySpeedWithZeroDelayCatchUpBeforeTheStartPoint()
    {
        var normal = Timeline.Schedule(Options(speed: 120)).ToList();
        var fast = Timeline.Schedule(Options(speed: 600)).ToList();
        var jumped = Timeline.Schedule(Options(speed: 1000, fromMs: 5_300_000)).ToList();

        Assert.IsTrue(normal.Zip(normal.Skip(1), (current, next) => current.Offset <= next.Offset).All(ordered => ordered));
        Assert.AreEqual(Timeline.Items[^1].TimeMs / 1000.0 / 120.0, normal[^1].Offset.TotalSeconds, 0.001);
        Assert.AreEqual(normal[^1].Offset.TotalSeconds / 5.0, fast[^1].Offset.TotalSeconds, 0.001);
        Assert.IsTrue(jumped.Where(entry => entry.Item.TimeMs <= 5_300_000).All(entry => entry.Offset == TimeSpan.Zero));
        Assert.IsGreaterThan(2000, jumped.Count(entry => entry.Offset == TimeSpan.Zero));
        Assert.AreEqual((Timeline.Items[^1].TimeMs - 5_300_000) / 1000.0 / 1000.0, jumped[^1].Offset.TotalSeconds, 0.001);
    }

    [TestMethod]
    public void ScheduleHonoursResumePositionAndKindFilters()
    {
        var resumed = Timeline.Schedule(Options(afterIndex: Timeline.Items.Count - 3)).Select(entry => entry.Item.Index).ToArray();
        var eventsOnly = Timeline.Schedule(Options(momentum: false, overlays: false)).Select(entry => entry.Item.Kind).Distinct().Order().ToArray();
        var overlaysOnly = Timeline.Schedule(Options(events: false, momentum: false)).Select(entry => entry.Item).ToList();

        CollectionAssert.AreEqual(new[] { Timeline.Items.Count - 2, Timeline.Items.Count - 1, Timeline.Items.Count }, resumed);
        CollectionAssert.AreEqual(new[] { MatchStreamKinds.Complete, MatchStreamKinds.Event }, eventsOnly);
        Assert.HasCount(Timeline.Overlays.Count + 1, overlaysOnly);
        Assert.IsTrue(Timeline.CanResumeFrom(0));
        Assert.IsTrue(Timeline.CanResumeFrom(Timeline.Items.Count));
        Assert.IsFalse(Timeline.CanResumeFrom(-1));
        Assert.IsFalse(Timeline.CanResumeFrom(Timeline.Items.Count + 1));
    }

    [TestMethod]
    public async Task StreamingDeliversTheScheduleAndStopsOnCancellation()
    {
        var delivered = new List<StreamItem>();
        await foreach (var item in Timeline.StreamAsync(
            Options(speed: 1000, fromMs: 5_500_000, afterIndex: Timeline.Items.Count - 12), TimeProvider.System, TestContext.CancellationToken))
        {
            delivered.Add(item);
        }

        CollectionAssert.AreEqual(
            Enumerable.Range(Timeline.Items.Count - 11, 12).ToArray(), delivered.Select(item => item.Index).ToArray());

        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();
        await Assert.ThrowsAsync<OperationCanceledException>(async () =>
        {
            await foreach (var _ in Timeline.StreamAsync(Options(), TimeProvider.System, cancellation.Token))
            {
            }
        });
    }
}
