using VarAI.Server.Feeds;

namespace VarAI.Server.Tests.Feeds;

[TestClass]
public sealed class MatchMetricsTests
{
    private const string Home = SyntheticMatchGenerator.HomeTeamId;
    private const string Away = SyntheticMatchGenerator.AwayTeamId;

    private static SyntheticMatchEvent Event(
        int sequence, int timeMs, string team, string type, double x, double y,
        double? endX = null, double? endY = null, int? duration = null) =>
        new($"E{sequence}", SyntheticMatchGenerator.MatchId, sequence, 1, timeMs, team, null, type, x, y, endX, endY,
            duration, null, null, null, null, null, "test event", true);

    [TestMethod]
    public void DifficultyIsATransparentBoundedHeuristic()
    {
        Assert.AreEqual(20, MatchMetrics.Difficulty(10, 0, false, false));
        Assert.AreEqual(89, MatchMetrics.Difficulty(27.0, 22.8, true, true));
        Assert.AreEqual(99, MatchMetrics.Difficulty(100, 100, true, true));
        Assert.AreEqual(5, MatchMetrics.Difficulty(0, -5, false, false));
    }

    [TestMethod]
    public void PassDistanceForwardProgressAndSpeedComeFromDeclaredCoordinatesAndDuration()
    {
        var metrics = MatchMetrics.Compute(
        [
            Event(1, 1000, Home, MatchEventTypes.Pass, 0, 0, 30, 40, 2500),
            Event(2, 9000, Away, MatchEventTypes.Pass, 30, 0, 0, 40, 2500),
        ]);

        Assert.AreEqual(50.0, metrics[0].Metrics!.DistanceM);
        Assert.AreEqual(30.0, metrics[0].Metrics!.ForwardM);
        Assert.AreEqual(20.0, metrics[0].Metrics!.SpeedMps);
        Assert.AreEqual(72.0, metrics[0].Metrics!.SpeedKph);
        Assert.AreEqual(30.0, metrics[1].Metrics!.ForwardM);
        Assert.AreEqual(50.0, metrics[1].Metrics!.DistanceM);
    }

    [TestMethod]
    [DataRow(Away, 3500, 12.0, true, "an opposing press within range")]
    [DataRow(Home, 3500, 12.0, false, "a press by the passer's own team")]
    [DataRow(Away, 1900, 12.0, false, "a press older than three seconds")]
    [DataRow(Away, 3500, 19.0, false, "a press more than eight metres away")]
    public void UnderPressureRequiresARecentNearbyOpposingPress(
        string pressingTeam, int pressureAtMs, double passX, bool expected, string reason)
    {
        var events = MatchMetrics.Compute(
        [
            Event(1, pressureAtMs, pressingTeam, MatchEventTypes.Pressure, 10, 10),
            Event(2, 5000, Home, MatchEventTypes.Pass, passX, 10, 30, 10, 1000),
        ]);

        Assert.AreEqual(expected, events[1].Metrics!.UnderPressure, reason);
    }

    [TestMethod]
    public void CarrySprintFlagUsesTheSevenMetresPerSecondThreshold()
    {
        var metrics = MatchMetrics.Compute(
        [
            Event(1, 1000, Home, MatchEventTypes.Carry, 10, 10, 30, 10, 3000),
            Event(2, 9000, Home, MatchEventTypes.Carry, 10, 10, 31.6, 10, 3000),
        ]);

        Assert.IsFalse(metrics[0].Metrics!.Sprint);
        Assert.IsTrue(metrics[1].Metrics!.Sprint);
        Assert.AreEqual(7.2, metrics[1].Metrics!.SpeedMps);
    }

    [TestMethod]
    public void ShotMetricsMeasureGoalDistanceAndStrikeSpeedAndOtherEventsHaveNone()
    {
        var metrics = MatchMetrics.Compute(
        [
            Event(1, 1000, Home, MatchEventTypes.Shot, 88.5, 30.2, 105.0, 33.4, 500),
            Event(2, 2000, Home, MatchEventTypes.Tackle, 50, 30),
            Event(3, 3000, Away, MatchEventTypes.PossessionChange, 50, 30),
        ]);

        Assert.AreEqual(16.9, metrics[0].Metrics!.DistanceM);
        Assert.AreEqual(121.0, metrics[0].Metrics!.SpeedKph);
        Assert.IsNull(metrics[1].Metrics);
        Assert.IsNull(metrics[2].Metrics);
    }
}
