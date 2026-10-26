using VarAI.Server.Feeds;
using VarAI.Server.Narration;
using static VarAI.Server.Tests.Narration.NarrationTestData;

namespace VarAI.Server.Tests.Narration;

[TestClass]
public sealed class NarrationVerifierTests
{
    [TestMethod]
    public void Facts_AreDerivedOnlyFromTheCueRosterAndRunningScore()
    {
        var facts = Facts(Shot);

        Assert.AreEqual("6:56", facts.Clock);
        Assert.Contains(111m, facts.Numbers);
        Assert.Contains(29.1m, facts.Numbers);
        Assert.Contains(83m, facts.Numbers);
        Assert.Contains(11m, facts.Numbers, "Shirt number from the roster.");
        Assert.DoesNotContain(112m, facts.Numbers);
        Assert.Contains((0, 0), facts.ScorePairs);
        Assert.DoesNotContain((1, 0), facts.ScorePairs);
        Assert.Contains("Ines", facts.NameWords);
        Assert.Contains("Comets", facts.NameWords);
        Assert.Contains("BRL", facts.NameWords);
        Assert.DoesNotContain("Lorcan", facts.NameWords, "Players not named by the cue are not allowed.");
        Assert.Contains("COMETS-11", facts.PlayerIds);
        Assert.IsEmpty(facts.Concepts, "A shot-speed cue does not mention goals, cards or reviews.");
        Assert.Contains("\"clock\":\"6:56\"", facts.FactsJson);
        Assert.Contains("Ines Valdry strikes it at 111 km/h", facts.FactsJson);
    }

    [TestMethod]
    public void Facts_ForTheAwardedGoalAllowBothScoresAndTheGoalConcept()
    {
        var facts = Facts(Goal);

        Assert.Contains((1, 0), facts.ScorePairs);
        Assert.Contains((0, 0), facts.ScorePairs, "The score before the goal is a fact too.");
        Assert.DoesNotContain((1, 1), facts.ScorePairs);
        Assert.Contains("goal", facts.Concepts);
        Assert.DoesNotContain("penalty", facts.Concepts);
        Assert.DoesNotContain("red_card", facts.Concepts);
        Assert.Contains("67:21", facts.Clocks);
    }

    [TestMethod]
    public void ProgressContextDoesNotAuthoriseAnInventedGoal()
    {
        foreach (var cue in Timeline.Overlays.Where(cue => cue.Kind is OverlayKinds.SprintCarry or OverlayKinds.HardPass))
        {
            Assert.DoesNotContain("goal", Facts(cue).Concepts, cue.OverlayId);
        }
    }

    [TestMethod]
    public void Facts_HashChangesWhenAnyFactChanges()
    {
        var first = Facts(Shot);
        Assert.AreEqual(first.Hash, Facts(Shot).Hash);
        Assert.AreNotEqual(first.Hash, Facts(Sprint).Hash);
        Assert.HasCount(64, first.Hash);
    }

    [TestMethod]
    public void EveryCueReferenceTextPassesTheEnglishVerifier()
    {
        foreach (var cue in Timeline.Overlays)
        {
            var result = NarrationVerifier.Verify(Faithful(cue), Facts(cue), NarrationLanguage.English);
            Assert.IsTrue(
                result.Verdict.Passed,
                $"{cue.OverlayId} {cue.Kind}: {string.Join(" | ", result.Verdict.Failures.Select(f => $"{f.Check}/{f.Field}: {f.Detail}"))}");
        }
    }

    [TestMethod]
    public void FaithfulEnglishNarrationPassesEveryCheck()
    {
        var result = NarrationVerifier.Verify(FaithfulEnglishSprint(), Facts(Sprint), NarrationLanguage.English);

        Assert.IsTrue(result.Verdict.Passed, Describe(result));
        Assert.IsEmpty(result.Verdict.Failures);
        CollectionAssert.AreEqual(NarrationVerifier.AllChecks.ToArray(), result.Verdict.PassedChecks.ToArray());
        Assert.AreEqual("Lorcan Vale powers forward with the ball", result.Text!.Headline);
    }

