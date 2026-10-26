namespace VarAI.Server.Narration;

public enum NarrationLanguage
{
    English,
    Tamil,
}

public static class NarrationLanguages
{
    public static IReadOnlyList<NarrationLanguage> All { get; } = [NarrationLanguage.English, NarrationLanguage.Tamil];

    public static string Code(this NarrationLanguage language) => language switch
    {
        NarrationLanguage.English => "en",
        NarrationLanguage.Tamil => "ta",
        _ => throw new ArgumentOutOfRangeException(nameof(language)),
    };

    /// <summary>The name given to the model; Tamil is named in English so the instruction stays unambiguous.</summary>
    public static string ModelName(this NarrationLanguage language) => language switch
    {
        NarrationLanguage.English => "English",
        NarrationLanguage.Tamil => "Tamil",
        _ => throw new ArgumentOutOfRangeException(nameof(language)),
    };

    /// <summary>Accepts only the exact lowercase wire codes so that a language is never guessed from input.</summary>
    public static bool TryParse(string? code, out NarrationLanguage language)
    {
        switch (code)
        {
            case "en":
                language = NarrationLanguage.English;
                return true;
            case "ta":
                language = NarrationLanguage.Tamil;
                return true;
            default:
                language = default;
                return false;
        }
    }
}
