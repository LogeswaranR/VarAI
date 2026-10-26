using System.Globalization;
using VarAI.Contracts;

namespace VarAI.Server.Feeds;

public sealed record MatchAnalysis(
    IReadOnlyList<MomentumSample> Momentum,
    IReadOnlyList<OverlayCue> Cues,
    IReadOnlyList<Highlight> Highlights);

/// <summary>
/// Deterministic interpretation of the event stream. Every cue is produced by a named rule from declared synthetic
/// events and carries the IDs (or time window) it was derived from. No language model is involved.
/// </summary>
public static class MatchInsightEngine
{
    public const string OverlaySchemaVersion = "1.0";
    public const int WindowSeconds = 300;
    public const double ChaosTurnoversPerMinute = 3.6;
    public const int ControlThreshold = 36;
    public const double SprintMinimumDistanceM = 20.0;
    public const int HardPassDifficulty = 75;
    public const double ShotSpeedThresholdKph = 110.0;
    public const int PressTrapMinimumTurnovers = 3;
    private const int CueDelayMs = 800;
    private const int PressTrapWindowMs = 300_000;

    internal sealed record PendingCue(
        string Kind,
        int Priority,
        int InMs,
        string Headline,
        string Detail,
        string WhyItMatters,
        string Title,
        string Subtitle,
        IReadOnlyList<OverlayMetric> Metrics,
        string? TeamId,
        IReadOnlyList<string> PlayerIds,
        IReadOnlyList<string> SourceEventIds,
        OverlayWindow? SourceWindow,
        string Rule,
        string? ScenarioId);

    private sealed record HighTurnover(int StartMs, int EndMs, double DistanceToGoalM, string[] EventIds);

    public static MatchAnalysis Analyze(IReadOnlyList<SyntheticMatchEvent> events)
    {
        var momentum = ComputeMomentum(events);
        var pending = new List<PendingCue>();
        var highlights = new List<Highlight>();
        AddEventCues(events, pending, highlights);
        AddMomentumCues(events, momentum, pending);

        var ordered = pending
            .OrderBy(cue => cue.InMs)
            .ThenByDescending(cue => cue.Priority)
            .ThenBy(cue => cue.Kind, StringComparer.Ordinal)
            .ThenBy(cue => cue.SourceEventIds.FirstOrDefault() ?? string.Empty, StringComparer.Ordinal)
            .ToList();
        var cues = new List<OverlayCue>(ordered.Count);
        for (var index = 0; index < ordered.Count; index++)
        {
            var cue = ordered[index];
            cues.Add(CreateCue(cue, $"{SyntheticMatchGenerator.MatchId}-OV-{index + 1:000}"));
        }

        return new MatchAnalysis(momentum, cues, highlights);
    }

    internal static OverlayCue CreateCue(PendingCue cue, string id)
    {
        var duration = cue.Priority switch { 3 => 9000, 2 => 7000, _ => 5000 };
        return new OverlayCue(
            OverlaySchemaVersion, id, SyntheticMatchGenerator.MatchId,
            cue.Kind, cue.Priority, cue.InMs, cue.InMs + duration, duration, cue.Headline, cue.Detail, cue.WhyItMatters,
            new OverlayLowerThird(cue.Title, cue.Subtitle), cue.Metrics, cue.TeamId, cue.PlayerIds, cue.SourceEventIds,
            cue.SourceWindow, cue.Rule, cue.ScenarioId, true);
    }

    public static string Clock(int ms) => $"{ms / 60_000}:{ms / 1000 % 60:00}";

    private static string F(double value, string format = "0.#") => value.ToString(format, CultureInfo.InvariantCulture);

    private static string ShortName(string teamId) =>
        teamId == SyntheticMatchGenerator.HomeTeamId ? SyntheticMatchGenerator.HomeTeam.ShortName : SyntheticMatchGenerator.AwayTeam.ShortName;

    private static string Scoreline(Score score) =>
        $"{SyntheticMatchGenerator.HomeTeam.ShortName} {score.Home}–{score.Away} {SyntheticMatchGenerator.AwayTeam.ShortName}";

    private static string RemainingText(int timeMs)
    {
        if (timeMs >= SyntheticMatchGenerator.RegulationEndMs)
        {
            return "in stoppage time";
        }

        var minutes = (SyntheticMatchGenerator.RegulationEndMs - timeMs) / 60_000;
        return minutes switch
        {
            <= 0 => "with under a minute left",
            1 => "with 1 minute left",
            _ => $"with {minutes} minutes left",
        };
    }

