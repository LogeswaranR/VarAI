using VarAI.Contracts;

namespace VarAI.Server.Feeds;

public sealed record GeneratedMatch(
    SyntheticTeam HomeTeam,
    SyntheticTeam AwayTeam,
    IReadOnlyList<SyntheticMatchEvent> Events);

internal sealed record Draft(
    int TimeMs,
    string TeamId,
    string? PlayerId,
    string EventType,
    double X,
    double Y,
    double? EndX,
    double? EndY,
    int? DurationMs,
    string? Outcome,
    string? ReceiverId,
    Score? ScoreAfter,
    string? ScenarioId,
    string Description,
    int? PeriodOverride = null,
    int Order = 0);

internal sealed class DraftBuffer
{
    private readonly List<Draft> drafts = [];
    private int nextOrder;

    public IReadOnlyList<Draft> Items => drafts;

    public void Add(Draft draft) => drafts.Add(draft with { Order = nextOrder++ });

    public void RemoveWindow(int startMs, int endMs) =>
        drafts.RemoveAll(item => item.TimeMs >= startMs && item.TimeMs <= endMs);
}

/// <summary>
/// SplitMix64 is implemented locally so the synthetic match is identical on every platform and .NET version.
/// </summary>
internal sealed class SplitMix64(long seed)
{
    private ulong state = unchecked((ulong)seed);

    public double NextDouble()
    {
        state = unchecked(state + 0x9E3779B97F4A7C15UL);
        var value = state;
        value = unchecked((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9UL);
        value = unchecked((value ^ (value >> 27)) * 0x94D049BB133111EBUL);
        value ^= value >> 31;
        return (value >> 11) * (1.0 / 9007199254740992.0);
    }

    public int Next(int minInclusive, int maxExclusive) =>
        minInclusive + (int)(NextDouble() * (maxExclusive - minInclusive));

    public double Range(double min, double max) => min + (NextDouble() * (max - min));
}

public static class SyntheticMatchGenerator
{
    public const string MatchId = "SYN-MATCH-01";
    public const string HomeTeamId = "COMETS";
    public const string AwayTeamId = "LANTERNS";
    public const long DefaultSeed = 20261023;
    public const int FirstPeriodEndMs = 2_700_000;
    public const int RegulationEndMs = 5_400_000;
    public const int MatchEndMs = 5_520_000;
    public const double PitchLength = 105.0;
    public const double PitchWidth = 68.0;

    private static readonly string[] Roles = ["GK", "RB", "LB", "CB", "CB", "DM", "RW", "CM", "ST", "AM", "LW"];

    private static readonly string[] HomeNames =
    [
        "Hollis Brandt", "Corin Ashby", "Dune Maddox", "Wren Castellan", "Tobias Verrick", "Lio Marchetti",
        "Jasper Quill", "Emre Dalloway", "Ravi Sorrell", "Callum Fenn", "Ines Valdry",
    ];

    private static readonly string[] AwayNames =
    [
        "Oskar Penhale", "Ferris Wolcott", "Anselm Dray", "Gideon Pryce", "Kofi Ardent", "Tarn Delacroix",
        "Silas Moorcroft", "Hugo Brannigan", "Zane Ostrander", "Lorcan Vale", "Soren Keldrick",
    ];

    public static SyntheticTeam HomeTeam { get; } = CreateTeam(HomeTeamId, "Alder Vale Comets", "AVC", "LEFT_TO_RIGHT", HomeNames);

    public static SyntheticTeam AwayTeam { get; } = CreateTeam(AwayTeamId, "Brindle Reach Lanterns", "BRL", "RIGHT_TO_LEFT", AwayNames);

    public static SyntheticPlayer Player(string playerId)
    {
        var team = playerId.StartsWith(HomeTeamId, StringComparison.Ordinal) ? HomeTeam : AwayTeam;
        return team.Players.First(player => player.PlayerId == playerId);
    }

    public static string PlayerName(string playerId) => Player(playerId).Name;

    public static string TeamName(string teamId) => teamId == HomeTeamId ? HomeTeam.Name : AwayTeam.Name;

