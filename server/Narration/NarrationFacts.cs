using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using VarAI.Contracts;
using VarAI.Server.Feeds;

namespace VarAI.Server.Narration;

/// <summary>
/// Everything the narrator may say about one cue, derived only from code: the deterministic cue text, its metrics, the
/// roster and the running score. The model writes words; these facts, and the allow-lists computed from them, decide
/// which numbers, scores, clock times and names are acceptable.
/// </summary>
public sealed partial class NarrationFacts
{
    private static readonly JsonSerializerOptions FactsJsonOptions = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private NarrationFacts()
    {
    }

    public string CueId { get; private init; } = string.Empty;
    public string Kind { get; private init; } = string.Empty;
    public string Clock { get; private init; } = string.Empty;

    /// <summary>The model-visible facts as JSON, language independent.</summary>
    public string FactsJson { get; private init; } = string.Empty;

    /// <summary>SHA-256 of <see cref="FactsJson"/>; changes whenever any fact changes.</summary>
    public string Hash { get; private init; } = string.Empty;

    public string ReferenceHeadline { get; private init; } = string.Empty;
    public string ReferenceDetail { get; private init; } = string.Empty;
    public string ReferenceWhy { get; private init; } = string.Empty;

    internal HashSet<decimal> Numbers { get; private init; } = [];
    internal HashSet<string> Clocks { get; private init; } = [];
    internal HashSet<(int Home, int Away)> ScorePairs { get; private init; } = [];
    internal HashSet<string> NameWords { get; private init; } = new(StringComparer.OrdinalIgnoreCase);
    internal HashSet<string> PlayerIds { get; private init; } = new(StringComparer.Ordinal);
    internal HashSet<string> ReferenceWords { get; private init; } = new(StringComparer.OrdinalIgnoreCase);
    internal HashSet<string> Concepts { get; private init; } = new(StringComparer.Ordinal);

    [GeneratedRegex(@"(?<!\d)(\d{1,3}):(\d{2})(?!\d)", RegexOptions.CultureInvariant)]
    internal static partial Regex ClockPattern();

    [GeneratedRegex(@"(?<!\d)(\d{1,2})\s*[–—−‑-]\s*(\d{1,2})(?!\d)", RegexOptions.CultureInvariant)]
    internal static partial Regex ScorePattern();

    [GeneratedRegex(@"\b[A-Z]{3,12}-\d{2}\b", RegexOptions.CultureInvariant)]
    internal static partial Regex PlayerIdPattern();

    [GeneratedRegex(@"\d+(?:\.\d+)?", RegexOptions.CultureInvariant)]
    internal static partial Regex NumberPattern();

    [GeneratedRegex(@"[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*", RegexOptions.CultureInvariant)]
    internal static partial Regex WordPattern();

    internal static string ClockText(int ms) => MatchInsightEngine.Clock(Math.Max(0, ms));

    internal static NarrationFacts Create(
        OverlayCue cue, SyntheticMatchMetadata metadata, IReadOnlyList<SyntheticMatchEvent> sources, Func<int, Score> scoreAt)
    {
        var teams = new[] { metadata.HomeTeam, metadata.AwayTeam };
        var team = teams.FirstOrDefault(candidate => candidate.TeamId == cue.TeamId);
        var players = cue.PlayerIds
            .Select(id => teams.SelectMany(candidate => candidate.Players).FirstOrDefault(player => player.PlayerId == id))
            .OfType<SyntheticPlayer>()
            .ToList();
        var score = scoreAt(cue.InMs);
        var scoreText = $"{metadata.HomeTeam.ShortName} {score.Home}–{score.Away} {metadata.AwayTeam.ShortName}";

        var payload = new
        {
            cue = new { id = cue.OverlayId, kind = cue.Kind, priority = cue.Priority, clock = ClockText(cue.InMs) },
            team = team is null ? null : new { name = team.Name, code = team.ShortName },
            players = players.Select(player => new { name = player.Name, shirt = player.ShirtNumber, playerId = player.PlayerId }),
            scoreAtCue = new { text = scoreText, home = score.Home, away = score.Away },
            metrics = cue.Metrics.Select(metric => new { label = metric.Label, value = metric.Value, unit = metric.Unit }),
            reference = new
            {
                headline = cue.Headline,
                detail = cue.Detail,
                whyItMatters = cue.WhyItMatters,
                lowerThird = new { title = cue.LowerThird.Title, subtitle = cue.LowerThird.Subtitle },
            },
        };
        var factsJson = JsonSerializer.Serialize(payload, FactsJsonOptions);

        var referenceText = string.Join('\n', cue.Headline, cue.Detail, cue.WhyItMatters, cue.LowerThird.Title, cue.LowerThird.Subtitle);
        var numbers = new HashSet<decimal>();
        var clocks = new HashSet<string> { ClockText(cue.InMs) };
        var pairs = new HashSet<(int, int)> { (score.Home, score.Away) };

        foreach (var source in sources)
        {
            clocks.Add(ClockText(source.MatchClockMs));
            numbers.Add(source.MatchClockMs / 60_000);
        }

        if (sources.Count > 0)
        {
            var before = scoreAt(sources.Min(source => source.MatchClockMs) - 1);
            pairs.Add((before.Home, before.Away));
        }

        if (cue.SourceWindow is { } window)
        {
            clocks.Add(ClockText(window.StartMs));
            clocks.Add(ClockText(window.EndMs));
        }

        numbers.Add(cue.InMs / 60_000);
        AddNumbers(referenceText, numbers, clocks, pairs);
        foreach (var metric in cue.Metrics)
        {
            numbers.Add(Convert.ToDecimal(metric.Value, CultureInfo.InvariantCulture));
        }

        foreach (var player in players)
        {
            numbers.Add(player.ShirtNumber);
        }

        var nameWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var named in teams)
        {
            AddWords(named.Name, nameWords);
            nameWords.Add(named.ShortName);
        }

