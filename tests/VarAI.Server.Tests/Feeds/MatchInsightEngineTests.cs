using VarAI.Server.Feeds;

namespace VarAI.Server.Tests.Feeds;

[TestClass]
public sealed class MatchInsightEngineTests
{
    private static readonly SyntheticMatchTimeline Timeline = new();

    private static double MetricValue(OverlayCue cue, string key) => cue.Metrics.Single(metric => metric.Key == key).Value;

    [TestMethod]
    public void MomentumHasOneBoundedSamplePerMatchMinuteAndBothKindsOfSwing()
    {
        var samples = Timeline.Momentum;

        CollectionAssert.AreEqual(Enumerable.Range(1, 92).ToArray(), samples.Select(item => item.Minute).ToArray());
        Assert.IsTrue(samples.All(item => item.HomeBallActionSharePct is >= 0 and <= 100 && item.ControlIndex is >= -100 and <= 100));
        Assert.IsTrue(samples.All(item => item.State is "CONTROL" or "BALANCED" or "CHAOS"));
        Assert.IsTrue(samples.All(item => (item.State == "CONTROL") == (item.ControllingTeamId is not null)));
        Assert.IsTrue(samples.All(item => item.State != "CHAOS" || item.TurnoversPerMinute >= MatchInsightEngine.ChaosTurnoversPerMinute));
        Assert.IsTrue(samples.All(item => item.State != "CONTROL" || Math.Abs(item.ControlIndex) >= MatchInsightEngine.ControlThreshold));
        Assert.IsTrue(samples.Any(item => item.ControllingTeamId == SyntheticMatchGenerator.HomeTeamId));
        Assert.IsTrue(samples.Any(item => item.ControllingTeamId == SyntheticMatchGenerator.AwayTeamId));
        Assert.IsTrue(samples.Any(item => item.State == "CHAOS"));
    }

    [TestMethod]
    public void EveryCueIsVersionedTimedAndTracesToEarlierSourceEventsOrAWindow()
    {
        var cues = Timeline.Overlays;
        var eventTimes = Timeline.Events.ToDictionary(item => item.EventId, item => item.MatchClockMs, StringComparer.Ordinal);

        Assert.IsGreaterThan(20, cues.Count);
        CollectionAssert.AreEqual(
            Enumerable.Range(1, cues.Count).Select(number => $"SYN-MATCH-01-OV-{number:000}").ToArray(),
            cues.Select(item => item.OverlayId).ToArray());
        Assert.IsTrue(cues.Zip(cues.Skip(1), (current, next) => current.InMs <= next.InMs).All(ordered => ordered));
        Assert.IsTrue(cues.All(item => item.SchemaVersion == MatchInsightEngine.OverlaySchemaVersion && item.Synthetic));
        Assert.IsTrue(cues.All(item => item.Priority is >= 1 and <= 3 && item.OutMs - item.InMs == item.DurationMs && item.DurationMs > 0));
        Assert.IsTrue(cues.All(item => item.Rule.Length > 0 && item.Headline.Length > 0 && item.WhyItMatters.Length > 0));
        Assert.IsTrue(cues.All(item => item.SourceEventIds.Count > 0));
        Assert.IsTrue(cues.All(item => item.SourceEventIds.All(id => eventTimes.TryGetValue(id, out var time) && time <= item.InMs)));
        Assert.IsTrue(cues.Where(item => item.Kind is OverlayKinds.MomentumSwing or OverlayKinds.ChaosSpike or OverlayKinds.PressTrap)
            .All(item => item.SourceWindow is not null && item.SourceWindow.StartMs < item.SourceWindow.EndMs));
    }

    [TestMethod]
    public void RuleThresholdsAreHonouredByTheCuesTheyProduce()
    {
        foreach (var cue in Timeline.Overlays)
        {
            switch (cue.Kind)
            {
                case OverlayKinds.SprintCarry:
                    Assert.IsGreaterThanOrEqualTo(7.0, MetricValue(cue, "carrySpeed"));
                    Assert.IsGreaterThanOrEqualTo(MatchInsightEngine.SprintMinimumDistanceM, MetricValue(cue, "carryDistance"));
                    break;
                case OverlayKinds.HardPass:
                    Assert.IsGreaterThanOrEqualTo(MatchInsightEngine.HardPassDifficulty, MetricValue(cue, "difficulty"));
                    break;
                case OverlayKinds.ShotSpeed:
                    Assert.IsGreaterThanOrEqualTo(MatchInsightEngine.ShotSpeedThresholdKph, MetricValue(cue, "shotSpeed"));
                    break;
                case OverlayKinds.PressTrap:
                    Assert.IsGreaterThanOrEqualTo(MatchInsightEngine.PressTrapMinimumTurnovers, MetricValue(cue, "highTurnovers"));
                    break;
            }
        }

        var kinds = Timeline.Overlays.Select(item => item.Kind).ToHashSet(StringComparer.Ordinal);
        foreach (var expected in new[]
                 {
                     OverlayKinds.Goal, OverlayKinds.ReviewStarted, OverlayKinds.GoalDisallowed, OverlayKinds.Card,
                     OverlayKinds.SprintCarry, OverlayKinds.HardPass, OverlayKinds.MomentumSwing,
                 })
        {
            Assert.Contains(expected, kinds);
        }
    }

