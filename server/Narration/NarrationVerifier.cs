using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VarAI.Server.Narration;

public sealed record NarrationVerification(NarrationText? Text, NarrationVerdict Verdict);

/// <summary>
/// Mechanical checks on model-written narration. They compare numbers, clock times, scorelines, names, event words and
/// claim words with the supplied facts, and check the script, size and markup. They reduce the ways a model can drift from
/// the facts; they do not understand meaning, so a passing narration can still be wrong or awkward.
/// </summary>
public static partial class NarrationVerifier
{
    public const string Schema = "schema";
    public const string Markup = "markup";
    public const string Script = "script";
    public const string Numbers = "numbers";
    public const string Scoreboard = "scoreboard";
    public const string Names = "names";
    public const string Events = "events";
    public const string Claims = "claims";

    public static IReadOnlyList<string> AllChecks { get; } =
        [Schema, Markup, Script, Numbers, Scoreboard, Names, Events, Claims];

    private static readonly string[] FieldNames = ["headline", "fan", "analyst", "why"];

    // Tamil text takes about 1.7 UTF-16 units per English character, so its limits are larger.
    private static readonly Dictionary<string, (int English, int Tamil)> Limits = new()
    {
        ["headline"] = (100, 170),
        ["fan"] = (260, 440),
        ["analyst"] = (420, 700),
        ["why"] = (300, 500),
    };

    [GeneratedRegex(@"[<>]|```|https?:|www\.|\]\(|\*\*|__|[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex MarkupPattern();

    public static NarrationVerification Verify(string content, NarrationFacts facts, NarrationLanguage language)
    {
        ArgumentNullException.ThrowIfNull(facts);
        var failures = new List<NarrationFailure>();
        if (!TryParse(content, failures, out var fields))
        {
            return Rejected(failures);
        }

        CheckLimits(fields, language, failures);
        if (failures.Count > 0)
        {
            return Rejected(failures);
        }

        RunFieldChecks(fields, facts, language, failures);
        var verdict = BuildVerdict(failures);
        var narration = new NarrationText(fields["headline"], fields["fan"], fields["analyst"], fields["why"]);
        return new NarrationVerification(verdict.Passed ? narration : null, verdict);
    }

    /// <summary>
    /// Runs the same checks over text written by a person (an operator override). The caller decides what to enforce:
    /// size and markup failures are blocking, while the content checks are advisory because the person is accountable.
    /// </summary>
    public static NarrationVerdict Check(NarrationText text, NarrationFacts facts, NarrationLanguage language)
    {
        ArgumentNullException.ThrowIfNull(text);
        ArgumentNullException.ThrowIfNull(facts);
        var failures = new List<NarrationFailure>();
        var fields = new Dictionary<string, string>
        {
            ["headline"] = text.Headline?.Trim() ?? string.Empty,
            ["fan"] = text.Fan?.Trim() ?? string.Empty,
            ["analyst"] = text.Analyst?.Trim() ?? string.Empty,
            ["why"] = text.Why?.Trim() ?? string.Empty,
        };
        CheckLimits(fields, language, failures);
        RunFieldChecks(fields, facts, language, failures);
        return BuildVerdict(failures);
    }

    private static void RunFieldChecks(
        Dictionary<string, string> fields, NarrationFacts facts, NarrationLanguage language, List<NarrationFailure> failures)
    {
        foreach (var (field, text) in fields)
        {
            CheckMarkup(field, text, failures);
            CheckScript(field, text, language, failures);
            var normalized = NarrationLexicon.NormalizeDigits(text);
            CheckNumbers(field, normalized, facts, failures);
            CheckNames(field, normalized, facts, language, failures);
            CheckEvents(field, normalized, facts, language, failures);
            CheckClaims(field, normalized, facts, language, failures);
        }
    }

    private static NarrationVerdict BuildVerdict(List<NarrationFailure> failures)
    {
        var failed = failures.Select(failure => failure.Check).ToHashSet(StringComparer.Ordinal);
        return new NarrationVerdict(failures.Count == 0, [.. AllChecks.Where(name => !failed.Contains(name))], failures);
    }

    private static NarrationVerification Rejected(List<NarrationFailure> failures) =>
        new(null, new NarrationVerdict(false, [], failures));

    private static bool TryParse(string content, List<NarrationFailure> failures, out Dictionary<string, string> fields)
    {
        fields = [];
        try
        {
            using var document = JsonDocument.Parse(content, new JsonDocumentOptions
            {
                MaxDepth = 4,
                CommentHandling = JsonCommentHandling.Disallow,
                AllowTrailingCommas = false,
            });
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                failures.Add(new(Schema, "root", "The model output is not a JSON object."));
                return false;
            }

            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (!FieldNames.Contains(property.Name, StringComparer.Ordinal))
                {
                    failures.Add(new(Schema, Short(property.Name), "An unexpected property was returned."));
                }
                else if (property.Value.ValueKind != JsonValueKind.String)
                {
                    failures.Add(new(Schema, property.Name, "The property is not a string."));
                }
                else if (!fields.TryAdd(property.Name, property.Value.GetString()!.Trim()))
                {
                    failures.Add(new(Schema, property.Name, "The property is duplicated."));
                }
            }
        }
        catch (Exception exception) when (exception is JsonException or ArgumentException or InvalidOperationException)
        {
            failures.Add(new(Schema, "root", "The model output is not valid JSON."));
            return false;
        }

        return failures.Count == 0;
    }

