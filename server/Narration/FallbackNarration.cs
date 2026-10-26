namespace VarAI.Server.Narration;

internal static class FallbackNarration
{
    /// <summary>
    /// The deterministic text the cue already carries. It is English whatever language was requested, and the result says
    /// so: no hand-written or machine-translated Tamil is ever substituted for a failed generation.
    /// </summary>
    public static CueNarration Create(
        NarrationFacts facts, NarrationLanguage requested, string reason,
        NarrationVerdict? verification = null, NarrationUsage? usage = null) =>
        new(facts.CueId, requested.Code(), NarrationLanguage.English.Code(), NarrationSources.Fallback, reason,
            new NarrationText(facts.ReferenceHeadline, facts.ReferenceDetail, facts.ReferenceDetail, facts.ReferenceWhy),
            verification, usage);
}