    private static OverlayMetric Metric(string key, string label, double value, string unit) => new(key, label, value, unit);

    private static int? FindBefore(
        IReadOnlyList<SyntheticMatchEvent> events, int index, int maxBack, int maxAgeMs, Func<SyntheticMatchEvent, bool> predicate)
    {
        for (var back = index - 1; back >= 0 && back >= index - maxBack; back--)
        {
            if (events[index].MatchClockMs - events[back].MatchClockMs > maxAgeMs)
            {
                return null;
            }

            if (predicate(events[back]))
            {
                return back;
            }
        }

        return null;
    }

    private static string GoalStakes(int timeMs, Score before, Score after, string teamId)
    {
        var home = teamId == SyntheticMatchGenerator.HomeTeamId;
        var forBefore = home ? before.Home : before.Away;
        var againstBefore = home ? before.Away : before.Home;
        var forAfter = home ? after.Home : after.Away;
        var againstAfter = home ? after.Away : after.Home;
        var line = $"{Scoreline(after)} {RemainingText(timeMs)}";
        if (forBefore == againstBefore)
        {
            return before.Home == 0 && before.Away == 0
                ? $"Breaks the deadlock: {line}."
                : $"Puts {ShortName(teamId)} ahead: {line}.";
        }

        if (forAfter == againstAfter)
        {
            return $"Levels the match: {line}. The next goal would put its scorer's team ahead.";
        }

        return forAfter > againstAfter ? $"Extends the lead: {line}." : $"Cuts the deficit: {line}.";
    }

    private static void AddEventCues(
        IReadOnlyList<SyntheticMatchEvent> events, List<PendingCue> pending, List<Highlight> highlights)
    {
        var interpreter = new EventInterpreter();
        for (var index = 0; index < events.Count; index++)
        {
            interpreter.Add(events, index, pending, highlights);
        }
    }

    internal sealed class EventInterpreter
    {
        private Score score = new(0, 0);
        private Score? goalBefore;
        private Score? goalAfter;
        private readonly Dictionary<string, int> cooldowns = new(StringComparer.Ordinal);
        private readonly HashSet<string> cautioned = new(StringComparer.Ordinal);
        private readonly Dictionary<string, List<HighTurnover>> highTurnovers = new(StringComparer.Ordinal);

        private bool CoolingDown(string key, int timeMs, int cooldownMs) =>
            cooldowns.TryGetValue(key, out var last) && timeMs - last < cooldownMs;