    public static GeneratedMatch Generate(long seed = DefaultSeed)
    {
        var buffer = new DraftBuffer();
        new OpenPlaySimulator(new SplitMix64(seed), buffer).Run();
        foreach (var (startMs, endMs) in StoryScripts.Windows)
        {
            buffer.RemoveWindow(startMs, endMs);
        }

        StoryScripts.AddTo(buffer);
        AddPeriodBoundaries(buffer);

        var ordered = buffer.Items.OrderBy(item => item.TimeMs).ThenBy(item => item.Order).ToList();
        var events = new List<SyntheticMatchEvent>(ordered.Count);
        for (var index = 0; index < ordered.Count; index++)
        {
            var draft = ordered[index];
            var sequence = index + 1;
            events.Add(new SyntheticMatchEvent(
                $"{MatchId}-E{sequence:0000}", MatchId, sequence,
                draft.PeriodOverride ?? (draft.TimeMs < FirstPeriodEndMs ? 1 : 2), draft.TimeMs,
                draft.TeamId, draft.PlayerId, draft.EventType, draft.X, draft.Y, draft.EndX, draft.EndY,
                draft.DurationMs, draft.Outcome, draft.ReceiverId, draft.ScoreAfter, draft.ScenarioId,
                null, draft.Description, true));
        }

        return new GeneratedMatch(HomeTeam, AwayTeam, events);
    }

    private static void AddPeriodBoundaries(DraftBuffer buffer)
    {
        buffer.Add(new Draft(0, HomeTeamId, null, MatchEventTypes.PeriodStart, 52.5, 34.0, null, null, null,
            null, null, new Score(0, 0), null, "Kick-off.", 1));
        buffer.Add(new Draft(FirstPeriodEndMs, HomeTeamId, null, MatchEventTypes.PeriodEnd, 52.5, 34.0, null, null,
            null, null, null, new Score(0, 0), null, "Half-time.", 1));
        buffer.Add(new Draft(FirstPeriodEndMs, AwayTeamId, null, MatchEventTypes.PeriodStart, 52.5, 34.0, null, null,
            null, null, null, new Score(0, 0), null, "Second half kick-off.", 2));
        buffer.Add(new Draft(MatchEndMs, HomeTeamId, null, MatchEventTypes.PeriodEnd, 52.5, 34.0, null, null,
            null, null, null, new Score(1, 1), null, "Full-time.", 2));
    }

    private static SyntheticTeam CreateTeam(string teamId, string name, string shortName, string attackDirection, string[] names) =>
        new(teamId, name, shortName, attackDirection,
            [.. names.Select((playerName, index) =>
                new SyntheticPlayer($"{teamId}-{index + 1:00}", playerName, index + 1, Roles[index]))]);
}

internal sealed class OpenPlaySimulator(SplitMix64 rng, DraftBuffer buffer)
{
    private static readonly (double U, double V)[] Anchors =
    [
        (0.04, 0.50), (0.24, 0.14), (0.24, 0.86), (0.20, 0.38), (0.20, 0.62), (0.38, 0.50),
        (0.62, 0.12), (0.50, 0.34), (0.82, 0.50), (0.64, 0.62), (0.62, 0.88),
    ];

    private int clock;
    private int team;
    private int holder;
    private int lastPresser;
    private double ballX;
    private double ballY;

    public void Run()
    {
        RunPeriod(0, SyntheticMatchGenerator.FirstPeriodEndMs, 0);
        RunPeriod(SyntheticMatchGenerator.FirstPeriodEndMs, SyntheticMatchGenerator.MatchEndMs, 1);
    }

    private static double Round1(double value) => Math.Round(value * 10.0, MidpointRounding.AwayFromZero) / 10.0;

    private static double Distance(double ax, double ay, double bx, double by)
    {
        var dx = ax - bx;
        var dy = ay - by;
        return Math.Sqrt((dx * dx) + (dy * dy));
    }

