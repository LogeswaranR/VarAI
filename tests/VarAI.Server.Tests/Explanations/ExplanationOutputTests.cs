using System.Text.Json.Nodes;
using VarAI.Contracts;
using VarAI.Server.Explanations;
using static VarAI.Server.Tests.Explanations.ExplanationFixtures;

namespace VarAI.Server.Tests.Explanations;

[TestClass]
public sealed class ExplanationOutputTests
{
    public required TestContext TestContext { get; set; }

    public static IEnumerable<object[]> Matrix => ExplanationServiceTests.Matrix;
    public static IEnumerable<object[]> OverLimitMatrix =>
        from row in Matrix
        from recap in new[] { false, true }
        select row.Concat([recap]).ToArray();

    [TestMethod]
    [DynamicData(nameof(Matrix))]
    public async Task ExplainAsync_ExactUnicodeWordBoundariesAreAccepted(
        ScenarioId id, Audience audience, SourceMode mode)
    {
        var result = Assert.IsInstanceOfType<ExplanationSuccess>(
            await AtWordBoundaryAsync(id, audience, mode, 0, 0));
        Assert.AreEqual(ContractRules.ExplanationWordLimit(audience),
            ContractRules.WordCount(result.Headline.Text) + result.Points.Sum(point => ContractRules.WordCount(point.Text)));
        Assert.AreEqual(40, ContractRules.WordCount(result.Recap.Text));
    }

    [TestMethod]
    [DynamicData(nameof(OverLimitMatrix))]
    public async Task ExplainAsync_OneWordOverEitherBoundaryIsRejectedWithoutTruncation(
        ScenarioId id, Audience audience, SourceMode mode, bool recap)
    {
        Error(await AtWordBoundaryAsync(id, audience, mode, recap ? 0 : 1, recap ? 1 : 0), ErrorCode.InvalidOutput);
    }

    [TestMethod]
    public async Task ExplainAsync_AllUnicodeWhitespaceSeparatorsUseTheSharedCounter()
    {
        var separators = new[]
        {
            '\t', '\n', '\v', '\f', '\r', ' ', '\u0085', '\u00a0', '\u1680',
            '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006',
            '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000'
        };
        var output = Output(Scenario(), Audience.Casual);
        foreach (var separator in separators)
        {
            var changed = output with
            {
                Headline = output.Headline with { Text = string.Join(separator, Enumerable.Repeat("word", 89)) },
                Points = [output.Points[0] with { Text = "word" }],
                Recap = output.Recap with { Text = string.Join(separator, Enumerable.Repeat("word", 40)) }
            };
            Assert.IsInstanceOfType<ExplanationSuccess>(await GenerateAsync(ContractJson.Write(changed)));
            changed = changed with { Headline = changed.Headline with { Text = changed.Headline.Text + separator + "word" } };
            Error(await GenerateAsync(ContractJson.Write(changed)), ErrorCode.InvalidOutput);
        }
        Assert.AreEqual(1, ContractRules.WordCount("one\u200btwo"));
    }