        internal void Add(
            IReadOnlyList<SyntheticMatchEvent> events, int index, List<PendingCue> pending, List<Highlight>? highlights = null)
        {
            // Only the replay caller supplies future events. Live callers append one event at a time.
            bool IsAssist(int passIndex) =>
                passIndex + 2 < events.Count && events[passIndex + 1].EventType == MatchEventTypes.Shot &&
                events[passIndex + 2].EventType == MatchEventTypes.Goal && events[passIndex + 2].TeamId == events[passIndex].TeamId;

            var item = events[index];
            var before = score;
            if (item.ScoreAfter is not null)
            {
                score = item.ScoreAfter;
            }

            switch (item.EventType)
            {
                case MatchEventTypes.Goal when item.ScoreAfter is not null:
                    goalBefore = before;
                    goalAfter = item.ScoreAfter;
                    AddGoalCue(events, index, before, item.ScoreAfter, pending);
                    if (highlights is not null)
                    {
                        AddGoalHighlight(events, index, item.ScoreAfter, highlights);
                    }
                    break;
                case MatchEventTypes.Review when item.Outcome == "STARTED":
                    AddReviewStartedCue(events, index, goalBefore, goalAfter, pending);
                    break;
                case MatchEventTypes.Review when item.Outcome == "GOAL_DISALLOWED" && item.ScoreAfter is not null:
                    AddDisallowedCue(events, index, item.ScoreAfter, pending);
                    break;
                case MatchEventTypes.Card when item.PlayerId is not null:
                    AddCardCue(events, index, !cautioned.Add(item.PlayerId), pending);
                    break;
                case MatchEventTypes.Carry when item.Metrics is { Sprint: true, DistanceM: >= SprintMinimumDistanceM } &&
                    item.PlayerId is not null && !CoolingDown($"SPRINT:{item.PlayerId}", item.MatchClockMs, 180_000):
                    cooldowns[$"SPRINT:{item.PlayerId}"] = item.MatchClockMs;
                    AddSprintCue(item, score, pending);
                    break;
                case MatchEventTypes.Pass when item.Outcome == "COMPLETE" &&
                    item.Metrics is { Difficulty: >= HardPassDifficulty, UnderPressure: true, FinalThird: true } &&
                    item.PlayerId is not null && (IsAssist(index) || !CoolingDown($"PASS:{item.TeamId}", item.MatchClockMs, 600_000)):
                    cooldowns[$"PASS:{item.TeamId}"] = item.MatchClockMs;
                    AddHardPassCue(item, score, pending, replay: highlights is not null);
                    break;
                case MatchEventTypes.Shot when item.Metrics is { SpeedKph: >= ShotSpeedThresholdKph } && item.PlayerId is not null &&
                    !(index + 1 < events.Count && events[index + 1].EventType == MatchEventTypes.Goal) &&
                    !CoolingDown($"SHOT:{item.PlayerId}", item.MatchClockMs, 300_000):
                    cooldowns[$"SHOT:{item.PlayerId}"] = item.MatchClockMs;
                    AddShotSpeedCue(item, score, pending, replay: highlights is not null);
                    break;
            }

            if (index >= 2 && item.EventType == MatchEventTypes.PossessionChange &&
                events[index - 1].EventType == MatchEventTypes.Tackle && events[index - 2].EventType == MatchEventTypes.Pressure &&
                events[index - 1].TeamId == item.TeamId && events[index - 2].TeamId == item.TeamId &&
                item.MatchClockMs - events[index - 2].MatchClockMs <= 10_000)
            {
                var tackle = events[index - 1];
                if (MatchMetrics.Progress(item.TeamId, tackle.X) < 0.5)
                {
                    return;
                }

                if (!highTurnovers.TryGetValue(item.TeamId, out var list))
                {
                    list = [];
                    highTurnovers[item.TeamId] = list;
                }

                list.Add(new HighTurnover(
                    events[index - 2].MatchClockMs, item.MatchClockMs,
                    MatchMetrics.Distance(tackle.X, tackle.Y, MatchMetrics.AttackingGoalX(item.TeamId), MatchMetrics.GoalCentreY),
                    [events[index - 2].EventId, tackle.EventId, item.EventId]));
                list.RemoveAll(entry => item.MatchClockMs - entry.EndMs > PressTrapWindowMs);
                if (list.Count >= PressTrapMinimumTurnovers && !CoolingDown($"TRAP:{item.TeamId}", item.MatchClockMs, PressTrapWindowMs))
                {
                    cooldowns[$"TRAP:{item.TeamId}"] = item.MatchClockMs;
                    AddPressTrapCue(item.TeamId, item.MatchClockMs, list, score, pending);
                }
            }
        }
    }

    private static void AddGoalCue(
        IReadOnlyList<SyntheticMatchEvent> events, int index, Score before, Score after, List<PendingCue> pending)
    {
        var goal = events[index];
        var scorer = goal.PlayerId is null ? null : SyntheticMatchGenerator.Player(goal.PlayerId);
        var scorerName = scorer?.Name ?? "Unnamed scorer";
        var shotIndex = FindBefore(events, index, 4, 6000, x => x.EventType == MatchEventTypes.Shot && x.TeamId == goal.TeamId);
        var passIndex = shotIndex is null
            ? null
            : FindBefore(events, shotIndex.Value, 4, 9000, x => x.EventType == MatchEventTypes.Pass && x.TeamId == goal.TeamId &&
                x.Outcome == "COMPLETE" && x.ReceiverId == goal.PlayerId);
        var shot = shotIndex is null ? null : events[shotIndex.Value];
        var pass = passIndex is null ? null : events[passIndex.Value];

        var metrics = new List<OverlayMetric>();
        var detail = $"{scorerName} scores for {SyntheticMatchGenerator.TeamName(goal.TeamId)}.";
        if (shot?.Metrics is { DistanceM: { } shotDistance, SpeedKph: { } shotSpeed })
        {
            metrics.Add(Metric("shotDistance", "Shot distance", shotDistance, "m"));
            metrics.Add(Metric("shotSpeed", "Shot speed", shotSpeed, "km/h"));
            detail = $"{scorerName} finishes from {F(shotDistance)} m at {F(shotSpeed, "0")} km/h.";
        }

        if (pass?.Metrics is { Difficulty: { } passDifficulty, DistanceM: { } passDistance })
        {
            metrics.Add(Metric("assistDifficulty", "Assisting pass difficulty", passDifficulty, "/100"));
            detail += $" The assisting pass covered {F(passDistance)} m (difficulty {passDifficulty}/100).";
        }

        var sources = new List<string>();
        if (pass is not null)
        {
            sources.Add(pass.EventId);
        }

        if (shot is not null)
        {
            sources.Add(shot.EventId);
        }

        sources.Add(goal.EventId);
        pending.Add(new PendingCue(
            OverlayKinds.Goal, 3, goal.MatchClockMs + CueDelayMs,
            $"Goal for {SyntheticMatchGenerator.TeamName(goal.TeamId)}: {scorerName}", detail,
            GoalStakes(goal.MatchClockMs, before, after, goal.TeamId),
            $"GOAL · {ShortName(goal.TeamId)}", $"{scorerName} · {Clock(goal.MatchClockMs)} · {Scoreline(after)}",
            metrics, goal.TeamId, goal.PlayerId is null ? [] : [goal.PlayerId], sources, null,
            "GOAL v1: one cue per GOAL event; stakes use the running score and the 90-minute regulation clock.", null));
    }