    [TestMethod]
    public void FaithfulTamilNarrationKeepingNamesCodesAndUnitsInLatinPasses()
    {
        var result = NarrationVerifier.Verify(FaithfulTamilSprint(), Facts(Sprint), NarrationLanguage.Tamil);

        Assert.IsTrue(result.Verdict.Passed, Describe(result));
        Assert.Contains("Lorcan Vale", result.Text!.Headline);
    }

    [TestMethod]
    public void TamilDigitsAreNormalisedBeforeNumbersAreCompared()
    {
        var json = Json(
            "Lorcan Vale பந்துடன் முன்னேறுகிறார்",
            "Lorcan Vale ௨௧.௬ m தூரத்தை ௩ s இல் ஓடிக் கடந்தார்.",
            "௨௧.௬ m தூரத்தை ௭.௩ m/s வேகத்தில் கடந்தார்.",
            "AVC ௦–௦ BRL நிலையில் கவனிக்கத்தக்கது இந்த வேகம்.");

        var result = NarrationVerifier.Verify(json, Facts(Sprint), NarrationLanguage.Tamil);

        Assert.IsTrue(result.Verdict.Passed, Describe(result));
    }

    [TestMethod]
    public void GoalNarrationMayUseTheGoalWordAndTheSuppliedScorelines()
    {
        var json = Json(
            "Ravi Sorrell scores for Alder Vale Comets",
            "Ravi Sorrell finishes from 16.9 m at 121 km/h to make it AVC 1–0 BRL.",
            "The shot travels 16.9 m at 121 km/h after a pass of 23.5 m with difficulty 81/100.",
            "It breaks the deadlock after 0–0 with 22 minutes left.");

        var result = NarrationVerifier.Verify(json, Facts(Goal), NarrationLanguage.English);

        Assert.IsTrue(result.Verdict.Passed, Describe(result));
    }

    [TestMethod]
    public void PassedChecksExcludeEveryFailedCheck()
    {
        var json = Json("Lorcan Vale powers forward", "He covers 22 m.", "He covers 21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.");

        var result = NarrationVerifier.Verify(json, Facts(Sprint), NarrationLanguage.English);

        Assert.IsFalse(result.Verdict.Passed);
        Assert.IsNull(result.Text, "Rejected text is never handed on.");
        Assert.DoesNotContain(NarrationVerifier.Numbers, result.Verdict.PassedChecks);
        Assert.Contains(NarrationVerifier.Schema, result.Verdict.PassedChecks);
        Assert.Contains(NarrationVerifier.Names, result.Verdict.PassedChecks);
    }