    [TestMethod]
    [DataRow("broken-json")]
    [DataRow("null")]
    [DataRow("array")]
    [DataRow("fenced")]
    [DataRow("extra-field")]
    [DataRow("request-id")]
    [DataRow("duplicate-property")]
    [DataRow("missing-field")]
    [DataRow("numeric-enum")]
    [DataRow("lowercase-enum")]
    [DataRow("null-point")]
    [DataRow("null-points")]
    [DataRow("unknown-evidence")]
    [DataRow("wrong-case-evidence")]
    [DataRow("unknown-rule")]
    [DataRow("duplicate-evidence")]
    [DataRow("duplicate-claim")]
    [DataRow("rule-without-fact")]
    [DataRow("no-citations")]
    [DataRow("citation-not-list")]
    [DataRow("empty-headline")]
    [DataRow("empty-limitations")]
    [DataRow("empty-limitation")]
    [DataRow("dishonest-limitations")]
    [DataRow("schema")]
    [DataRow("scenario")]
    [DataRow("content-version")]
    [DataRow("audience")]
    [DataRow("source-mode")]
    [DataRow("interpretation")]
    [DataRow("status")]
    [DataRow("oversize")]
    [DataRow("trailing-json")]
    public async Task ExplainAsync_InvalidRawOutputNeverBecomesSuccess(string invalid)
    {
        var raw = Raw(Scenario(), Audience.Casual);
        var node = JsonNode.Parse(raw)!;
        switch (invalid)
        {
            case "broken-json": raw = "{FICTITIOUS_RAW_PAYLOAD"; break;
            case "null": raw = "null"; break;
            case "array": raw = "[]"; break;
            case "fenced": raw = "```json\n" + raw + "\n```"; break;
            case "duplicate-property":
                raw = raw.Replace("\"schemaVersion\": \"0.2\"", "\"schemaVersion\": \"0.2\", \"schemaVersion\": \"0.2\"",
                    StringComparison.Ordinal);
                break;
            case "oversize": raw = new string(' ', ExplanationOutputValidator.MaximumOutputCharacters + 1); break;
            case "trailing-json": raw += "{}"; break;
            default:
                Change(node, invalid);
                raw = node.ToJsonString();
                break;
        }
        Error(await GenerateAsync(raw), ErrorCode.InvalidOutput);
    }

    [TestMethod]
    [DataRow(ScenarioId.S1, "The supplied facts support no offside.")]
    [DataRow(ScenarioId.S1, "The supplied review confirms the goal.")]
    [DataRow(ScenarioId.S2, "The supplied facts support offside.")]
    [DataRow(ScenarioId.S2, "The supplied review disallows the goal.")]
    [DataRow(ScenarioId.S3, "The receiver was ahead of the ball.")]
    [DataRow(ScenarioId.S3, "The final score is 1-0.")]
    [DataRow(ScenarioId.S3, "The supplied review confirms the goal.")]
    [DataRow(ScenarioId.S3, "The supplied review disallows the goal.")]
    [DataRow(ScenarioId.S1, "The original decision was disallowed.")]
    [DataRow(ScenarioId.S1, "There is 99% confidence.")]
    [DataRow(ScenarioId.S2, "There is 90 percent certainty.")]
    [DataRow(ScenarioId.S3, "This is officially approved.")]
    [DataRow(ScenarioId.S1, "The diagram proves the offside position.")]
    [DataRow(ScenarioId.S1, "The receiver is level with the second-last opponent.")]
    [DataRow(ScenarioId.S2, "The receiver is nearer the goal line than the second-last opponent.")]
    [DataRow(ScenarioId.S1, "The final score is 1-0.")]
    [DataRow(ScenarioId.S2, "The score before review was 1-0.")]
    [DataRow(ScenarioId.S3, "The starting score was 1-0.")]
    [DataRow(ScenarioId.S3, "The initial score was 1-0.")]
    [DataRow(ScenarioId.S3, "The final score was 0-0.")]
    [DataRow(ScenarioId.S2, "The facts do not support offside, but the receiver is definitely offside.")]
    [DataRow(ScenarioId.S3, "All evidence is complete.")]
    [DataRow(ScenarioId.S1, "No limitations apply.")]
    [DataRow(ScenarioId.S1, "This is not a synthetic example.")]
    public async Task ExplainAsync_ObviousUnsupportedOrContradictoryProseIsRejected(ScenarioId id, string text)
    {
        foreach (var audience in Enum.GetValues<Audience>())
        {
            var output = Output(Scenario(id), audience);
            output = output with { Headline = output.Headline with { Text = text } };
            Error(await GenerateAsync(ContractJson.Write(output), id, audience), ErrorCode.InvalidOutput);
        }
    }