    private static void AddGoalHighlight(
        IReadOnlyList<SyntheticMatchEvent> events, int index, Score after, List<Highlight> highlights)
    {
        var goal = events[index];
        var overturned = events.Skip(index + 1).TakeWhile(x => x.MatchClockMs - goal.MatchClockMs <= 90_000)
            .Any(x => x.EventType == MatchEventTypes.Review && x.Outcome == "GOAL_DISALLOWED" && x.TeamId == goal.TeamId);
        var label = overturned
            ? $"{Clock(goal.MatchClockMs)} · {ShortName(goal.TeamId)} goal, ruled out on review"
            : $"{Clock(goal.MatchClockMs)} · {ShortName(goal.TeamId)} goal ({after.Home}–{after.Away})";
        highlights.Add(new Highlight($"HL-{highlights.Count + 1:00}", label, Math.Max(0, goal.MatchClockMs - 30_000)));
    }

    private static void AddReviewStartedCue(
        IReadOnlyList<SyntheticMatchEvent> events, int index, Score? goalBefore, Score? goalAfter, List<PendingCue> pending)
    {
        var review = events[index];
        var goalIndex = FindBefore(events, index, 6, 90_000, x => x.EventType == MatchEventTypes.Goal);
        var sources = new List<string>();
        if (goalIndex is not null)
        {
            sources.Add(events[goalIndex.Value].EventId);
        }

        sources.Add(review.EventId);
        var why = goalBefore is not null && goalAfter is not null
            ? $"If the goal stands it is {Scoreline(goalAfter)}; if it is overturned the score returns to {Scoreline(goalBefore)}."
            : "The review decides whether the awarded goal stands.";
        pending.Add(new PendingCue(
            OverlayKinds.ReviewStarted, 2, review.MatchClockMs + CueDelayMs,
            "Goal under review", "The awarded goal is being checked before play restarts.", why,
            "REVIEW", $"Goal under review · {Clock(review.MatchClockMs)}", [], review.TeamId, [], sources, null,
            "REVIEW_STARTED v1: one cue per review start; shows the score if the goal stands or is overturned.", review.ScenarioId));
    }

    private static void AddDisallowedCue(
        IReadOnlyList<SyntheticMatchEvent> events, int index, Score after, List<PendingCue> pending)
    {
        var decision = events[index];
        var sources = new List<string>();
        var startIndex = FindBefore(events, index, 8, 90_000, x => x.EventType == MatchEventTypes.Review && x.Outcome == "STARTED");
        var goalIndex = FindBefore(events, index, 12, 90_000, x => x.EventType == MatchEventTypes.Goal);
        if (goalIndex is not null)
        {
            sources.Add(events[goalIndex.Value].EventId);
        }

        if (startIndex is not null)
        {
            sources.Add(events[startIndex.Value].EventId);
        }

        sources.Add(decision.EventId);
        pending.Add(new PendingCue(
            OverlayKinds.GoalDisallowed, 3, decision.MatchClockMs + CueDelayMs,
            "Goal disallowed after offside review",
            "The on-field goal is overturned. The supplied evidence pack for this synthetic review is available.",
            $"The ruling returns the score to {Scoreline(after)} {RemainingText(decision.MatchClockMs)}.",
            "REVIEW · GOAL DISALLOWED", $"Offside · {Clock(decision.MatchClockMs)} · {Scoreline(after)}", [], decision.TeamId, [],
            sources, null, "GOAL_DISALLOWED v1: one cue per overturned goal; links to the supplied review scenario.", decision.ScenarioId));
    }