    private static void CheckLimits(Dictionary<string, string> fields, NarrationLanguage language, List<NarrationFailure> failures)
    {
        foreach (var name in FieldNames)
        {
            if (!fields.TryGetValue(name, out var text) || text.Length == 0)
            {
                failures.Add(new(Schema, name, "The property is missing or empty."));
                continue;
            }

            var (english, tamil) = Limits[name];
            if (text.Length > (language == NarrationLanguage.Tamil ? tamil : english))
            {
                failures.Add(new(Schema, name, "The text is longer than the allowed length."));
            }
        }
    }

    private static void CheckMarkup(string field, string text, List<NarrationFailure> failures)
    {
        if (MarkupPattern().IsMatch(text))
        {
            failures.Add(new(Markup, field, "The text contains markup, a link, a control character or hidden direction text."));
        }
    }

    private static void CheckScript(string field, string text, NarrationLanguage language, List<NarrationFailure> failures)
    {
        int tamil = 0, other = 0;
        foreach (var character in text)
        {
            if (NarrationLexicon.IsTamil(character))
            {
                if (char.IsLetter(character))
                {
                    tamil++;
                }
            }
            else if (char.IsLetter(character) && !NarrationLexicon.IsLatinLetter(character))
            {
                other++;
            }
        }

        if (other > 0)
        {
            failures.Add(new(Script, field, "The text contains letters from an unsupported script."));
        }
        else if (language == NarrationLanguage.English && tamil > 0)
        {
            failures.Add(new(Script, field, "English text contains Tamil letters."));
        }
        else if (language == NarrationLanguage.Tamil && tamil < (field == "headline" ? 4 : 8))
        {
            failures.Add(new(Script, field, "Tamil text does not contain enough Tamil letters."));
        }
    }

    private static void CheckNumbers(string field, string text, NarrationFacts facts, List<NarrationFailure> failures)
    {
        foreach (Match match in NarrationFacts.PlayerIdPattern().Matches(text))
        {
            if (!facts.PlayerIds.Contains(match.Value))
            {
                failures.Add(new(Names, field, $"Player ID {Short(match.Value)} is not in the facts."));
            }
        }

        text = NarrationFacts.PlayerIdPattern().Replace(text, " ");
        foreach (Match match in NarrationFacts.ClockPattern().Matches(text))
        {
            var token = $"{int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture)}:{match.Groups[2].Value}";
            if (!facts.Clocks.Contains(token))
            {
                failures.Add(new(Numbers, field, $"Clock time {token} is not in the facts."));
            }
        }

        text = NarrationFacts.ClockPattern().Replace(text, " ");
        foreach (Match match in NarrationFacts.ScorePattern().Matches(text))
        {
            var home = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
            var away = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
            if (!facts.ScorePairs.Contains((home, away)))
            {
                failures.Add(new(Scoreboard, field, $"Scoreline {home}–{away} is not in the facts."));
            }
        }

        text = NarrationFacts.ScorePattern().Replace(text, " ");
        foreach (Match match in NarrationFacts.NumberPattern().Matches(text))
        {
            if (!decimal.TryParse(match.Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value) ||
                !facts.Numbers.Contains(value))
            {
                failures.Add(new(Numbers, field, $"Number {Short(match.Value)} is not in the facts."));
            }
        }
    }