    private static double Progress(int teamIndex, double x) =>
        teamIndex == 0 ? x / SyntheticMatchGenerator.PitchLength : (SyntheticMatchGenerator.PitchLength - x) / SyntheticMatchGenerator.PitchLength;

    private (double X, double Y) CompressedPosition(int teamIndex, int role)
    {
        // The team's shape tightens around the ball, which keeps most passes short and realistic.
        var anchor = AnchorPosition(teamIndex, role);
        return (anchor.X + (0.5 * (ballX - anchor.X)), anchor.Y + (0.5 * (ballY - anchor.Y)));
    }

    private static (double X, double Y) AnchorPosition(int teamIndex, int role)
    {
        var (u, v) = Anchors[role];
        return teamIndex == 0
            ? (u * SyntheticMatchGenerator.PitchLength, v * SyntheticMatchGenerator.PitchWidth)
            : ((1.0 - u) * SyntheticMatchGenerator.PitchLength, (1.0 - v) * SyntheticMatchGenerator.PitchWidth);
    }

    private static string TeamId(int teamIndex) =>
        teamIndex == 0 ? SyntheticMatchGenerator.HomeTeamId : SyntheticMatchGenerator.AwayTeamId;

    private static string PlayerId(int teamIndex, int role) => $"{TeamId(teamIndex)}-{role + 1:00}";

    private static string PlayerName(int teamIndex, int role) => SyntheticMatchGenerator.PlayerName(PlayerId(teamIndex, role));

    private static string TeamName(int teamIndex) => SyntheticMatchGenerator.TeamName(TeamId(teamIndex));

    private static double HomeEdge(double minute) => minute switch
    {
        < 20 => 0.00,
        < 45 => 0.10,
        < 55 => 0.00,
        < 80 => 0.55,
        < 87 => -0.55,
        _ => 0.55,
    };

    private static bool IsChaotic(double minute) => (minute >= 62 && minute < 67) || (minute >= 74 && minute < 79);

    private void RunPeriod(int startMs, int endMs, int kickoffTeam)
    {
        clock = startMs + 1500;
        team = kickoffTeam;
        holder = 7;
        ballX = 52.5;
        ballY = 34.0;
        while (clock < endMs - 4000)
        {
            Step();
        }
    }

    private void Step()
    {
        var minute = clock / 60000.0;
        var teamEdge = team == 0 ? HomeEdge(minute) : -HomeEdge(minute);
        var chaotic = IsChaotic(minute);
        var lossScale = Math.Clamp(1.0 - (0.9 * teamEdge), 0.35, 2.0);

        if (rng.NextDouble() < 0.0045)
        {
            Foul();
            return;
        }

        var pressured = false;
        if (rng.NextDouble() < 0.25 + (chaotic ? 0.12 : 0.0) - (0.15 * teamEdge))
        {
            EmitPressure();
            pressured = true;
        }

        var dispossessChance = ((0.022 + (pressured ? 0.06 : 0.0)) * lossScale) + (chaotic ? 0.08 : 0.0);
        if (rng.NextDouble() < dispossessChance)
        {
            if (!pressured)
            {
                EmitPressure();
            }

            Dispossess();
            return;
        }

        var roll = rng.NextDouble();
        if (Progress(team, ballX) >= 0.72 && holder >= 6 && roll < 0.09)
        {
            Shoot();
        }
        else if (roll < 0.34)
        {
            Carry();
        }
        else
        {
            Pass(pressured, lossScale, chaotic);
        }
    }

    private void Emit(
        int teamIndex, string? playerId, string type, double x, double y, double? endX, double? endY,
        int? durationMs, string? outcome, string? receiverId, string description)
    {
        double ClampX(double value) => Round1(Math.Clamp(value, 0.0, SyntheticMatchGenerator.PitchLength));
        double ClampY(double value) => Round1(Math.Clamp(value, 0.0, SyntheticMatchGenerator.PitchWidth));
        buffer.Add(new Draft(
            clock, TeamId(teamIndex), playerId, type, ClampX(x), ClampY(y),
            endX is null ? null : ClampX(endX.Value), endY is null ? null : ClampY(endY.Value),
            durationMs, outcome, receiverId, null, null, description));
    }