    [TestMethod]
    [DataRow("point")]
    [DataRow("recap")]
    [DataRow("limitation")]
    public async Task ExplainAsync_ProhibitedCertaintyIsCheckedInEveryProseField(string field)
    {
        var output = Output(Scenario(), Audience.Casual);
        const string text = "There is 100% certainty.";
        output = field switch
        {
            "point" => output with { Points = [output.Points[0] with { Text = text }] },
            "recap" => output with { Recap = output.Recap with { Text = text } },
            _ => output with { Limitations = output.Limitations.Append(text).ToArray() }
        };
        Error(await GenerateAsync(ContractJson.Write(output)), ErrorCode.InvalidOutput);
    }

    [TestMethod]
    [DataRow("The score before review was 0-0; the after-review score is unknown.")]
    [DataRow("The starting score was 0-0; it must not be presented as the final score.")]
    [DataRow("The initial score was 0-0; the review outcome remains unavailable.")]
    public async Task ExplainAsync_S3MayStillDescribeTheSuppliedPreReviewScore(string recap)
    {
        var output = Output(Scenario(ScenarioId.S3), Audience.Casual);
        output = output with
        {
            Recap = output.Recap with { Text = recap }
        };
        Assert.IsInstanceOfType<ExplanationSuccess>(
            await GenerateAsync(ContractJson.Write(output), ScenarioId.S3));
    }

    [TestMethod]
    public async Task ExplainAsync_LevelPositionMayExplicitlyDenyOffsideSupport()
    {
        foreach (var audience in Enum.GetValues<Audience>())
        {
            var output = Output(Scenario(ScenarioId.S2), audience);
            const string text = "The supplied level position does not support offside in this synthetic review.";
            output = output with { Headline = output.Headline with { Text = text } };
            var result = Assert.IsInstanceOfType<ExplanationSuccess>(
                await GenerateAsync(ContractJson.Write(output), ScenarioId.S2, audience));
            Assert.AreEqual(text, result.Headline.Text);
            Assert.AreEqual(Interpretation.NoOffsideSupported, result.Interpretation);
        }
    }

    [TestMethod]
    [DataRow("status")]
    [DataRow("interpretation-offside")]
    [DataRow("interpretation-onside")]
    [DataRow("missing-limitation")]
    public async Task ExplainAsync_S3CannotClaimACompleteOrDecisiveOutcome(string invalid)
    {
        var output = Output(Scenario(ScenarioId.S3), Audience.Analyst);
        output = invalid switch
        {
            "status" => output with { Status = ResponseStatus.Complete },
            "interpretation-offside" => output with { Interpretation = Interpretation.OffsideSupported },
            "interpretation-onside" => output with { Interpretation = Interpretation.NoOffsideSupported },
            _ => output with
            {
                Limitations = [ExplanationOutputValidator.SyntheticLimitation, ExplanationOutputValidator.ProvisionalLimitation]
            }
        };
        Error(await GenerateAsync(ContractJson.Write(output), ScenarioId.S3, Audience.Analyst), ErrorCode.InvalidOutput);
    }

    [TestMethod]
    public async Task ExplainAsync_ValidCitationExistenceIsNotRepresentedAsSemanticProof()
    {
        var output = Output(Scenario(), Audience.Casual);
        output = output with { Headline = output.Headline with { Text = "An unrelated sentence can still cite an existing fact." } };
        var result = Assert.IsInstanceOfType<ExplanationSuccess>(await GenerateAsync(ContractJson.Write(output)));
        Assert.Contains(ExplanationOutputValidator.ProvisionalLimitation, result.Limitations);
        Assert.AreEqual(output.Headline.Text, result.Headline.Text);
    }

    private Task<IExplanationResult> GenerateAsync(
        string raw, ScenarioId id = ScenarioId.S1, Audience audience = Audience.Casual) =>
        Service(provider: new Provider { Generate = (_, _) => Task.FromResult(raw) })
            .ExplainAsync(Request(id, audience), TestContext.CancellationToken);