    private static void CheckNames(
        string field, string text, NarrationFacts facts, NarrationLanguage language, List<NarrationFailure> failures)
    {
        foreach (Match match in NarrationFacts.WordPattern().Matches(text))
        {
            var latin = new string([.. match.Value.Where(character => NarrationLexicon.IsLatinLetter(character) || character is '\'' or '’' or '-')])
                .Trim('-', '\'', '’');
            if (latin.Length == 0 || !latin.Any(NarrationLexicon.IsLatinLetter))
            {
                continue;
            }

            var bare = StripPossessive(latin);
            if (facts.NameWords.Contains(bare) || NarrationLexicon.LatinUnits.Contains(bare))
            {
                continue;
            }

            if (language == NarrationLanguage.Tamil)
            {
                failures.Add(new(Names, field, $"Latin word {Short(bare)} is not a supplied name, team code or unit."));
                continue;
            }

            var capitalised = char.IsUpper(bare[0]);
            var allCapitals = bare.Length >= 2 && bare.All(char.IsUpper);
            if (!capitalised || (IsSentenceStart(text, match.Index) && !allCapitals) || facts.ReferenceWords.Contains(bare))
            {
                continue;
            }

            failures.Add(new(Names, field, $"Proper noun {Short(bare)} is not in the facts."));
        }
    }

    private static void CheckEvents(
        string field, string text, NarrationFacts facts, NarrationLanguage language, List<NarrationFailure> failures)
    {
        foreach (var concept in NarrationLexicon.EventConcepts)
        {
            if (facts.Concepts.Contains(concept.Id))
            {
                continue;
            }

            var mentioned = language == NarrationLanguage.Tamil
                ? concept.Tamil.Any(word => text.Contains(word, StringComparison.Ordinal))
                : concept.English.IsMatch(text);
            if (mentioned)
            {
                failures.Add(new(Events, field, $"The text mentions '{concept.Id}', which the facts do not."));
            }
        }
    }

    private static void CheckClaims(
        string field, string text, NarrationFacts facts, NarrationLanguage language, List<NarrationFailure> failures)
    {
        if (language == NarrationLanguage.Tamil)
        {
            foreach (var word in NarrationLexicon.TamilClaims.Concat(NarrationLexicon.TamilQuantities))
            {
                if (text.Contains(word, StringComparison.Ordinal))
                {
                    failures.Add(new(Claims, field, "The text uses a claim or number word that the facts do not support."));
                    return;
                }
            }

            return;
        }

        foreach (var pattern in new[] { NarrationLexicon.EnglishClaims, NarrationLexicon.EnglishQuantities })
        {
            foreach (Match match in pattern.Matches(text))
            {
                if (!facts.ReferenceWords.Contains(match.Value))
                {
                    failures.Add(new(Claims, field, $"The word {Short(match.Value)} is a claim or number word that the facts do not use."));
                }
            }
        }
    }

    private static string StripPossessive(string word) =>
        word.EndsWith("'s", StringComparison.OrdinalIgnoreCase) || word.EndsWith("’s", StringComparison.OrdinalIgnoreCase) ? word[..^2] : word;

    private static bool IsSentenceStart(string text, int index)
    {
        for (var position = index - 1; position >= 0; position--)
        {
            var character = text[position];
            if (char.IsWhiteSpace(character) || character is '"' or '“' or '‘' or '\'' or '(')
            {
                continue;
            }

            return character is '.' or '!' or '?' or ':';
        }

        return true;
    }

    private static string Short(string value) => value.Length > 24 ? value[..24] + "…" : value;
}