    [TestMethod]
    public void GoalCuesExplainTheStakesFromTheRunningScoreAndClock()
    {
        var goals = Timeline.Overlays.Where(item => item.Kind == OverlayKinds.Goal).ToList();

        Assert.HasCount(3, goals);
        Assert.AreEqual("Goal for Alder Vale Comets: Ravi Sorrell", goals[0].Headline);
        Assert.Contains("Breaks the deadlock: AVC 1–0 BRL with 22 minutes left.", goals[0].WhyItMatters);
        Assert.Contains("Breaks the deadlock: AVC 0–1 BRL with 9 minutes left.", goals[1].WhyItMatters);
        Assert.Contains("Levels the match: AVC 1–1 BRL with 1 minute left.", goals[2].WhyItMatters);
        Assert.AreEqual("GOAL · AVC", goals[0].LowerThird.Title);
        Assert.AreEqual("Ravi Sorrell · 67:21 · AVC 1–0 BRL", goals[0].LowerThird.Subtitle);
        Assert.Contains("assisting pass", goals[2].Detail);
        Assert.IsTrue(goals[2].Metrics.Any(metric => metric.Key == "assistDifficulty"));
    }

    [TestMethod]
    public void ProgressExplanationsDistinguishSpeedFromForwardGain()
    {
        var carry = Timeline.Events.First(item => item.EventType == MatchEventTypes.Carry && item.Metrics is
        { Sprint: true, DistanceM: >= MatchInsightEngine.SprintMinimumDistanceM });
        var forward = MatchInsightEngine.Analyze([carry with
        {
            Metrics = carry.Metrics! with { ForwardM = 24.5, FinalThird = true }
        }]).Cues.Single(cue => cue.Kind == OverlayKinds.SprintCarry);
        Assert.Contains("24.5 m in the attacking direction", forward.WhyItMatters);
        Assert.Contains("finishing in the final third", forward.WhyItMatters);

        var backward = MatchInsightEngine.Analyze([carry with
        {
            Metrics = carry.Metrics! with { ForwardM = -4 }
        }]).Cues.Single(cue => cue.Kind == OverlayKinds.SprintCarry);
        Assert.Contains("no forward progress", backward.WhyItMatters);
        Assert.DoesNotContain("Advances", backward.WhyItMatters);
    }

    [TestMethod]
    public void PassExplanationsDescribeRetentionAndProgressNotProbability()
    {
        var pass = Timeline.Events.First(item => item.EventType == MatchEventTypes.Pass && item.Outcome == "COMPLETE" &&
            item.Metrics is { Difficulty: >= MatchInsightEngine.HardPassDifficulty, UnderPressure: true, FinalThird: true });
        var forward = MatchInsightEngine.Analyze([pass with
        {
            Metrics = pass.Metrics! with { ForwardM = 22.8 }
        }]).Cues.Single(cue => cue.Kind == OverlayKinds.HardPass);
        Assert.Contains("Retains the ball under pressure", forward.WhyItMatters);
        Assert.Contains("22.8 m in the attacking direction", forward.WhyItMatters);
        Assert.Contains("not a success probability", forward.WhyItMatters);

        var sideways = MatchInsightEngine.Analyze([pass with
        {
            Metrics = pass.Metrics! with { ForwardM = 0 }
        }]).Cues.Single(cue => cue.Kind == OverlayKinds.HardPass);
        Assert.Contains("without gaining ground", sideways.WhyItMatters);
    }

    [TestMethod]
    public void TheDisallowedGoalLinksTheMatchStreamToTheSuppliedReviewScenario()
    {
        var events = Timeline.Events.ToDictionary(item => item.EventId, StringComparer.Ordinal);
        var started = Timeline.Overlays.Single(item => item.Kind == OverlayKinds.ReviewStarted);
        var decision = Timeline.Overlays.Single(item => item.Kind == OverlayKinds.GoalDisallowed);

        Assert.AreEqual("S1", started.ScenarioId);
        Assert.AreEqual("S1", decision.ScenarioId);
        Assert.Contains("AVC 0–0 BRL", decision.WhyItMatters);
        Assert.Contains("overturned", decision.Detail);
        CollectionAssert.AreEqual(
            new[] { MatchEventTypes.Goal, MatchEventTypes.Review, MatchEventTypes.Review },
            decision.SourceEventIds.Select(id => events[id].EventType).ToArray());
    }

    [TestMethod]
    public void HighlightsPointJustBeforeEachGoalAndFlagTheOverturnedOne()
    {
        var highlights = Timeline.Metadata.Highlights;

        Assert.HasCount(3, highlights);
        Assert.IsTrue(highlights.Zip(highlights.Skip(1), (current, next) => current.MatchClockMs < next.MatchClockMs).All(ordered => ordered));
        Assert.Contains("ruled out on review", highlights[0].Label);
        Assert.AreEqual(4_041_000 - 30_000, highlights[0].MatchClockMs);
        Assert.Contains("(1–1)", highlights[2].Label);
    }

    [TestMethod]
    public void NumbersInCueTextAreCultureInvariant()
    {
        var original = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("fr-FR");
            var analysis = MatchInsightEngine.Analyze(Timeline.Events);
            CollectionAssert.AreEqual(
                Timeline.Overlays.Select(item => item.Detail).ToArray(), analysis.Cues.Select(item => item.Detail).ToArray());
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = original;
        }
    }
}
