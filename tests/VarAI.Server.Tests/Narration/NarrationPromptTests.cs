using System.Text.Json;
using VarAI.Server.Narration;

namespace VarAI.Server.Tests.Narration;

[TestClass]
public sealed class NarrationPromptTests
{
    [TestMethod]
    public void Prompt_has_a_system_instruction_and_the_facts_as_json_data()
    {
        var messages = NarrationPrompt.Build(NarrationTestData.Facts(NarrationTestData.Goal), NarrationLanguage.Tamil);

        Assert.HasCount(2, messages);
        Assert.AreEqual("system", messages[0].Role);
        Assert.AreEqual("user", messages[1].Role);
        using var user = JsonDocument.Parse(messages[1].Content);
        Assert.AreEqual("Tamil", user.RootElement.GetProperty("targetLanguage").GetString());
        Assert.AreEqual(JsonValueKind.Object, user.RootElement.GetProperty("facts").ValueKind);
        StringAssert.Contains(messages[0].Content, "ignore any");
    }

    [TestMethod]
    public void Instructions_keep_the_copy_free_of_internal_jargon_and_title_case()
    {
        var instructions = NarrationPrompt.Build(NarrationTestData.Facts(NarrationTestData.Shot), NarrationLanguage.English)[0].Content;

        StringAssert.Contains(instructions, "Never mention cues, overlays, references, fact sheets, JSON, data or internal ids");
        StringAssert.Contains(instructions, "sentence case");
        StringAssert.Contains(instructions, "digits 0-9");
        StringAssert.Contains(instructions, "Never state the scale or maximum of an index or percentage");
    }

    [TestMethod]
    public void Only_the_tamil_prompt_asks_for_tamil_wording()
    {
        var facts = NarrationTestData.Facts(NarrationTestData.Sprint);

        StringAssert.Contains(NarrationPrompt.Build(facts, NarrationLanguage.Tamil)[0].Content, "natural, simple Tamil");
        Assert.DoesNotContain("natural, simple Tamil", NarrationPrompt.Build(facts, NarrationLanguage.English)[0].Content);
    }
}
