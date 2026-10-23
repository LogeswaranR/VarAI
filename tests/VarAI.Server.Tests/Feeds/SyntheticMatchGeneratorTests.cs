using System.Text.Json;
using VarAI.Server.Feeds;

namespace VarAI.Server.Tests.Feeds;

[TestClass]
public sealed class SyntheticMatchGeneratorTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [TestMethod]
    public void GenerationIsDeterministicAndSeedSensitive()
    {
        var first = JsonSerializer.Serialize(SyntheticMatchGenerator.Generate().Events, Json);
        var second = JsonSerializer.Serialize(SyntheticMatchGenerator.Generate().Events, Json);
        var otherSeed = JsonSerializer.Serialize(SyntheticMatchGenerator.Generate(7).Events, Json);

        Assert.AreEqual(first, second);
        Assert.AreNotEqual(first, otherSeed);
    }

    [TestMethod]
    public void ProducesAnOrderedFullMatchInsideThePitch()
    {
        var events = SyntheticMatchGenerator.Generate().Events;

        Assert.IsInRange(1500, 3500, events.Count);
        CollectionAssert.AreEqual(
            Enumerable.Range(1, events.Count).ToArray(), events.Select(item => item.Sequence).ToArray());
        Assert.HasCount(events.Count, events.Select(item => item.EventId).Distinct(StringComparer.Ordinal));
        Assert.IsTrue(events.Zip(events.Skip(1), (current, next) => current.MatchClockMs <= next.MatchClockMs).All(ordered => ordered));
        Assert.AreEqual(MatchEventTypes.PeriodStart, events[0].EventType);
        Assert.AreEqual(MatchEventTypes.PeriodEnd, events[^1].EventType);
        Assert.AreEqual(SyntheticMatchGenerator.MatchEndMs, events[^1].MatchClockMs);
        Assert.IsTrue(events.All(item => item.Synthetic && item.MatchId == SyntheticMatchGenerator.MatchId));
        Assert.IsTrue(events.All(item =>
            item.X is >= 0 and <= SyntheticMatchGenerator.PitchLength && item.Y is >= 0 and <= SyntheticMatchGenerator.PitchWidth &&
            (item.EndX is null || item.EndX is >= 0 and <= SyntheticMatchGenerator.PitchLength) &&
            (item.EndY is null || item.EndY is >= 0 and <= SyntheticMatchGenerator.PitchWidth)));
        Assert.IsTrue(events.All(item => item.Period == (item.MatchClockMs < SyntheticMatchGenerator.FirstPeriodEndMs ||
            item is { EventType: MatchEventTypes.PeriodEnd, MatchClockMs: SyntheticMatchGenerator.FirstPeriodEndMs } ? 1 : 2)));
        CollectionAssert.AreEquivalent(
            new[]
            {
                "PASS", "CARRY", "PRESSURE", "TACKLE", "POSSESSION_CHANGE", "SHOT", "GOAL", "FOUL", "CARD", "REVIEW",
                "PERIOD_START", "PERIOD_END",
            },
            events.Select(item => item.EventType).Distinct(StringComparer.Ordinal).ToArray());
    }

    [TestMethod]
    public void UsesOnlyFictionalRosterPlayersOnTheirOwnTeam()
    {
        var match = SyntheticMatchGenerator.Generate();
        var rosters = new Dictionary<string, HashSet<string>>
        {
            [match.HomeTeam.TeamId] = [.. match.HomeTeam.Players.Select(player => player.PlayerId)],
            [match.AwayTeam.TeamId] = [.. match.AwayTeam.Players.Select(player => player.PlayerId)],
        };

        Assert.HasCount(11, match.HomeTeam.Players);
        Assert.HasCount(11, match.AwayTeam.Players);
        Assert.IsTrue(match.Events.All(item => rosters.ContainsKey(item.TeamId)));
        Assert.IsTrue(match.Events.All(item => item.PlayerId is null || rosters[item.TeamId].Contains(item.PlayerId)));
        Assert.IsTrue(match.Events.All(item => item.ReceiverId is null || rosters[item.TeamId].Contains(item.ReceiverId)));
        Assert.IsTrue(match.Events.Any(item => item.PlayerId is null));
        Assert.IsTrue(match.Events.Any(item => item.PlayerId is not null));
    }

    [TestMethod]
    public void OnlyTheAuthoredStorylineScoresAndLinksTheReviewToScenarioS1()
    {
        var events = SyntheticMatchGenerator.Generate().Events;
        var goals = events.Where(item => item.EventType == MatchEventTypes.Goal).ToList();

        Assert.HasCount(3, goals);
        CollectionAssert.AreEqual(new[] { 4_041_000, 4_852_400, 5_290_400 }, goals.Select(item => item.MatchClockMs).ToArray());
        CollectionAssert.AreEqual(new[] { (1, 0), (0, 1), (1, 1) }, goals.Select(item => (item.ScoreAfter!.Home, item.ScoreAfter.Away)).ToArray());

        var reviews = events.Where(item => item.EventType == MatchEventTypes.Review).ToList();
        Assert.HasCount(2, reviews);
        Assert.IsTrue(reviews.All(item => item.ScenarioId == "S1" && item.TeamId == SyntheticMatchGenerator.HomeTeamId));
        Assert.AreEqual("STARTED", reviews[0].Outcome);
        Assert.AreEqual("GOAL_DISALLOWED", reviews[1].Outcome);
        Assert.AreEqual(0, reviews[1].ScoreAfter!.Home);
        Assert.AreEqual(0, reviews[1].ScoreAfter!.Away);

        var card = events.Single(item => item.EventType == MatchEventTypes.Card);
        Assert.AreEqual("LANTERNS-06", card.PlayerId);
        Assert.AreEqual("YELLOW", card.Outcome);
        Assert.AreEqual(1, events[^1].ScoreAfter!.Home);
        Assert.AreEqual(1, events[^1].ScoreAfter!.Away);
    }
}