    private int NearestRole(int teamIndex, double x, double y)
    {
        var best = 1;
        var bestDistance = double.MaxValue;
        for (var role = 1; role < 11; role++)
        {
            var position = AnchorPosition(teamIndex, role);
            var distance = Distance(position.X, position.Y, x, y);
            if (distance < bestDistance)
            {
                best = role;
                bestDistance = distance;
            }
        }

        return best;
    }

    private int Weighted(double[] weights)
    {
        var total = weights.Sum();
        var pick = rng.NextDouble() * total;
        var lastPositive = 0;
        for (var index = 0; index < weights.Length; index++)
        {
            if (weights[index] <= 0.0)
            {
                continue;
            }

            lastPositive = index;
            pick -= weights[index];
            if (pick < 0.0)
            {
                return index;
            }
        }

        return lastPositive;
    }

    private void EmitPressure()
    {
        var opponent = 1 - team;
        lastPresser = NearestRole(opponent, ballX, ballY);
        Emit(opponent, PlayerId(opponent, lastPresser), MatchEventTypes.Pressure,
            ballX + rng.Range(-1.5, 1.5), ballY + rng.Range(-1.5, 1.5), null, null, null, null, null,
            $"{PlayerName(opponent, lastPresser)} presses the ball carrier.");
        clock += rng.Next(500, 1100);
    }

    private void Dispossess()
    {
        var opponent = 1 - team;
        Emit(opponent, PlayerId(opponent, lastPresser), MatchEventTypes.Tackle, ballX, ballY, null, null, null,
            "WON", null, $"{PlayerName(opponent, lastPresser)} wins the ball.");
        clock += rng.Next(150, 400);
        team = opponent;
        holder = lastPresser;
        Emit(team, null, MatchEventTypes.PossessionChange, ballX, ballY, null, null, null, null, null,
            $"Possession changes to {TeamName(team)}.");
        clock += rng.Next(700, 1800);
    }

    private void Pass(bool pressured, double lossScale, bool chaotic)
    {
        var progress = Progress(team, ballX);
        var weights = new double[11];
        for (var role = 0; role < 11; role++)
        {
            if (role == holder)
            {
                continue;
            }

            var anchor = CompressedPosition(team, role);
            var anchorDistance = Distance(ballX, ballY, anchor.X, anchor.Y);
            var weight = 1.0 / (1.0 + (anchorDistance * anchorDistance / 100.0)) * (Progress(team, anchor.X) > progress ? 1.35 : 0.75);
            if (anchorDistance < 3.0)
            {
                weight *= 0.3;
            }

            if (role == 0 && progress > 0.35)
            {
                weight *= 0.05;
            }

            weights[role] = weight;
        }

        var receiver = Weighted(weights);
        var target = CompressedPosition(team, receiver);
        var targetX = Math.Clamp(target.X + rng.Range(-3.0, 3.0), 1.0, SyntheticMatchGenerator.PitchLength - 1.0);
        var targetY = Math.Clamp(target.Y + rng.Range(-3.0, 3.0), 1.0, SyntheticMatchGenerator.PitchWidth - 1.0);
        var distance = Distance(ballX, ballY, targetX, targetY);
        var durationMs = Math.Max(250, (int)(distance / rng.Range(9.0, 19.0) * 1000.0));
        var finalThird = Progress(team, targetX) >= 0.70;
        var failure = Math.Clamp(
            (((0.05 + (0.0035 * distance) + (pressured ? 0.07 : 0.0) + (finalThird ? 0.04 : 0.0)) * lossScale) + (chaotic ? 0.12 : 0.0)),
            0.03, 0.7);
        var complete = rng.NextDouble() >= failure;

        Emit(team, PlayerId(team, holder), MatchEventTypes.Pass, ballX, ballY, targetX, targetY, durationMs,
            complete ? "COMPLETE" : "INCOMPLETE", PlayerId(team, receiver),
            complete
                ? $"{PlayerName(team, holder)} passes to {PlayerName(team, receiver)}."
                : $"{PlayerName(team, holder)} misplaces a pass intended for {PlayerName(team, receiver)}.");
        clock += durationMs;
        ballX = targetX;
        ballY = targetY;

        if (complete)
        {
            holder = receiver;
            clock += rng.Next(400, 1700);
            return;
        }

        team = 1 - team;
        holder = NearestRole(team, ballX, ballY);
        Emit(team, null, MatchEventTypes.PossessionChange, ballX, ballY, null, null, null, null, null,
            $"Possession changes to {TeamName(team)}.");
        clock += rng.Next(600, 1600);
    }

