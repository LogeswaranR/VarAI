using System.Globalization;
using System.Text.RegularExpressions;
using VarAI.Contracts;

namespace VarAI.Server.Explanations;

public interface IExplanationOutputValidator
{
    ExplanationSuccess ParseAndValidate(
        string rawOutput, ExplanationRequest request, Scenario scenario, CancellationToken cancellationToken);
}

public sealed record GeneratedExplanation(
    string SchemaVersion, ScenarioId ScenarioId, string ContentVersion, Audience Audience,
    SourceMode SourceMode, ResponseStatus Status, Interpretation Interpretation,
    Claim Headline, IReadOnlyList<Claim> Points, IReadOnlyList<string> Limitations, Claim Recap);

public sealed partial class ExplanationOutputValidator : IExplanationOutputValidator
{
    public const int MaximumOutputCharacters = 32_768;
    public const string SyntheticLimitation = "Synthetic teaching example; not an official referee decision.";
    public const string ProvisionalLimitation = "Rule interpretation is provisional and requires human review.";
    public const string MissingEvidenceLimitation =
        "Pass-time position evidence is missing; no review outcome or final score can be inferred.";

    public ExplanationSuccess ParseAndValidate(
        string rawOutput, ExplanationRequest request, Scenario scenario, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ContractRules.Require(rawOutput is { Length: > 0 and <= MaximumOutputCharacters }, "Invalid output size.");
        var generated = ContractJson.Read<GeneratedExplanation>(rawOutput);
        var response = new ExplanationSuccess(
            generated.SchemaVersion, request.RequestId, generated.ScenarioId, generated.ContentVersion,
            generated.Audience, generated.SourceMode, generated.Status, generated.Interpretation,
            generated.Headline, generated.Points, generated.Limitations, generated.Recap);
        ContractRules.Require(request.SourceMode == SourceMode.LiveAi, "Generated output requires explicit live mode.");
        ContractRules.Success(response, request, scenario);
        RequireLimitations(response, scenario);
        CheckObviousContradictions(response, scenario);
        cancellationToken.ThrowIfCancellationRequested();
        return response;
    }

    private static void RequireLimitations(ExplanationSuccess response, Scenario scenario)
    {
        ContractRules.Require(response.Limitations.Contains(SyntheticLimitation, StringComparer.Ordinal) &&
            response.Limitations.Contains(ProvisionalLimitation, StringComparer.Ordinal),
            "Live output must retain the required synthetic and provisional limitations verbatim.");
        if (scenario.Id == ScenarioId.S3)
        {
            ContractRules.Require(response.Limitations.Contains(MissingEvidenceLimitation, StringComparer.Ordinal),
                "Missing evidence must be stated explicitly.");
        }
    }

    private static void CheckObviousContradictions(ExplanationSuccess response, Scenario scenario)
    {
        var texts = new[] { response.Headline.Text }.Concat(response.Points.Select(point => point.Text))
            .Append(response.Recap.Text).Concat(response.Limitations);
        foreach (var text in texts)
        {
            ContractRules.Require(!Percentage().IsMatch(text), "Unsupported certainty percentages are prohibited.");
            ContractRules.Require(!AuthorityClaim().IsMatch(text), "Unsupported approval claims are prohibited.");
            ContractRules.Require(!DeniedLimitations().IsMatch(text), "Required limitations must not be contradicted.");
            ContractRules.Require(!OriginalDisallowance().IsMatch(text), "The original decision was a goal award.");
            ContractRules.Require(!DiagramMeasurement().IsMatch(text), "Illustrations are not measurements.");
            CheckScoreAssertions(text, scenario);
            var contradictory = scenario.Id switch
            {
                ScenarioId.S1 => NoOffsideClaim().IsMatch(text) || ReviewConfirmation().IsMatch(text) || LevelPosition().IsMatch(text),
                ScenarioId.S2 => OffsideClaim().IsMatch(text) || ReviewDisallowance().IsMatch(text) || NearerPosition().IsMatch(text),
                _ => ReviewConfirmation().IsMatch(text) || ReviewDisallowance().IsMatch(text) ||
                    InventedPosition().IsMatch(text) || CompleteEvidence().IsMatch(text) ||
                    OffsideClaim().IsMatch(text) || NoOffsideClaim().IsMatch(text)
            };
            ContractRules.Require(!contradictory, "Prose contradicts the supplied scenario.");
        }
    }

    private static void CheckScoreAssertions(string text, Scenario scenario)
    {
        foreach (Match match in ScoreAssertion().Matches(text))
        {
            var label = match.Groups["context"].Value;
            var expected = label.Contains("before", StringComparison.OrdinalIgnoreCase) ||
                label.StartsWith("pre-", StringComparison.OrdinalIgnoreCase) ||
                label.StartsWith("starting", StringComparison.OrdinalIgnoreCase) ||
                label.StartsWith("initial", StringComparison.OrdinalIgnoreCase) ? scenario.Match.ScoreBefore : scenario.ScoreAfterReview;
            ContractRules.Require(expected is not null &&
                int.TryParse(match.Groups["home"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var home) &&
                int.TryParse(match.Groups["away"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var away) &&
                expected.Home == home && expected.Away == away, "A stated score contradicts the supplied context.");
        }
    }

    [GeneratedRegex(@"\d+(?:\.\d+)?\s*(?:%|percent\b|per\s+cent\b)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Percentage();

    [GeneratedRegex(@"\b(?:officially (?:approved|confirmed|certified)|expert[- ](?:verified|approved)|expert review (?:has been|was) completed|this (?:is|was) an official)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex AuthorityClaim();

    [GeneratedRegex(@"\b(?:no limitations(?: apply)?|not (?:a )?synthetic)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex DeniedLimitations();

    [GeneratedRegex(@"\boriginal (?:decision|call|ruling) (?:was |is )?(?:goal )?(?:disallowed|disallowance|offside)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex OriginalDisallowance();

    [GeneratedRegex(@"\b(?:diagram|markers?|coordinates?) (?:proves?|shows?|measures?|confirms?)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex DiagramMeasurement();

    [GeneratedRegex(@"\b(?:supports? no offside|no offside is supported|definitely onside)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex NoOffsideClaim();

    [GeneratedRegex(@"(?<!\bnot\s)(?<!\bnever\s)\b(?:supports? offside|offside is supported|definitely offside)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex OffsideClaim();

    [GeneratedRegex(@"\b(?:supplied )?review (?:outcome )?(?:is |was )?(?:confirms?|confirmed|awards?|awarded|goal confirmed)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ReviewConfirmation();

    [GeneratedRegex(@"\b(?:supplied )?review (?:outcome )?(?:is |was )?(?:disallows?|disallowed|goal disallowed)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ReviewDisallowance();

    [GeneratedRegex(@"\b(?<context>score before review|score before|pre-review score|starting score|initial score|final score|score after review|after-review score|score)\s+(?:(?:is|was|remains|stays|becomes|became)\s+)?(?<home>\d+)\s*[-:\u2013]\s*(?<away>\d+)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ScoreAssertion();

    [GeneratedRegex(@"\b(?:receiver (?:is|was) (?:ahead of the ball|level with|nearer)|pass-time positions? (?:is|was|are|were) (?:known|observed))\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex InventedPosition();

    [GeneratedRegex(@"\breceiver (?:is|was) level with (?:the )?second-last opponent\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex LevelPosition();

    [GeneratedRegex(@"\breceiver (?:is|was) nearer the goal line than (?:the )?second-last opponent\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex NearerPosition();

    [GeneratedRegex(@"\ball evidence (?:is )?(?:known|complete)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex CompleteEvidence();
}
