using VarAI.Server.Gate;
using VarAI.Server.Narration;
using VarAI.Server.Tests.Explanations;

namespace VarAI.Server.Tests.Gate;

[TestClass]
public sealed class DecisionLogTests
{
    private const string Session = "0123456789abcdef0123456789abcdef";

    [TestMethod]
    public void EntriesChainFromAGenesisHashBoundToTheSession()
    {
        var log = NewLog(Session);

        var first = log.Append(Draft(DecisionEvents.Proposed, "APR-001"));
        var second = log.Append(Draft(DecisionEvents.Approved, "APR-001"));

        Assert.AreEqual(1, first.Seq);
        Assert.AreEqual(2, second.Seq);
        Assert.AreEqual(DecisionLog.Genesis(Session), first.PrevHash);
        Assert.AreEqual(first.Hash, second.PrevHash);
        Assert.AreEqual(second.Hash, log.HeadHash);
        Assert.AreNotEqual(DecisionLog.Genesis(Session), DecisionLog.Genesis("fedcba9876543210fedcba9876543210"));
        Assert.HasCount(64, first.Hash);
        Assert.IsFalse(first.ActorAuthenticated, "The demo has no operator login and the log says so.");
    }

    [TestMethod]
    public void AnUntamperedLogVerifiesAndReportsItsHead()
    {
        var log = Populated();

        var result = DecisionLog.Verify(Session, log.Lines());

        Assert.IsTrue(result.Valid, result.Problem);
        Assert.AreEqual(4, result.Entries);
        Assert.IsNull(result.FirstBadSeq);
        Assert.AreEqual(log.HeadHash, result.HeadHash);
    }

    [TestMethod]
    public void AnEditedEntryIsDetected()
    {
        var lines = Populated().Lines().ToArray();
        lines[1] = lines[1].Replace("\"APPROVED\"", "\"HELD\"", StringComparison.Ordinal);

        var result = DecisionLog.Verify(Session, lines);

        Assert.IsFalse(result.Valid);
        Assert.AreEqual(2, result.FirstBadSeq);
    }

    [TestMethod]
    public void ARewrittenHashStillBreaksTheNextEntry()
    {
        var lines = Populated().Lines().ToArray();
        var first = System.Text.Json.Nodes.JsonNode.Parse(lines[0])!.AsObject();
        first["note"] = "edited after the fact";
        lines[0] = first.ToJsonString();

        var result = DecisionLog.Verify(Session, lines);

        Assert.IsFalse(result.Valid);
        Assert.AreEqual(1, result.FirstBadSeq, "The content no longer matches its own hash.");
    }

    [TestMethod]
    public void ADeletedEntryIsDetected()
    {
        var lines = Populated().Lines().ToList();
        lines.RemoveAt(1);

        var result = DecisionLog.Verify(Session, lines);

        Assert.IsFalse(result.Valid);
        Assert.AreEqual(2, result.FirstBadSeq);
    }

    [TestMethod]
    public void ReorderedEntriesAreDetected()
    {
        var lines = Populated().Lines().ToArray();
        (lines[1], lines[2]) = (lines[2], lines[1]);

        Assert.IsFalse(DecisionLog.Verify(Session, lines).Valid);
    }

    [TestMethod]
    public void AnEntryFromAnotherSessionIsRejected()
    {
        var other = NewLog("fedcba9876543210fedcba9876543210");
        other.Append(Draft(DecisionEvents.Proposed, "APR-001"));

        var result = DecisionLog.Verify(Session, other.Lines());

        Assert.IsFalse(result.Valid);
    }

    [TestMethod]
    public void TruncatingTheTailIsOnlyDetectableAgainstAKnownHeadHash()
    {
        var log = Populated();
        var truncated = log.Lines().Take(2).ToArray();

        var result = DecisionLog.Verify(Session, truncated);

        Assert.IsTrue(result.Valid, "A shorter chain is internally consistent: the chain alone cannot see a missing tail.");
        Assert.AreNotEqual(log.HeadHash, result.HeadHash, "The head hash published with the file exposes the truncation.");
    }