    private static void AddCardCue(IReadOnlyList<SyntheticMatchEvent> events, int index, bool secondCaution, List<PendingCue> pending)
    {
        var card = events[index];
        var player = SyntheticMatchGenerator.Player(card.PlayerId!);
        var foulIndex = FindBefore(events, index, 3, 30_000, x => x.EventType == MatchEventTypes.Foul && x.PlayerId == card.PlayerId);
        var sources = new List<string>();
        if (foulIndex is not null)
        {
            sources.Add(events[foulIndex.Value].EventId);
        }

        sources.Add(card.EventId);
        pending.Add(new PendingCue(
            OverlayKinds.Card, 2, card.MatchClockMs + CueDelayMs,
            $"Yellow card: {player.Name}", $"{player.Name} ({SyntheticMatchGenerator.TeamName(card.TeamId)}) is cautioned at {Clock(card.MatchClockMs)}.",
            secondCaution ? "A second yellow card means a sending-off." : "First caution for this player; a second yellow card means a sending-off.",
            "YELLOW CARD", $"{player.Name} · #{player.ShirtNumber} · {ShortName(card.TeamId)}", [], card.TeamId, [player.PlayerId], sources,
            null, "CARD v1: one cue per card event.", null));
    }

    private static void AddSprintCue(SyntheticMatchEvent item, Score score, List<PendingCue> pending)
    {
        var player = SyntheticMatchGenerator.Player(item.PlayerId!);
        var metrics = item.Metrics!;
        var duration = (item.DurationMs ?? 0) / 1000.0;
        var progress = metrics.ForwardM is > 0
            ? $"Advances the ball {F(metrics.ForwardM.Value)} m in the attacking direction while carrying it{(metrics.FinalThird == true ? ", finishing in the final third" : string.Empty)}."
            : "The carry crosses the speed threshold but makes no forward progress in the attacking direction.";
        pending.Add(new PendingCue(
            OverlayKinds.SprintCarry, 1, item.MatchClockMs + (item.DurationMs ?? 0) + CueDelayMs,
            $"{player.Name} powers forward with the ball",
            $"Carry of {F(metrics.DistanceM ?? 0)} m in {F(duration)} s: {F(metrics.SpeedMps ?? 0)} m/s, above the {F(MatchMetrics.SprintThresholdMps)} m/s threshold.",
            $"{progress} Carry speed is not total running distance or proof of a scoring chance. Score {Scoreline(score)}, {RemainingText(item.MatchClockMs)}.",
            $"{player.Name.ToUpperInvariant()} · #{player.ShirtNumber}",
            $"Carry {F(metrics.DistanceM ?? 0)} m · {F(metrics.SpeedMps ?? 0)} m/s ({F(metrics.SpeedKph ?? 0, "0")} km/h)",
            [
                Metric("carryDistance", "Carry distance", metrics.DistanceM ?? 0, "m"),
                Metric("carrySpeed", "Carry speed", metrics.SpeedMps ?? 0, "m/s"),
                Metric("carrySpeedKph", "Carry speed", metrics.SpeedKph ?? 0, "km/h"),
            ],
            item.TeamId, [player.PlayerId], [item.EventId], null,
            $"SPRINT_CARRY v1: carry of at least {F(SprintMinimumDistanceM)} m at or above {F(MatchMetrics.SprintThresholdMps)} m/s; one tag per player per 180 s.", null));
    }

