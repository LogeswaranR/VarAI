using System.Text.Json;
using VarAI.Server.Feeds;
using VarAI.Server.Narration;

namespace VarAI.Server.Tests.Narration;

/// <summary>One synthetic match shared by all narration tests; building it is deterministic and read-only.</summary>
internal static class NarrationTestData
{
    private static readonly Lazy<SyntheticMatchTimeline> SharedTimeline = new(() => new SyntheticMatchTimeline());
    private static readonly Lazy<NarrationFactsFactory> SharedFactory = new(() => new NarrationFactsFactory(Timeline));

    public static SyntheticMatchTimeline Timeline => SharedTimeline.Value;

    public static NarrationFactsFactory Factory => SharedFactory.Value;

    public static OverlayCue Cue(string overlayId) => Timeline.Overlays.Single(cue => cue.OverlayId == overlayId);

    public static OverlayCue First(string kind) => Timeline.Overlays.First(cue => cue.Kind == kind);

    /// <summary>A shot-speed cue at 6:56 for Ines Valdry (111 km/h from 29.1 m, score AVC 0–0 BRL, 83 minutes left).</summary>
    public static OverlayCue Shot => Cue("SYN-MATCH-01-OV-001");

    /// <summary>A sprint cue at 9:10 for Lorcan Vale (21.6 m in 3 s, 7.3 m/s, above the 7 m/s threshold).</summary>
    public static OverlayCue Sprint => Cue("SYN-MATCH-01-OV-002");

    /// <summary>The goal awarded at 67:21 (AVC 1–0 BRL), later overturned.</summary>
    public static OverlayCue Goal => Cue("SYN-MATCH-01-OV-016");

    public static NarrationFacts Facts(OverlayCue cue) => Factory.Create(cue);

    public static string Json(string headline, string fan, string analyst, string why) =>
        JsonSerializer.Serialize(new { headline, fan, analyst, why });

    /// <summary>A narration that only restates the cue's own deterministic text.</summary>
    public static string Faithful(OverlayCue cue) => Json(cue.Headline, cue.Detail, cue.Detail, cue.WhyItMatters);

    public static string FaithfulEnglishSprint() => Json(
        "Lorcan Vale powers forward with the ball",
        "Lorcan Vale charges up the pitch with the ball for 21.6 m in 3 s.",
        "He covers 21.6 m at 7.3 m/s, above the 7 m/s sprint threshold.",
        "The speed threshold is crossed with the score at AVC 0–0 BRL and 80 minutes left.");

    public static string FaithfulTamilSprint() => Json(
        "Lorcan Vale பந்துடன் முன்னேறுகிறார்",
        "Lorcan Vale 21.6 m தூரத்தை 3 s இல் ஓடிக் கடந்தார்.",
        "21.6 m தூரத்தை 7.3 m/s வேகத்தில் கடந்தார்; இது 7 m/s வரம்பை விட அதிகம்.",
        "AVC 0–0 BRL நிலையில் 80 நிமிடங்கள் மீதமுள்ளபோது இந்த வேகம் கவனிக்கத்தக்கது.");
}