    private void Carry()
    {
        var direction = team == 0 ? 1.0 : -1.0;
        var targetX = Math.Clamp(ballX + (direction * rng.Range(5.0, 22.0)), 1.0, SyntheticMatchGenerator.PitchLength - 1.0);
        var targetY = Math.Clamp(ballY + rng.Range(-6.0, 6.0), 1.0, SyntheticMatchGenerator.PitchWidth - 1.0);
        var distance = Distance(ballX, ballY, targetX, targetY);
        var speed = rng.NextDouble() < 0.04 ? rng.Range(7.0, 8.8) : rng.Range(2.6, 6.8);
        var durationMs = Math.Max(400, (int)(distance / speed * 1000.0));
        Emit(team, PlayerId(team, holder), MatchEventTypes.Carry, ballX, ballY, targetX, targetY, durationMs,
            "COMPLETE", null, $"{PlayerName(team, holder)} carries the ball forward.");
        clock += durationMs + rng.Next(300, 1100);
        ballX = targetX;
        ballY = targetY;
    }

    private void Shoot()
    {
        var direction = team == 0 ? 1.0 : -1.0;
        var goalX = team == 0 ? SyntheticMatchGenerator.PitchLength : 0.0;
        var roll = rng.NextDouble();
        string outcome;
        string outcomeText;
        double endX;
        double endY;
        double speedKph;
        if (roll < 0.42)
        {
            outcome = "ON_TARGET";
            outcomeText = "on target, saved";
            endX = goalX;
            endY = 34.0 + rng.Range(-3.2, 3.2);
            speedKph = rng.Range(70.0, 118.0);
        }
        else if (roll < 0.80)
        {
            outcome = "OFF_TARGET";
            outcomeText = "off target";
            endX = goalX;
            endY = 34.0 + ((rng.NextDouble() < 0.5 ? -1.0 : 1.0) * rng.Range(4.6, 10.0));
            speedKph = rng.Range(70.0, 118.0);
        }
        else
        {
            outcome = "BLOCKED";
            outcomeText = "blocked";
            endX = ballX + (direction * rng.Range(1.5, 4.0));
            endY = ballY + rng.Range(-2.0, 2.0);
            speedKph = rng.Range(40.0, 70.0);
        }

        var distance = Distance(ballX, ballY, endX, endY);
        var durationMs = Math.Max(150, (int)(distance / (speedKph / 3.6) * 1000.0));
        Emit(team, PlayerId(team, holder), MatchEventTypes.Shot, ballX, ballY, endX, endY, durationMs, outcome, null,
            $"{PlayerName(team, holder)} shoots — {outcomeText}.");
        clock += durationMs + rng.Next(500, 1200);

        team = 1 - team;
        holder = 0;
        ballX = team == 0 ? 6.0 : SyntheticMatchGenerator.PitchLength - 6.0;
        ballY = 34.0;
        Emit(team, null, MatchEventTypes.PossessionChange, ballX, ballY, null, null, null, null, null,
            $"Possession changes to {TeamName(team)}.");
        clock += rng.Next(1500, 3500);
    }