        var playerIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var player in players)
        {
            AddWords(player.Name, nameWords);
            playerIds.Add(player.PlayerId);
        }

        var referenceWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        AddWords(referenceText, referenceWords);

        var concepts = new HashSet<string>(StringComparer.Ordinal);
        foreach (var concept in NarrationLexicon.EventConcepts)
        {
            if (concept.English.IsMatch(referenceText))
            {
                concepts.Add(concept.Id);
            }
        }

        return new NarrationFacts
        {
            CueId = cue.OverlayId,
            Kind = cue.Kind,
            Clock = ClockText(cue.InMs),
            FactsJson = factsJson,
            Hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(factsJson))),
            ReferenceHeadline = cue.Headline,
            ReferenceDetail = cue.Detail,
            ReferenceWhy = cue.WhyItMatters,
            Numbers = numbers,
            Clocks = clocks,
            ScorePairs = pairs,
            NameWords = nameWords,
            PlayerIds = playerIds,
            ReferenceWords = referenceWords,
            Concepts = concepts,
        };
    }

    private static void AddNumbers(string text, HashSet<decimal> numbers, HashSet<string> clocks, HashSet<(int, int)> pairs)
    {
        text = NarrationLexicon.NormalizeDigits(text);
        foreach (Match match in ClockPattern().Matches(text))
        {
            var minutes = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
            clocks.Add($"{minutes}:{match.Groups[2].Value}");
            numbers.Add(minutes);
        }

        text = ClockPattern().Replace(text, " ");
        foreach (Match match in ScorePattern().Matches(text))
        {
            var home = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
            var away = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
            pairs.Add((home, away));
            numbers.Add(home);
            numbers.Add(away);
        }

        text = ScorePattern().Replace(text, " ");
        foreach (Match match in NumberPattern().Matches(text))
        {
            numbers.Add(decimal.Parse(match.Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture));
        }
    }

    private static void AddWords(string text, HashSet<string> target)
    {
        foreach (Match match in WordPattern().Matches(text))
        {
            target.Add(match.Value);
            if (match.Value.EndsWith("'s", StringComparison.OrdinalIgnoreCase) || match.Value.EndsWith("’s", StringComparison.OrdinalIgnoreCase))
            {
                target.Add(match.Value[..^2]);
            }
        }
    }
}

/// <summary>Builds the facts for any cue of the one synthetic match (the running score comes from the event stream).</summary>
public sealed class NarrationFactsFactory
{
    private readonly SyntheticMatchTimeline timeline;
    private readonly Dictionary<string, SyntheticMatchEvent> eventsById;
    private readonly (int Ms, Score Score)[] scoreChanges;

    public NarrationFactsFactory(SyntheticMatchTimeline timeline)
    {
        this.timeline = timeline ?? throw new ArgumentNullException(nameof(timeline));
        eventsById = timeline.Events.ToDictionary(item => item.EventId, StringComparer.Ordinal);
        scoreChanges = [.. timeline.Events.Where(item => item.ScoreAfter is not null).Select(item => (item.MatchClockMs, item.ScoreAfter!))];
    }

    public NarrationFacts Create(OverlayCue cue)
    {
        ArgumentNullException.ThrowIfNull(cue);
        var sources = cue.SourceEventIds.Select(id => eventsById.GetValueOrDefault(id)).OfType<SyntheticMatchEvent>().ToList();
        return NarrationFacts.Create(cue, timeline.Metadata, sources, ScoreAt);
    }

    private Score ScoreAt(int ms)
    {
        var current = timeline.Metadata.StartingScore;
        foreach (var (changeMs, score) in scoreChanges)
        {
            if (changeMs > ms)
            {
                break;
            }

            current = score;
        }

        return current;
    }
}