    private static void AddHardPassCue(SyntheticMatchEvent item, Score score, List<PendingCue> pending, bool replay)
    {
        var player = SyntheticMatchGenerator.Player(item.PlayerId!);
        var receiver = item.ReceiverId is null ? null : SyntheticMatchGenerator.Player(item.ReceiverId);
        var metrics = item.Metrics!;
        var traits = new List<string>();
        if (metrics.UnderPressure == true)
        {
            traits.Add("under pressure");
        }

        if (metrics.FinalThird == true)
        {
            traits.Add("into the final third");
        }

        var traitText = traits.Count == 0 ? string.Empty : $", {string.Join(", ", traits)}";
        var progress = metrics.ForwardM is > 0
            ? $"Retains the ball under pressure and moves it {F(metrics.ForwardM.Value)} m in the attacking direction, finishing in the final third."
            : "Retains the ball under pressure in the final third, without gaining ground in the attacking direction.";
        pending.Add(new PendingCue(
            OverlayKinds.HardPass, 2, item.MatchClockMs + (item.DurationMs ?? 0) + CueDelayMs,
            receiver is null ? $"{player.Name} completes a difficult pass" : $"{player.Name} completes a difficult pass to {receiver.Name}",
            $"{F(metrics.DistanceM ?? 0)} m pass, {F(metrics.ForwardM ?? 0)} m forward{traitText}: difficulty {metrics.Difficulty}/100.",
            $"{progress} Difficulty is a heuristic, not a success probability. Score {Scoreline(score)}, {RemainingText(item.MatchClockMs)}.",
            $"{player.Name.ToUpperInvariant()} · #{player.ShirtNumber}", $"Pass difficulty {metrics.Difficulty}/100 · {F(metrics.DistanceM ?? 0)} m",
            [
                Metric("difficulty", "Pass difficulty", metrics.Difficulty ?? 0, "/100"),
                Metric("passDistance", "Pass distance", metrics.DistanceM ?? 0, "m"),
                Metric("forwardProgress", "Forward progress", metrics.ForwardM ?? 0, "m"),
            ],
            item.TeamId, receiver is null ? [player.PlayerId] : [player.PlayerId, receiver.PlayerId], [item.EventId], null,
            $"HARD_PASS v1: completed pass under pressure into the final third with difficulty of at least {HardPassDifficulty}/100; one cue per team per 600 s{(replay ? ", plus any assisting pass" : "; no future assist information")}.", null));
    }

    private static void AddShotSpeedCue(SyntheticMatchEvent item, Score score, List<PendingCue> pending, bool replay)
    {
        var player = SyntheticMatchGenerator.Player(item.PlayerId!);
        var metrics = item.Metrics!;
        var result = item.Outcome switch
        {
            "ON_TARGET" => "on target",
            "OFF_TARGET" => "off target",
            _ => "blocked",
        };
        pending.Add(new PendingCue(
            OverlayKinds.ShotSpeed, 1, item.MatchClockMs + (item.DurationMs ?? 0) + CueDelayMs,
            $"{player.Name} strikes it at {F(metrics.SpeedKph ?? 0, "0")} km/h",
            $"Shot from {F(metrics.DistanceM ?? 0)} m, {result}, at {F(metrics.SpeedKph ?? 0, "0")} km/h.",
            $"Shot-speed threshold crossed: {F(metrics.SpeedKph ?? 0, "0")} km/h (limit {F(ShotSpeedThresholdKph, "0")} km/h). Score {Scoreline(score)}, {RemainingText(item.MatchClockMs)}.",
            $"{player.Name.ToUpperInvariant()} · #{player.ShirtNumber}", $"Shot {F(metrics.SpeedKph ?? 0, "0")} km/h · {F(metrics.DistanceM ?? 0)} m",
            [
                Metric("shotSpeed", "Shot speed", metrics.SpeedKph ?? 0, "km/h"),
                Metric("shotDistance", "Shot distance", metrics.DistanceM ?? 0, "m"),
            ],
            item.TeamId, [player.PlayerId], [item.EventId], null,
            $"SHOT_SPEED v1: shot at or above {F(ShotSpeedThresholdKph, "0")} km/h{(replay ? " that is not immediately followed by a goal" : "; subsequent outcomes are not yet known")}; one cue per player per 300 s.", null));
    }

