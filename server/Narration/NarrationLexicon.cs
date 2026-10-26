using System.Text.RegularExpressions;

namespace VarAI.Server.Narration;

/// <summary>
/// Fixed word lists for the mechanical claim checks. They are heuristics that catch the obvious ways a model can add an event,
/// a claim or a number word that the supplied facts do not contain. They are not language understanding, so a pass never
/// proves that a sentence is true.
/// </summary>
internal static class NarrationLexicon
{
    internal sealed record Concept(string Id, Regex English, IReadOnlyList<string> Tamil);

    private static Regex Rx(string pattern) =>
        new(pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled, TimeSpan.FromMilliseconds(250));

    /// <summary>An event concept may be narrated only when the supplied reference text already uses it.</summary>
    public static IReadOnlyList<Concept> EventConcepts { get; } =
    [
        new("goal", Rx(@"\b(?:goals?|equali[sz]er|hat-?trick|brace|scored|netted)\b"), ["கோல்"]),
        new("penalty", Rx(@"\b(?:penalt(?:y|ies)|spot[- ]kick)\b"), ["பெனால்டி", "பெனால்ட்டி"]),
        new("red_card", Rx(@"\b(?:red cards?|sent off|sending[- ]off|dismiss(?:al|ed))\b"), ["சிவப்பு அட்டை"]),
        new("yellow_card", Rx(@"\b(?:yellow cards?|booked|booking|cautioned|caution)\b"), ["மஞ்சள் அட்டை"]),
        new("card", Rx(@"\bcards?\b"), ["அட்டை"]),
        new("injury", Rx(@"\b(?:injur(?:y|ed|ies)|stretcher|limp(?:ed|ing)?)\b"), ["காயம்", "காயமடை"]),
        new("offside", Rx(@"\boffside\b"), ["ஆஃப்சைட்", "ஆஃப் சைட்", "ஆப்சைடு", "ஆஃப்சைடு"]),
        new("foul", Rx(@"\b(?:fouls?|fouled|free[- ]kicks?)\b"), ["ஃபவுல்", "ஃபௌல்", "பவுல்", "ஃப்ரீ கிக்", "ப்ரீ கிக்"]),
        new("corner", Rx(@"\bcorners?\b"), ["கார்னர்"]),
        new("substitution", Rx(@"\b(?:substitut(?:e|es|ed|ion|ions)|subbed|came on)\b"), ["மாற்று வீரர்", "மாற்றாக"]),
        new("review", Rx(@"\b(?:reviews?|reviewed|VAR|video assistant)\b"), ["மறுஆய்வு", "மறு ஆய்வு", "விஏஆர்"]),
        new("save", Rx(@"\b(?:saves?|saved|goalkeeper|keeper)\b"), ["கோல்கீப்பர்", "தடுத்தார்"]),
    ];

    /// <summary>Superlatives and context the facts cannot support (records, seasons, history).</summary>
    public static Regex EnglishClaims { get; } = Rx(
        @"\b(?:records?|career|seasons?|histor(?:y|ic)|all-time|ever|fastest|slowest|best|worst|league|premier|world-class|legend(?:ary)?|titles?|trophy|rivalry|derby|hero|villain)\b");

    public static IReadOnlyList<string> TamilClaims { get; } = ["சாதனை", "வரலாறு", "சீசன்", "லீக்", "கோப்பை"];

    /// <summary>Cardinal and ordinal number words. Numbers must be digits so they can be compared with the facts.</summary>
    public static Regex EnglishQuantities { get; } = Rx(
        @"\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|dozen|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|twice|thrice|double|triple)\b");

    public static IReadOnlyList<string> TamilQuantities { get; } =
    [
        "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து", "நூறு",
        "இரண்டாவது", "மூன்றாவது", "நான்காவது", "ஐந்தாவது",
    ];

    /// <summary>Latin tokens that may appear in Tamil text besides names: units of the supplied metrics.</summary>
    public static IReadOnlySet<string> LatinUnits { get; } =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "m", "km", "h", "s" };

    public static bool IsTamil(char value) => value is >= '\u0B80' and <= '\u0BFF';

    public static bool IsLatinLetter(char value) => char.IsLetter(value) && value <= '\u024F';

    /// <summary>Tamil digits are accepted but converted so that every number is compared as ASCII.</summary>
    public static string NormalizeDigits(string text)
    {
        if (!text.Any(character => character is >= '\u0BE6' and <= '\u0BEF'))
        {
            return text;
        }

        return string.Create(text.Length, text, static (span, source) =>
        {
            for (var index = 0; index < source.Length; index++)
            {
                var character = source[index];
                span[index] = character is >= '\u0BE6' and <= '\u0BEF' ? (char)('0' + (character - '\u0BE6')) : character;
            }
        });
    }
}