    public static IEnumerable<object[]> EnglishRejections =>
    [
        [NarrationVerifier.Numbers, "number not in the facts", Json("Lorcan Vale powers forward", "He covers 22 m in 3 s.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Numbers, "rounded or altered number", Json("Lorcan Vale powers forward", "He covers 21.6 m in 3 s.", "He covers 21.6 m at 7.4 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Numbers, "clock time not in the facts", Json("Lorcan Vale powers forward", "At 12:34 he covers 21.6 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Scoreboard, "scoreline not in the facts", Json("Lorcan Vale powers forward", "He covers 21.6 m.", "21.6 m at 7.3 m/s.", "It stays AVC 2–0 BRL.")],
        [NarrationVerifier.Claims, "number written as a word", Json("Lorcan Vale powers forward", "He covers 21.6 m in three s.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Claims, "ordinal word", Json("Lorcan Vale powers forward", "His second sprint of the match.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Claims, "record claim", Json("A record run by Lorcan Vale", "He covers 21.6 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Names, "unknown proper noun", Json("Lorcan Vale powers forward", "He runs past Mohamed Salah for 21.6 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Names, "player not named by the cue", Json("Lorcan Vale powers forward", "Hollis Brandt cannot stop the 21.6 m run.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Names, "player id not in the facts", Json("Lorcan Vale powers forward", "COMETS-01 cannot stop the 21.6 m run.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Events, "penalty not in the facts", Json("Lorcan Vale wins a penalty", "He covers 21.6 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Events, "goal not in the facts", Json("Lorcan Vale powers forward", "He covers 21.6 m and scores.", "21.6 m at 7.3 m/s then a goal.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Events, "injury not in the facts", Json("Lorcan Vale powers forward", "He covers 21.6 m despite an injury.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Markup, "link", Json("Lorcan Vale powers forward", "See https://example.invalid for 21.6 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Markup, "markdown bold", Json("Lorcan Vale powers forward", "He covers **21.6 m**.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Markup, "html", Json("Lorcan Vale powers forward", "He covers <b>21.6 m</b>.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Markup, "line break", Json("Lorcan Vale powers forward", "He covers\n21.6 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Markup, "bidirectional override", Json("Lorcan Vale powers forward", "He covers 21.6 m \u202E.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Script, "tamil letters in english text", Json("Lorcan Vale powers forward", "He covers 21.6 m தூரம்.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Script, "unsupported script", Json("Lorcan Vale powers forward", "He covers 21.6 m दूरी.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Schema, "missing property", "{\"headline\":\"Lorcan Vale powers forward\",\"fan\":\"x\",\"analyst\":\"y\"}"],
        [NarrationVerifier.Schema, "extra property", "{\"headline\":\"a\",\"fan\":\"b\",\"analyst\":\"c\",\"why\":\"d\",\"score\":\"e\"}"],
        [NarrationVerifier.Schema, "duplicate property", "{\"headline\":\"a\",\"headline\":\"b\",\"fan\":\"b\",\"analyst\":\"c\",\"why\":\"d\"}"],
        [NarrationVerifier.Schema, "non-string property", "{\"headline\":\"a\",\"fan\":\"b\",\"analyst\":\"c\",\"why\":4}"],
        [NarrationVerifier.Schema, "not json", "Here is the narration you asked for."],
        [NarrationVerifier.Schema, "fenced json", "```json\n{\"headline\":\"a\",\"fan\":\"b\",\"analyst\":\"c\",\"why\":\"d\"}\n```"],
        [NarrationVerifier.Schema, "array root", "[\"a\",\"b\",\"c\",\"d\"]"],
        [NarrationVerifier.Schema, "empty field", "{\"headline\":\" \",\"fan\":\"b\",\"analyst\":\"c\",\"why\":\"d\"}"],
        [NarrationVerifier.Schema, "headline too long", Json(new string('a', 101), "b", "c", "d")],
    ];

    [TestMethod]
    [DynamicData(nameof(EnglishRejections))]
    public void EnglishNarrationThatLeavesTheFactsIsRejectedByTheNamedCheck(string check, string description, string json)
    {
        var result = NarrationVerifier.Verify(json, Facts(Sprint), NarrationLanguage.English);

        Assert.IsFalse(result.Verdict.Passed, description);
        Assert.IsNull(result.Text, description);
        Assert.IsTrue(result.Verdict.Failures.Any(failure => failure.Check == check), $"{description}: {Describe(result)}");
        Assert.DoesNotContain(check, result.Verdict.PassedChecks, description);
    }

    public static IEnumerable<object[]> TamilRejections =>
    [
        [NarrationVerifier.Names, "english word in tamil text", Json("Lorcan Vale பந்துடன் முன்னேறுகிறார்", "Lorcan Vale quickly 21.6 m தூரத்தை ஓடினார்.", "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்.", "AVC 0–0 BRL நிலையில் கவனிக்கத்தக்கது.")],
        [NarrationVerifier.Script, "english text for a tamil request", Json("Lorcan Vale powers forward", "He covers 21.6 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.")],
        [NarrationVerifier.Numbers, "number not in the facts", Json("Lorcan Vale பந்துடன் முன்னேறுகிறார்", "Lorcan Vale 22 m தூரத்தை ஓடினார்.", "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்.", "AVC 0–0 BRL நிலையில் கவனிக்கத்தக்கது.")],
        [NarrationVerifier.Scoreboard, "scoreline not in the facts", Json("Lorcan Vale பந்துடன் முன்னேறுகிறார்", "Lorcan Vale 21.6 m தூரத்தை ஓடினார்.", "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்.", "AVC 3–0 BRL நிலையில் கவனிக்கத்தக்கது.")],
        [NarrationVerifier.Claims, "tamil number word", Json("Lorcan Vale பந்துடன் முன்னேறுகிறார்", "Lorcan Vale இரண்டு முறை ஓடினார்.", "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்.", "AVC 0–0 BRL நிலையில் கவனிக்கத்தக்கது.")],
        [NarrationVerifier.Events, "goal word not in the facts", Json("Lorcan Vale பந்துடன் முன்னேறுகிறார்", "Lorcan Vale கோல் நோக்கி 21.6 m ஓடினார்.", "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்.", "AVC 0–0 BRL நிலையில் கவனிக்கத்தக்கது.")],
        [NarrationVerifier.Events, "yellow card not in the facts", Json("Lorcan Vale பந்துடன் முன்னேறுகிறார்", "Lorcan Vale ஓடினார், மஞ்சள் அட்டை வந்தது.", "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்.", "AVC 0–0 BRL நிலையில் கவனிக்கத்தக்கது.")],
        [NarrationVerifier.Markup, "link", Json("Lorcan Vale பந்துடன் முன்னேறுகிறார்", "Lorcan Vale 21.6 m ஓடினார் https://example.invalid", "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்.", "AVC 0–0 BRL நிலையில் கவனிக்கத்தக்கது.")],
    ];

    [TestMethod]
    [DynamicData(nameof(TamilRejections))]
    public void TamilNarrationThatLeavesTheFactsIsRejectedByTheNamedCheck(string check, string description, string json)
    {
        var result = NarrationVerifier.Verify(json, Facts(Sprint), NarrationLanguage.Tamil);

        Assert.IsFalse(result.Verdict.Passed, description);
        Assert.IsTrue(result.Verdict.Failures.Any(failure => failure.Check == check), $"{description}: {Describe(result)}");
    }

    [TestMethod]
    public void FailureDetailsNeverEchoLongModelText()
    {
        var hostile = new string('z', 500) + "9999999999";
        var json = Json("Lorcan Vale powers forward", hostile, "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold.");

        var result = NarrationVerifier.Verify(json, Facts(Sprint), NarrationLanguage.English);

        Assert.IsFalse(result.Verdict.Passed);
        Assert.IsTrue(result.Verdict.Failures.All(failure => failure.Detail.Length <= 120), Describe(result));
    }

    [TestMethod]
    public void VerifierThrowsNothingOnHostileInput()
    {
        var inputs = new[]
        {
            string.Empty, "null", "{", "{\"headline\":\"\\ud800\"}", new string('{', 10_000),
            "{\"headline\":{\"a\":{\"b\":{\"c\":{\"d\":1}}}}}", "{\"headline\":\"a\",\"fan\":\"b\",\"analyst\":\"c\",\"why\":\"" + new string('9', 5_000) + "\"}",
        };
        foreach (var input in inputs)
        {
            var result = NarrationVerifier.Verify(input, Facts(Sprint), NarrationLanguage.English);
            Assert.IsFalse(result.Verdict.Passed, input.Length > 40 ? input[..40] : input);
        }
    }

    private static string Describe(NarrationVerification result) =>
        string.Join(" | ", result.Verdict.Failures.Select(failure => $"{failure.Check}/{failure.Field}: {failure.Detail}"));
}
