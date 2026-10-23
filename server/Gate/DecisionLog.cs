using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using VarAI.Server.Narration;

namespace VarAI.Server.Gate;

public sealed record DecisionNarrationNote(string Source, string Language, string? FallbackReason, bool? VerifierPassed);

/// <summary>One line of the decision log. Hash covers every other field and the previous entry's hash.</summary>
public sealed record DecisionEntry(
    int Seq,
    string SessionId,
    string AtUtc,
    long AtSessionMs,
    string Event,
    string ApprovalId,
    string CueId,
    string CueKind,
    string PayloadHash,
    string Actor,
    bool ActorAuthenticated,
    SortedDictionary<string, DecisionNarrationNote> Narrations,
    string? EditedPayloadHash,
    SortedDictionary<string, NarrationText>? Edits,
    string? Note,
    string? Reason,
    string PrevHash,
    string Hash);

public sealed record DecisionDraft(
    string Event, string ApprovalId, string CueId, string CueKind, string PayloadHash, string Actor,
    SortedDictionary<string, DecisionNarrationNote> Narrations, string? EditedPayloadHash,
    SortedDictionary<string, NarrationText>? Edits, string? Note, string? Reason);

public sealed record DecisionLogVerification(bool Valid, int Entries, int? FirstBadSeq, string? Problem, string? HeadHash);

/// <summary>
/// Append-only, hash-chained record of every proposal and decision. The chain lets a reader of the downloaded file detect
/// edits, deletions and reordering. It does not authenticate the writer: nobody signs it, and anyone can recompute a chain
/// after changing a file, so it is evidence of internal consistency rather than proof of origin.
/// </summary>
public sealed class DecisionLog(string sessionId, TimeProvider time, int maximumEntries)
{
    public const string Actor = "operator";
    public const string SystemActor = "system";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly object gate = new();
    private readonly List<string> lines = [];
    private readonly DateTimeOffset started = time.GetUtcNow();
    private readonly long startTimestamp = time.GetTimestamp();
    private string head = Genesis(sessionId);

    public static string Genesis(string sessionId) => Hex("VARAI-DECISION-LOG-v1:" + sessionId);

    public int Count
    {
        get
        {
            lock (gate)
            {
                return lines.Count;
            }
        }
    }

    public string HeadHash
    {
        get
        {
            lock (gate)
            {
                return head;
            }
        }
    }

    public DecisionEntry Append(DecisionDraft draft)
    {
        ArgumentNullException.ThrowIfNull(draft);
        lock (gate)
        {
            if (lines.Count >= maximumEntries)
            {
                throw new InvalidOperationException("The decision log of this session is full.");
            }

            var elapsed = time.GetElapsedTime(startTimestamp);
            var unsigned = new DecisionEntry(
                lines.Count + 1, sessionId, (started + elapsed).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture),
                (long)elapsed.TotalMilliseconds, draft.Event, draft.ApprovalId, draft.CueId, draft.CueKind, draft.PayloadHash,
                draft.Actor, ActorAuthenticated: false, draft.Narrations, draft.EditedPayloadHash, draft.Edits, draft.Note,
                draft.Reason, head, string.Empty);
            var entry = unsigned with { Hash = ComputeHash(unsigned) };
            lines.Add(JsonSerializer.Serialize(entry, Json));
            head = entry.Hash;
            return entry;
        }
    }

    public IReadOnlyList<string> Lines()
    {
        lock (gate)
        {
            return [.. lines];
        }
    }

    /// <summary>The downloadable file: one JSON object per line, in order, ending with a newline.</summary>
    public string ToJsonl()
    {
        lock (gate)
        {
            return lines.Count == 0 ? string.Empty : string.Join('\n', lines) + "\n";
        }
    }

    public static DecisionLogVerification Verify(string sessionId, IEnumerable<string> jsonLines)
    {
        ArgumentNullException.ThrowIfNull(jsonLines);
        var previous = Genesis(sessionId);
        var count = 0;
        foreach (var line in jsonLines)
        {
            count++;
            DecisionEntry? entry;
            try
            {
                entry = JsonSerializer.Deserialize<DecisionEntry>(line, Json);
            }
            catch (JsonException)
            {
                return new DecisionLogVerification(false, count, count, "The line is not a valid decision entry.", null);
            }

            if (entry is null || entry.Seq != count)
            {
                return new DecisionLogVerification(false, count, count, "The sequence number is missing or out of order.", null);
            }

            if (entry.SessionId != sessionId)
            {
                return new DecisionLogVerification(false, count, count, "The entry belongs to another session.", null);
            }

            if (!StringComparer.Ordinal.Equals(entry.PrevHash, previous))
            {
                return new DecisionLogVerification(false, count, count, "The entry does not follow the previous entry.", null);
            }

            if (!StringComparer.Ordinal.Equals(entry.Hash, ComputeHash(entry with { Hash = string.Empty })))
            {
                return new DecisionLogVerification(false, count, count, "The entry content does not match its hash.", null);
            }

            previous = entry.Hash;
        }

        return new DecisionLogVerification(true, count, null, null, previous);
    }

    private static string ComputeHash(DecisionEntry unsigned) =>
        Hex(unsigned.PrevHash + "\n" + JsonSerializer.Serialize(unsigned with { Hash = string.Empty }, Json));

    private static string Hex(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
}