    private Task<IExplanationResult> AtWordBoundaryAsync(
        ScenarioId id, Audience audience, SourceMode mode, int explanationExtra, int recapExtra)
    {
        var scenario = Scenario(id);
        var output = Output(scenario, audience);
        output = output with
        {
            Headline = output.Headline with { Text = Words(ContractRules.ExplanationWordLimit(audience) - 1 + explanationExtra) },
            Points = [output.Points[0] with { Text = "word" }],
            Recap = output.Recap with { Text = Words(40 + recapExtra) }
        };
        if (mode == SourceMode.Authored)
        {
            var body = new ExplanationBody(SourceMode.Authored, output.Status, output.Interpretation,
                output.Headline, output.Points, output.Limitations, output.Recap);
            scenario = scenario with
            {
                AuthoredExplanations = audience == Audience.Casual
                    ? scenario.AuthoredExplanations with { Casual = body }
                    : scenario.AuthoredExplanations with { Analyst = body }
            };
        }
        var repository = new Repository { Find = (_, _) => Task.FromResult<Scenario?>(scenario) };
        var provider = new Provider { Generate = (_, _) => Task.FromResult(ContractJson.Write(output)) };
        return Service(repository, provider).ExplainAsync(Request(id, audience, mode), TestContext.CancellationToken);
    }

    private static void Change(JsonNode node, string invalid)
    {
        switch (invalid)
        {
            case "extra-field": node["extraPrompt"] = "unsupported"; break;
            case "request-id": node["requestId"] = "model-chosen"; break;
            case "missing-field": node.AsObject().Remove("points"); break;
            case "numeric-enum": node["audience"] = 0; break;
            case "lowercase-enum": node["audience"] = "casual"; break;
            case "null-point": node["points"] = new JsonArray((JsonNode?)null); break;
            case "null-points": node["points"] = null; break;
            case "unknown-evidence": node["headline"]!["evidenceIds"] = new JsonArray("F-INVENTED"); break;
            case "wrong-case-evidence": node["headline"]!["evidenceIds"] = new JsonArray("f-position"); break;
            case "unknown-rule": node["headline"]!["ruleIds"] = new JsonArray("R-INVENTED"); break;
            case "duplicate-evidence": node["headline"]!["evidenceIds"] = new JsonArray("F-POSITION", "F-POSITION"); break;
            case "duplicate-claim": node["recap"]!["id"] = node["headline"]!["id"]!.GetValue<string>(); break;
            case "rule-without-fact": node["headline"]!["evidenceIds"] = new JsonArray("DECISION-ORIGINAL"); break;
            case "no-citations":
                node["headline"]!["evidenceIds"] = new JsonArray();
                node["headline"]!["ruleIds"] = new JsonArray();
                break;
            case "citation-not-list": node["headline"]!["evidenceIds"] = "F-POSITION"; break;
            case "empty-headline": node["headline"]!["text"] = "\u00a0"; break;
            case "empty-limitations": node["limitations"] = new JsonArray(); break;
            case "empty-limitation": node["limitations"]!.AsArray().Add(""); break;
            case "dishonest-limitations": node["limitations"] = new JsonArray("Everything is known; no limitations apply."); break;
            case "schema": node["schemaVersion"] = "0.1"; break;
            case "scenario": node["scenarioId"] = "S2"; break;
            case "content-version": node["contentVersion"] = "different"; break;
            case "audience": node["audience"] = "ANALYST"; break;
            case "source-mode": node["sourceMode"] = "AUTHORED"; break;
            case "interpretation": node["interpretation"] = "NO_OFFSIDE_SUPPORTED"; break;
            case "status": node["status"] = "ERROR"; break;
            default: throw new ArgumentOutOfRangeException(nameof(invalid));
        }
    }
}