    [TestMethod]
    public void AnyLanguageCanRecomputeTheChainFromTheRawLinesWithOnlySha256()
    {
        var log = Populated();
        var previous = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes("VARAI-DECISION-LOG-v1:" + Session)));

        foreach (var line in log.Lines())
        {
            var match = System.Text.RegularExpressions.Regex.Match(line, "\"hash\":\"([0-9a-f]{64})\"\\}$");
            Assert.IsTrue(match.Success, "The hash is the last property of every line.");
            Assert.Contains($"\"prevHash\":\"{previous}\"", line);
            var blanked = line[..match.Index] + "\"hash\":\"\"}";
            var recomputed = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(previous + "\n" + blanked)));
            Assert.AreEqual(recomputed, match.Groups[1].Value);
            previous = match.Groups[1].Value;
        }

        Assert.AreEqual(log.HeadHash, previous);
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("not json")]
    [DataRow("{}")]
    [DataRow("[]")]
    [DataRow("null")]
    public void GarbageIsRejectedWithoutThrowing(string line)
    {
        var result = DecisionLog.Verify(Session, [line]);

        Assert.IsFalse(result.Valid);
        Assert.AreEqual(1, result.FirstBadSeq);
    }

    [TestMethod]
    public void TheSameEntriesAtTheSameTimesProduceTheSameHashes()
    {
        Assert.AreEqual(Populated().HeadHash, Populated().HeadHash);
    }

    [TestMethod]
    public void TheDownloadIsOneJsonObjectPerLineEndingWithANewline()
    {
        var log = Populated();

        var text = log.ToJsonl();

        Assert.EndsWith("\n", text);
        var lines = text.TrimEnd('\n').Split('\n');
        Assert.HasCount(4, lines);
        Assert.IsTrue(lines.All(line => line.StartsWith('{') && line.EndsWith('}') && !line.Contains('\r')));
        Assert.AreEqual(string.Empty, NewLog(Session).ToJsonl());
    }

    [TestMethod]
    public void OperatorEditsAreRecordedVerbatimIncludingTamil()
    {
        var log = NewLog(Session);
        var edits = new SortedDictionary<string, NarrationText>(StringComparer.Ordinal)
        {
            ["ta"] = new("தலைப்பு", "ரசிகர்", "ஆய்வாளர்", "ஏன்"),
        };

        log.Append(Draft(DecisionEvents.Overridden, "APR-001") with { EditedPayloadHash = new string('b', 64), Edits = edits, Note = "fixed the name" });

        var line = log.Lines().Single();
        Assert.Contains("தலைப்பு", line, "Tamil stays readable in the file.");
        Assert.Contains("fixed the name", line);
        Assert.IsTrue(DecisionLog.Verify(Session, [line]).Valid);
    }

    [TestMethod]
    public void TheLogRefusesToGrowWithoutBound()
    {
        var log = new DecisionLog(Session, new ManualTimeProvider(), maximumEntries: 3);
        log.Append(Draft(DecisionEvents.Proposed, "APR-001"));
        log.Append(Draft(DecisionEvents.Proposed, "APR-002"));
        log.Append(Draft(DecisionEvents.Proposed, "APR-003"));

        Assert.Throws<InvalidOperationException>(() => log.Append(Draft(DecisionEvents.Proposed, "APR-004")));
        Assert.AreEqual(3, log.Count);
    }

    private static DecisionLog NewLog(string session) => new(session, new ManualTimeProvider(), maximumEntries: 100);

    private static DecisionLog Populated()
    {
        var time = new ManualTimeProvider();
        var log = new DecisionLog(Session, time, maximumEntries: 100);
        log.Append(Draft(DecisionEvents.Proposed, "APR-001"));
        time.Advance(TimeSpan.FromSeconds(5));
        log.Append(Draft(DecisionEvents.Approved, "APR-001"));
        time.Advance(TimeSpan.FromSeconds(1));
        log.Append(Draft(DecisionEvents.Proposed, "APR-002"));
        time.Advance(TimeSpan.FromSeconds(20));
        log.Append(Draft(DecisionEvents.AutoHeld, "APR-002") with { Reason = "SLA_EXPIRED" });
        return log;
    }

    private static DecisionDraft Draft(string decisionEvent, string approvalId) =>
        new(decisionEvent, approvalId, "SYN-MATCH-01-OV-016", "GOAL", new string('a', 64),
            decisionEvent == DecisionEvents.AutoHeld || decisionEvent == DecisionEvents.Proposed ? DecisionLog.SystemActor : DecisionLog.Actor,
            new SortedDictionary<string, DecisionNarrationNote>(StringComparer.Ordinal)
            {
                ["en"] = new(NarrationSources.Ai, "en", null, true),
                ["ta"] = new(NarrationSources.Fallback, "en", FallbackReasons.VerifierFailed, false),
            },
            null, null, null, null);
}
