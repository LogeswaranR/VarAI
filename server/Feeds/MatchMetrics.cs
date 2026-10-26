namespace VarAI.Server.Feeds;

/// <summary>
/// Derives metrics only from declared synthetic coordinates, durations and event order. Nothing here is
/// measured from video or tracking data, and the difficulty rating is a transparent heuristic, not a trained model.
/// </summary>
public static class MatchMetrics
{
    public const double SprintThresholdMps = 7.0;
    public const double FinalThirdProgress = 0.70;
    public const int PressureLookbackMs = 3000;
    public const double PressureRadiusM = 8.0;
    public const double GoalCentreY = 34.0;

    public static IReadOnlyList<SyntheticMatchEvent> Compute(IReadOnlyList<SyntheticMatchEvent> events)
    {
        var enriched = new List<SyntheticMatchEvent>(events.Count);
        for (var index = 0; index < events.Count; index++)
        {
            enriched.Add(events[index] with { Metrics = ComputeFor(events, index) });
        }

        return enriched;
    }

    public static int Difficulty(double distanceM, double forwardM, bool underPressure, bool finalThird)
    {
        var rating = 5.0 + (1.5 * Math.Min(distanceM, 45.0)) + (0.6 * Math.Max(0.0, forwardM)) +
            (underPressure ? 20.0 : 0.0) + (finalThird ? 10.0 : 0.0);
        return (int)Math.Clamp(Math.Round(rating, MidpointRounding.AwayFromZero), 1.0, 99.0);
    }

    public static double Progress(string teamId, double x) =>
        teamId == SyntheticMatchGenerator.HomeTeamId
            ? x / SyntheticMatchGenerator.PitchLength
            : (SyntheticMatchGenerator.PitchLength - x) / SyntheticMatchGenerator.PitchLength;

    public static double Round1(double value) => Math.Round(value * 10.0, MidpointRounding.AwayFromZero) / 10.0;

    public static double Distance(double ax, double ay, double bx, double by)
    {
        var dx = ax - bx;
        var dy = ay - by;
        return Math.Sqrt((dx * dx) + (dy * dy));
    }

    public static double AttackingGoalX(string teamId) =>
        teamId == SyntheticMatchGenerator.HomeTeamId ? SyntheticMatchGenerator.PitchLength : 0.0;

    internal static EventMetrics? ComputeFor(IReadOnlyList<SyntheticMatchEvent> events, int index)
    {
        var item = events[index];
        if (item.EndX is null || item.EndY is null)
        {
            return null;
        }

        var rawDistance = Distance(item.X, item.Y, item.EndX.Value, item.EndY.Value);
        var direction = item.TeamId == SyntheticMatchGenerator.HomeTeamId ? 1.0 : -1.0;
        var forward = Round1(direction * (item.EndX.Value - item.X));
        double? speedMps = null;
        double? speedKph = null;
        if (item.DurationMs is > 0)
        {
            var rawSpeed = rawDistance / (item.DurationMs.Value / 1000.0);
            speedMps = Round1(rawSpeed);
            speedKph = Round1(rawSpeed * 3.6);
        }

        switch (item.EventType)
        {
            case MatchEventTypes.Pass:
                var finalThird = Progress(item.TeamId, item.EndX.Value) >= FinalThirdProgress;
                var underPressure = HasRecentPressure(events, index);
                var distance = Round1(rawDistance);
                return new EventMetrics(distance, forward, speedMps, speedKph,
                    Difficulty(distance, forward, underPressure, finalThird), underPressure, finalThird, null);
            case MatchEventTypes.Carry:
                return new EventMetrics(Round1(rawDistance), forward, speedMps, speedKph, null, null,
                    Progress(item.TeamId, item.EndX.Value) >= FinalThirdProgress,
                    speedMps is >= SprintThresholdMps);
            case MatchEventTypes.Shot:
                return new EventMetrics(
                    Round1(Distance(item.X, item.Y, AttackingGoalX(item.TeamId), GoalCentreY)), forward, speedMps, speedKph,
                    null, null, Progress(item.TeamId, item.X) >= FinalThirdProgress, null);
            default:
                return null;
        }
    }

    private static bool HasRecentPressure(IReadOnlyList<SyntheticMatchEvent> events, int index)
    {
        var item = events[index];
        for (var back = index - 1; back >= 0 && back >= index - 6; back--)
        {
            var candidate = events[back];
            if (item.MatchClockMs - candidate.MatchClockMs > PressureLookbackMs)
            {
                return false;
            }

            if (candidate.EventType == MatchEventTypes.Pressure && candidate.TeamId != item.TeamId &&
                Distance(item.X, item.Y, candidate.X, candidate.Y) <= PressureRadiusM)
            {
                return true;
            }
        }

        return false;
    }
}