    private static void AddPressTrapCue(
        string teamId, int timeMs, List<HighTurnover> turnovers, Score score, List<PendingCue> pending)
    {
        var team = SyntheticMatchGenerator.TeamName(teamId);
        var average = turnovers.Average(entry => entry.DistanceToGoalM);
        var startMs = turnovers.Min(entry => entry.StartMs);
        var spanSeconds = (timeMs - startMs) / 1000;
        pending.Add(new PendingCue(
            OverlayKinds.PressTrap, 2, timeMs + CueDelayMs,
            $"{team} are winning the ball back high up the pitch",
            $"{turnovers.Count} pressure-to-possession wins in the opposition half within {spanSeconds} seconds, on average {F(average, "0")} m from goal.",
            $"Each win came in the opposition half, around {F(average, "0")} m from goal. Score {Scoreline(score)}, {RemainingText(timeMs)}.",
            "HIGH PRESS", $"{ShortName(teamId)} · {turnovers.Count} high turnovers in {spanSeconds} s",
            [
                Metric("highTurnovers", "High turnovers", turnovers.Count, "count"),
                Metric("avgDistanceToGoal", "Average distance to goal", MatchMetrics.Round1(average), "m"),
            ],
            teamId, [], [.. turnovers.TakeLast(5).SelectMany(entry => entry.EventIds)], new OverlayWindow(startMs, timeMs),
            $"PRESS_TRAP v1: at least {PressTrapMinimumTurnovers} pressure→tackle→possession-change sequences by one team, each tackle in the opposition half, within {PressTrapWindowMs / 1000} s; 300 s cooldown per team.",
            null));
    }

    private static IReadOnlyList<MomentumSample> ComputeMomentum(IReadOnlyList<SyntheticMatchEvent> events)
    {
        var samples = new List<MomentumSample>();
        for (var minute = 1; minute <= SyntheticMatchGenerator.MatchEndMs / 60_000; minute++)
        {
            samples.Add(ComputeMomentumAt(events, minute));
        }

        return samples;
    }

    internal static MomentumSample ComputeMomentumAt(IReadOnlyList<SyntheticMatchEvent> events, int minute)
    {
        var timeMs = minute * 60_000;
        var windowMs = Math.Min(WindowSeconds * 1000, timeMs);
        var fromMs = timeMs - windowMs;
        int homeActions = 0, awayActions = 0, turnovers = 0, homePressures = 0, awayPressures = 0;
        foreach (var item in events)
        {
            if (item.MatchClockMs <= fromMs || item.MatchClockMs > timeMs)
            {
                continue;
            }

            var home = item.TeamId == SyntheticMatchGenerator.HomeTeamId;
            switch (item.EventType)
            {
                case MatchEventTypes.Pass or MatchEventTypes.Carry or MatchEventTypes.Shot:
                    if (home)
                    {
                        homeActions++;
                    }
                    else
                    {
                        awayActions++;
                    }

                    break;
                case MatchEventTypes.PossessionChange:
                    turnovers++;
                    break;
                case MatchEventTypes.Pressure:
                    if (home)
                    {
                        homePressures++;
                    }
                    else
                    {
                        awayPressures++;
                    }

                    break;
            }
        }

        var total = homeActions + awayActions;
        var share = total == 0 ? 50.0 : 100.0 * homeActions / total;
        var control = (int)Math.Round((share - 50.0) * 2.0, MidpointRounding.AwayFromZero);
        var perMinute = turnovers / (windowMs / 60_000.0);
        string state;
        string? controlling = null;
        if (perMinute >= ChaosTurnoversPerMinute)
        {
            state = "CHAOS";
        }
        else if (Math.Abs(control) >= ControlThreshold)
        {
            state = "CONTROL";
            controlling = control > 0 ? SyntheticMatchGenerator.HomeTeamId : SyntheticMatchGenerator.AwayTeamId;
        }
        else
        {
            state = "BALANCED";
        }

        return new MomentumSample(
            minute, timeMs, windowMs / 1000, MatchMetrics.Round1(share), control, turnovers,
            MatchMetrics.Round1(perMinute), homePressures, awayPressures, state, controlling);
    }

    private static void AddMomentumCues(
        IReadOnlyList<SyntheticMatchEvent> events, IReadOnlyList<MomentumSample> momentum, List<PendingCue> pending)
    {
        var interpreter = new MomentumInterpreter();
        for (var index = 1; index < momentum.Count; index++)
        {
            interpreter.Add(events, momentum[index], momentum[index - 1], pending);
        }
    }

    internal sealed class MomentumInterpreter
    {
        private readonly Dictionary<string, int> lastCue = new(StringComparer.Ordinal);
        private Score score = new(0, 0);
        private int scoreIndex;