    private void Foul()
    {
        var opponent = 1 - team;
        var role = NearestRole(opponent, ballX, ballY);
        Emit(opponent, PlayerId(opponent, role), MatchEventTypes.Foul, ballX, ballY, null, null, null,
            "FOUL_COMMITTED", null, $"{PlayerName(opponent, role)} commits a foul.");
        clock += rng.Next(3000, 8000);
    }
}

/// <summary>
/// Authored anchor moments. They tie the synthetic match to the supplied offside scenario S1 and give the
/// insight engine a coherent storyline: a disallowed goal, a booking, a counter-attack and a late equaliser.
/// </summary>
internal static class StoryScripts
{
    public static readonly (int StartMs, int EndMs)[] Windows =
    [
        (At(67, 5), At(67, 58)),
        (At(74, 10), At(74, 40)),
        (At(80, 36), At(81, 5)),
        (At(87, 55), At(88, 16)),
    ];

    private static int At(int minute, int second, int tenths = 0) => (minute * 60_000) + (second * 1000) + (tenths * 100);

    public static void AddTo(DraftBuffer buffer)
    {
        const string home = SyntheticMatchGenerator.HomeTeamId;
        const string away = SyntheticMatchGenerator.AwayTeamId;
        string Name(string playerId) => SyntheticMatchGenerator.PlayerName(playerId);

        void Add(int time, string team, string? player, string type, double x, double y, double? endX, double? endY,
            int? duration, string? outcome, string? receiver, string description, Score? score = null, string? scenario = null) =>
            buffer.Add(new Draft(time, team, player, type, x, y, endX, endY, duration, outcome, receiver, score, scenario, description));

        // 67' - the awarded goal that the offside review overturns (supplied scenario S1).
        Add(At(67, 8), home, "COMETS-10", MatchEventTypes.Pass, 64.2, 38.8, 71.0, 14.5, 1500, "COMPLETE", "COMETS-07",
            $"{Name("COMETS-10")} passes to {Name("COMETS-07")}.");
        Add(At(67, 15, 8), away, "LANTERNS-03", MatchEventTypes.Pressure, 70.8, 17.5, null, null, null, null, null,
            $"{Name("LANTERNS-03")} presses the ball carrier.");
        Add(At(67, 17), home, "COMETS-07", MatchEventTypes.Pass, 71.0, 14.5, 88.5, 30.2, 1400, "COMPLETE", "COMETS-09",
            $"{Name("COMETS-07")} plays a forward pass to {Name("COMETS-09")}.");
        Add(At(67, 19, 4), home, "COMETS-09", MatchEventTypes.Shot, 88.5, 30.2, 105.0, 33.4, 500, "ON_TARGET", null,
            $"{Name("COMETS-09")} shoots — on target.");
        Add(At(67, 21), home, "COMETS-09", MatchEventTypes.Goal, 105.0, 33.4, null, null, null, "AWARDED", null,
            $"Goal awarded to Alder Vale Comets: {Name("COMETS-09")}.", new Score(1, 0));
        Add(At(67, 24), home, null, MatchEventTypes.Review, 105.0, 33.4, null, null, null, "STARTED", null,
            "Offside review started: the goal is under review.", null, "S1");
        Add(At(67, 52), home, null, MatchEventTypes.Review, 105.0, 33.4, null, null, null, "GOAL_DISALLOWED", null,
            "Goal disallowed after offside review.", new Score(0, 0), "S1");
        Add(At(67, 55), away, null, MatchEventTypes.PossessionChange, 6.0, 34.0, null, null, null, null, null,
            $"Possession changes to {SyntheticMatchGenerator.TeamName(away)}.");

        // 74' - a booking for the Lanterns' pressing midfielder.
        Add(At(74, 15), away, "LANTERNS-06", MatchEventTypes.Foul, 58.4, 41.2, null, null, null, "FOUL_COMMITTED", null,
            $"{Name("LANTERNS-06")} fouls {Name("COMETS-10")}.");
        Add(At(74, 22), away, "LANTERNS-06", MatchEventTypes.Card, 58.4, 41.2, null, null, null, "YELLOW", null,
            $"{Name("LANTERNS-06")} is shown a yellow card.");

        // 81' - the Lanterns counter-attack and take the lead against the run of play.
        Add(At(80, 41), away, "LANTERNS-06", MatchEventTypes.Tackle, 52.0, 33.0, null, null, null, "WON", null,
            $"{Name("LANTERNS-06")} wins the ball.");
        Add(At(80, 41, 6), away, null, MatchEventTypes.PossessionChange, 52.0, 33.0, null, null, null, null, null,
            $"Possession changes to {SyntheticMatchGenerator.TeamName(away)}.");
        Add(At(80, 44), away, "LANTERNS-06", MatchEventTypes.Pass, 52.0, 33.0, 36.5, 56.0, 1800, "COMPLETE", "LANTERNS-11",
            $"{Name("LANTERNS-06")} passes to {Name("LANTERNS-11")}.");
        Add(At(80, 46, 4), away, "LANTERNS-11", MatchEventTypes.Carry, 36.5, 56.0, 14.8, 48.5, 2700, "COMPLETE", null,
            $"{Name("LANTERNS-11")} carries the ball at pace.");
        Add(At(80, 48, 8), home, "COMETS-04", MatchEventTypes.Pressure, 16.0, 47.2, null, null, null, null, null,
            $"{Name("COMETS-04")} presses the ball carrier.");
        Add(At(80, 49, 5), away, "LANTERNS-11", MatchEventTypes.Pass, 14.8, 48.5, 9.5, 31.0, 1100, "COMPLETE", "LANTERNS-09",
            $"{Name("LANTERNS-11")} cuts the ball back to {Name("LANTERNS-09")}.");
        Add(At(80, 51, 2), away, "LANTERNS-09", MatchEventTypes.Shot, 9.5, 31.0, 0.0, 35.4, 340, "ON_TARGET", null,
            $"{Name("LANTERNS-09")} shoots — on target.");
        Add(At(80, 52, 4), away, "LANTERNS-09", MatchEventTypes.Goal, 0.0, 35.4, null, null, null, "AWARDED", null,
            $"Goal awarded to Brindle Reach Lanterns: {Name("LANTERNS-09")}.", new Score(0, 1));
        Add(At(80, 55), home, null, MatchEventTypes.PossessionChange, 52.5, 34.0, null, null, null, null, null,
            $"Possession changes to {SyntheticMatchGenerator.TeamName(home)}.");

        // 88' - sustained pressure ends with a difficult through-ball and the equaliser.
        Add(At(87, 58), home, "COMETS-08", MatchEventTypes.Pass, 58.0, 30.0, 66.0, 42.0, 900, "COMPLETE", "COMETS-10",
            $"{Name("COMETS-08")} passes to {Name("COMETS-10")}.");
        Add(At(88, 2, 5), home, "COMETS-10", MatchEventTypes.Pass, 66.0, 42.0, 74.0, 17.0, 1500, "COMPLETE", "COMETS-07",
            $"{Name("COMETS-10")} switches play to {Name("COMETS-07")}.");
        Add(At(88, 6), away, "LANTERNS-06", MatchEventTypes.Pressure, 75.0, 18.0, null, null, null, null, null,
            $"{Name("LANTERNS-06")} presses the ball carrier.");
        Add(At(88, 7, 2), home, "COMETS-07", MatchEventTypes.Pass, 74.0, 17.0, 98.2, 31.5, 1600, "COMPLETE", "COMETS-09",
            $"{Name("COMETS-07")} threads a through-ball to {Name("COMETS-09")}.");
        Add(At(88, 9, 4), home, "COMETS-09", MatchEventTypes.Shot, 98.2, 31.5, 105.0, 31.9, 340, "ON_TARGET", null,
            $"{Name("COMETS-09")} shoots — on target.");
        Add(At(88, 10, 4), home, "COMETS-09", MatchEventTypes.Goal, 105.0, 31.9, null, null, null, "AWARDED", null,
            $"Goal awarded to Alder Vale Comets: {Name("COMETS-09")}.", new Score(1, 1));
        Add(At(88, 14), away, null, MatchEventTypes.PossessionChange, 52.5, 34.0, null, null, null, null, null,
            $"Possession changes to {SyntheticMatchGenerator.TeamName(away)}.");
    }
}