        internal void Add(
            IReadOnlyList<SyntheticMatchEvent> events, MomentumSample sample, MomentumSample previous, List<PendingCue> pending)
        {
            while (scoreIndex < events.Count && events[scoreIndex].MatchClockMs <= sample.MatchClockMs)
            {
                score = events[scoreIndex].ScoreAfter ?? score;
                scoreIndex++;
            }

            var fromMs = sample.MatchClockMs - (sample.WindowSeconds * 1000);
            var windowEvents = events.Where(x => x.MatchClockMs > fromMs && x.MatchClockMs <= sample.MatchClockMs).ToList();
            var window = new OverlayWindow(fromMs, sample.MatchClockMs);
            var windowMinutes = sample.WindowSeconds / 60;

            if (sample.State == "CONTROL" && sample.ControllingTeamId is { } teamId &&
                (previous.State != "CONTROL" || previous.ControllingTeamId != teamId) &&
                !(lastCue.TryGetValue($"CONTROL:{teamId}", out var lastControl) && sample.MatchClockMs - lastControl < 600_000) &&
                sample.MatchClockMs >= 600_000)
            {
                lastCue[$"CONTROL:{teamId}"] = sample.MatchClockMs;
                var team = SyntheticMatchGenerator.TeamName(teamId);
                var share = teamId == SyntheticMatchGenerator.HomeTeamId ? sample.HomeBallActionSharePct : 100.0 - sample.HomeBallActionSharePct;
                var sources = windowEvents
                    .Where(x => x.EventType is MatchEventTypes.Pass or MatchEventTypes.Carry or MatchEventTypes.Shot)
                    .TakeLast(8).Select(x => x.EventId).ToList();
                pending.Add(new PendingCue(
                    OverlayKinds.MomentumSwing, 2, sample.MatchClockMs + CueDelayMs,
                    $"{team} take control of the match",
                    $"{F(share, "0")}% of ball actions over the last {windowMinutes} minutes (control index {Math.Abs(sample.ControlIndex)}), with {F(sample.TurnoversPerMinute)} turnovers per minute.",
                    $"A sustained spell on the ball: {team} have had {F(share, "0")}% of the recent ball actions. Score {Scoreline(score)}, {RemainingText(sample.MatchClockMs)}.",
                    "CONTROL", $"{ShortName(teamId)} · {F(share, "0")}% of ball actions · last {windowMinutes} min",
                    [
                        Metric("ballActionShare", "Share of ball actions", share, "%"),
                        Metric("controlIndex", "Control index", Math.Abs(sample.ControlIndex), "/100"),
                        Metric("turnoversPerMinute", "Turnovers per minute", sample.TurnoversPerMinute, "per min"),
                    ],
                    teamId, [], sources, window,
                    $"MOMENTUM_SWING v1: {WindowSeconds / 60}-minute window, at least {ControlThreshold / 2 + 50}% of ball actions (control index {ControlThreshold}) with turnovers below {F(ChaosTurnoversPerMinute)} per minute; 10-minute cooldown per team.",
                    null));
            }

            if (sample.State == "CHAOS" && previous.State != "CHAOS" &&
                !(lastCue.TryGetValue("CHAOS", out var lastChaos) && sample.MatchClockMs - lastChaos < 600_000) &&
                sample.MatchClockMs >= 600_000)
            {
                lastCue["CHAOS"] = sample.MatchClockMs;
                var sources = windowEvents.Where(x => x.EventType == MatchEventTypes.PossessionChange)
                    .TakeLast(8).Select(x => x.EventId).ToList();
                pending.Add(new PendingCue(
                    OverlayKinds.ChaosSpike, 2, sample.MatchClockMs + CueDelayMs,
                    "The match turns chaotic",
                    $"{sample.Turnovers} changes of possession in the last {windowMinutes} minutes ({F(sample.TurnoversPerMinute)} per minute).",
                    $"Possession is changing hands quickly, so neither side is settling. Score {Scoreline(score)}, {RemainingText(sample.MatchClockMs)}.",
                    "CHAOS", $"{sample.Turnovers} turnovers in {windowMinutes} min · {F(sample.TurnoversPerMinute)} per min",
                    [
                        Metric("turnovers", "Turnovers", sample.Turnovers, "count"),
                        Metric("turnoversPerMinute", "Turnovers per minute", sample.TurnoversPerMinute, "per min"),
                    ],
                    null, [], sources, window,
                    $"CHAOS_SPIKE v1: {WindowSeconds / 60}-minute window with at least {F(ChaosTurnoversPerMinute)} possession changes per minute; 10-minute cooldown.",
                    null));
            }
        }
    }
}
