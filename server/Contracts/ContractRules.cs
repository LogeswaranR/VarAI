using System.Globalization;
using System.Text.RegularExpressions;

namespace VarAI.Contracts;

public static partial class ContractRules
{
    public const string SchemaVersion = "0.2";
    public const string RuleEdition = "2026/27";
    public const int AttemptDeadlineMs = 15_000;
    public static IReadOnlyList<string> ContextEvidenceIds { get; } =
        Array.AsReadOnly(["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER"]);

    public static int ExplanationWordLimit(Audience audience) => audience switch
    {
        Audience.Casual => 90,
        Audience.Analyst => 220,
        _ => throw new ContractViolationException("Unknown audience.")
    };
    public const int RecapWordLimit = 40;

    public static IFactValue? ExpectedFactValue(ScenarioId scenarioId, FactKey key)
    {
        if (scenarioId == ScenarioId.S3 && key is FactKey.ReceiverAheadOfBall or FactKey.ReceiverVsSecondLast)
        {
            return null;
        }
        return key switch
        {
            FactKey.PassTimeObserved => new BooleanFactValue(scenarioId != ScenarioId.S3),
            FactKey.ReceiverInOpponentsHalf or FactKey.ReceiverAheadOfBall => new BooleanFactValue(true),
            FactKey.ReceiverVsSecondLast => new PositionFactValue(
                scenarioId == ScenarioId.S1 ? ReceiverPosition.Nearer : ReceiverPosition.Level),
            FactKey.ActiveInvolvement => new InvolvementFactValue(ActiveInvolvement.Touch),
            FactKey.PlayType => new PlayTypeFactValue(PlayType.OpenPlay),
            FactKey.InterveningOpponentTouch => new BooleanFactValue(false),
            _ => throw new ContractViolationException("Unknown fact key.")
        };
    }

    public static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new ContractViolationException(message);
        }
    }

    public static void Text(string? value, string path) =>
        Require(!string.IsNullOrWhiteSpace(value), $"{path} must be non-empty text.");

    public static void Request(ExplanationRequest request)
    {
        Require(request.SchemaVersion == SchemaVersion, "Unsupported schema version.");
        Text(request.RequestId, "requestId");
        Text(request.ContentVersion, "contentVersion");
        Require(Enum.IsDefined(request.ScenarioId), "Unknown scenario ID.");
        Require(Enum.IsDefined(request.Audience), "Unknown audience.");
        Require(Enum.IsDefined(request.SourceMode), "Unknown source mode.");
    }

    public static void Scenario(Scenario scenario, IReadOnlyList<ExpertReviewRecord>? reviews = null)
    {
        Require(scenario.SchemaVersion == SchemaVersion, "Unsupported schema version.");
        Text(scenario.ContentVersion, "contentVersion");
        Require(Enum.IsDefined(scenario.Id) && scenario.Synthetic, "Only the synthetic S1/S2/S3 family is supported.");
        Text(scenario.Label, "label");
        Text(scenario.Match.HomeTeam, "match.homeTeam");
        Text(scenario.Match.AwayTeam, "match.awayTeam");
        Require(scenario.Match.IncidentMinute >= 0, "Incident minute must not be negative.");
        Score(scenario.Match.ScoreBefore);
        Require(scenario.OriginalDecision == OriginalDecision.GoalAwarded, "Unsupported original decision.");

        var expected = scenario.Id switch
        {
            ScenarioId.S1 => Interpretation.OffsideSupported,
            ScenarioId.S2 => Interpretation.NoOffsideSupported,
            _ => Interpretation.InsufficientEvidence
        };
        Require(scenario.Interpretation == expected, "Interpretation disagrees with the supplied scenario.");
        if (scenario.Id == ScenarioId.S3)
        {
            Require(scenario.SuppliedReviewOutcome is null && scenario.ScoreAfterReview is null,
                "S3 must not invent a review outcome or final score.");
            Require(scenario.Comparison is null, "S3 cannot be a comparison variant.");
        }
        else
        {
            var goal = scenario.Id == ScenarioId.S2;
            Require(scenario.SuppliedReviewOutcome == (goal ? ReviewOutcome.GoalConfirmed : ReviewOutcome.GoalDisallowed),
                "Review outcome disagrees with the supplied scenario.");
            Require(!goal || scenario.Match.ScoreBefore.Home < int.MaxValue, "Score would exceed the supported integer range.");
            if (scenario.ScoreAfterReview is not null)
            {
                Score(scenario.ScoreAfterReview);
            }
            Require(scenario.ScoreAfterReview == new Score(
                scenario.Match.ScoreBefore.Home + (goal ? 1 : 0), scenario.Match.ScoreBefore.Away),
                "Score after review disagrees with the supplied outcome.");
            Require(scenario.Comparison is { PairId: "PAIR-01", ChangedFactKey: FactKey.ReceiverVsSecondLast } &&
                scenario.Comparison.OtherScenarioId == (goal ? ScenarioId.S1 : ScenarioId.S2),
                "Only the reciprocal S1/S2 position comparison is supported.");
        }

        Unique(scenario.Facts.Select(fact => fact.Id), "fact IDs");
        Require(scenario.Facts.Count == 7 && scenario.Facts.Select(fact => fact.Key).Distinct().Count() == 7,
            "Every supported fact key must occur exactly once.");
        foreach (var fact in scenario.Facts)
        {
            Require(Enum.IsDefined(fact.Key), "Unknown fact key.");
            Require(!ContextEvidenceIds.Contains(fact.Id), "Fact IDs must not collide with context evidence IDs.");
            Text(fact.SourceLabel, "fact.sourceLabel");
            var expectedValue = ExpectedFactValue(scenario.Id, fact.Key);
            var missing = expectedValue is null;
            Require(fact.Status == (missing ? EvidenceStatus.Missing : EvidenceStatus.Supplied),
                "Fact availability disagrees with the supplied scenario.");
            Require(Equals(fact.Value, expectedValue), "Fact value, type or explicit null disagrees with the scenario.");
        }

        Require(scenario.Rules.Count > 0, "At least one rule reference is required.");
        Unique(scenario.Rules.Select(rule => rule.Id), "rule IDs");
        foreach (var rule in scenario.Rules)
        {
            Rule(rule);
            if (rule.ReviewStatus == ReviewStatus.ExpertReviewed)
            {
                Require(reviews is not null && reviews.Any(review =>
                    review.ScenarioId == scenario.Id && review.ContentVersion == scenario.ContentVersion &&
                    review.RuleId == rule.Id && review.Edition == rule.Edition &&
                    !string.IsNullOrWhiteSpace(review.Reference)), "Expert-reviewed content needs a matching review record.");
            }
        }

        Unique(scenario.Events.Select(item => item.Id), "event IDs");
        var previousOffset = -1;
        foreach (var item in scenario.Events)
        {
            Require(item.OffsetMs > previousOffset, "Replay offsets must be non-negative and strictly increasing.");
            previousOffset = item.OffsetMs;
            Require(Enum.IsDefined(item.Kind), "Unknown replay event kind.");
            Text(item.Label, "event.label");
            Unique(item.RevealFactIds, "revealed fact IDs");
            Require(item.RevealFactIds.All(id => scenario.Facts.Any(fact => fact.Id == id)),
                "Replay events may only reveal known fact IDs.");
        }
        var kinds = scenario.Events.Select(item => item.Kind).ToArray();
        var stages = Enum.GetValues<EventKind>();
        Require(kinds.Length > 0 && kinds[0] == EventKind.Pass && kinds[^1] == EventKind.ReviewReady &&
            kinds.Distinct().Count() == stages.Length && kinds.Count(kind => kind == EventKind.ReviewReady) == 1 &&
            kinds.Zip(kinds.Skip(1)).All(pair => pair.First <= pair.Second),
            "Replay stages must progress from pass through the final review-ready event.");
        Diagram(scenario.Diagram, scenario.Id);
        Require(scenario.AuthoredExplanations.Casual.SourceMode == SourceMode.Authored &&
            scenario.AuthoredExplanations.Analyst.SourceMode == SourceMode.Authored,
            "Embedded authored explanations must retain authored provenance.");
        Body(scenario.AuthoredExplanations.Casual, scenario, Audience.Casual);
        Body(scenario.AuthoredExplanations.Analyst, scenario, Audience.Analyst);
    }

    public static void Pair(Scenario first, Scenario second)
    {
        Scenario(first);
        Scenario(second);
        Require(first.Id == ScenarioId.S1 && second.Id == ScenarioId.S2,
            "Only S1 followed by S2 forms the controlled pair.");
        Require(first.ContentVersion == second.ContentVersion && first.Match == second.Match &&
            first.OriginalDecision == second.OriginalDecision, "Comparison context must match.");
        Require(first.Rules.SequenceEqual(second.Rules), "Comparison rule references must match.");
        var differences = first.Facts.Where(left =>
        {
            var right = second.Facts.Single(fact => fact.Key == left.Key);
            return left.Status != right.Status || !Equals(left.Value, right.Value);
        }).Select(fact => fact.Key).ToArray();
        Require(differences.SequenceEqual([FactKey.ReceiverVsSecondLast]),
            "Exactly the receiver's position may differ independently.");
    }

    public static void Rule(RuleReference rule)
    {
        Text(rule.Title, "rule.title");
        Text(rule.Section, "rule.section");
        Text(rule.Summary, "rule.summary");
        Require(rule.Publisher == "IFAB", "Rule publisher must be IFAB.");
        Require(Uri.TryCreate(rule.Url, UriKind.Absolute, out var uri) && uri.Scheme == "https" &&
            uri.UserInfo.Length == 0 && uri.Host is "www.theifab.com" or "theifab.com",
            "Rule URL must be an HTTPS IFAB primary source.");
        Require(Enum.IsDefined(rule.ReviewStatus), "Unknown review status.");
        Require(rule.Edition is null or RuleEdition, "Only the approved rule edition is supported.");
        Require(rule.CheckedOn is null || DateOnly.TryParseExact(rule.CheckedOn, "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out _), "Invalid source-check date.");
        if (rule.ReviewStatus != ReviewStatus.Draft)
        {
            Require(rule.Edition == RuleEdition && rule.CheckedOn is not null,
                "Reviewed rules require an edition and source-check date.");
        }
    }

    public static void Body(ExplanationBody body, Scenario scenario, Audience audience)
    {
        Require(Enum.IsDefined(body.SourceMode) && Enum.IsDefined(audience), "Unknown source mode or audience.");
        Require(body.Status == (scenario.Id == ScenarioId.S3 ? ResponseStatus.Limited : ResponseStatus.Complete),
            "Response status must reflect evidence availability.");
        Require(body.Interpretation == scenario.Interpretation, "Explanation must not change the authored interpretation.");
        var claims = new[] { body.Headline }.Concat(body.Points).Append(body.Recap).ToArray();
        Unique(claims.Select(claim => claim.Id), "claim IDs");
        var evidence = scenario.Facts.Select(fact => fact.Id).Concat(ContextEvidenceIds).ToHashSet();
        var rules = scenario.Rules.Select(rule => rule.Id).ToHashSet();
        foreach (var claim in claims)
        {
            Text(claim.Text, "claim.text");
            Unique(claim.EvidenceIds, "claim.evidenceIds");
            Unique(claim.RuleIds, "claim.ruleIds");
            Require(claim.EvidenceIds.Count + claim.RuleIds.Count > 0, "Every claim needs a supporting reference.");
            Require(claim.EvidenceIds.All(evidence.Contains) && claim.RuleIds.All(rules.Contains),
                "Claim references must resolve within the selected scenario.");
            Require(claim.RuleIds.Count == 0 || claim.EvidenceIds.Any(id => scenario.Facts.Any(fact => fact.Id == id)),
                "A rule-application claim also needs a fact reference.");
        }
        Require(body.Limitations.Count > 0, "Limitations must not be empty.");
        foreach (var limitation in body.Limitations)
        {
            Text(limitation, "limitation");
        }
        var words = WordCount(body.Headline.Text) + body.Points.Sum(claim => WordCount(claim.Text));
        Require(words <= ExplanationWordLimit(audience), "Explanation word limit exceeded.");
        Require(WordCount(body.Recap.Text) <= RecapWordLimit, "Recap word limit exceeded.");
    }

    public static void Success(ExplanationSuccess response, ExplanationRequest request, Scenario scenario)
    {
        Request(request);
        Require(response.SchemaVersion == request.SchemaVersion && response.RequestId == request.RequestId &&
            response.ScenarioId == request.ScenarioId && response.ContentVersion == request.ContentVersion &&
            response.Audience == request.Audience && response.SourceMode == request.SourceMode,
            "Explanation metadata does not match the request.");
        Require(request.ScenarioId == scenario.Id && request.ContentVersion == scenario.ContentVersion,
            "Request does not match the loaded scenario version.");
        Body(new(response.SourceMode, response.Status, response.Interpretation, response.Headline,
            response.Points, response.Limitations, response.Recap), scenario, response.Audience);
    }

    public static void Error(ContractError error)
    {
        Require(error.SchemaVersion == SchemaVersion && error.Status == ResponseStatus.Error, "Invalid error envelope.");
        Text(error.RequestId, "requestId");
        Text(error.Message, "message");
        Require(Enum.IsDefined(error.Code), "Unknown error code.");
        Require(error.Retryable == ContractErrors.IsRetryable(error.Code), "Error retry policy is inconsistent.");
    }

    public static int WordCount(string text) => Words().Matches(text).Count;

    private static void Score(Score score) =>
        Require(score.Home >= 0 && score.Away >= 0, "Scores must be non-negative.");

    private static void Unique(IEnumerable<string> ids, string path)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in ids)
        {
            Text(id, path);
            Require(seen.Add(id), $"Duplicate {path}.");
        }
    }

    private static void Diagram(Diagram diagram, ScenarioId scenarioId)
    {
        Text(diagram.TextAlternative, "diagram.textAlternative");
        Require(diagram.Direction == AttackDirection.LeftToRight, "Unsupported diagram direction.");
        if (scenarioId == ScenarioId.S3)
        {
            Require(diagram.Status == DiagramStatus.Unavailable && diagram.Markers.Count == 0 &&
                diagram.SecondLastReferenceX is null, "An unavailable snapshot must not invent positions.");
            return;
        }
        Require(diagram.Status == DiagramStatus.Illustrative && diagram.Markers.Count > 0 &&
            diagram.SecondLastReferenceX is >= 0 and <= 100, "Invalid illustrative snapshot.");
        Unique(diagram.Markers.Select(marker => marker.Id), "marker IDs");
        foreach (var marker in diagram.Markers)
        {
            Text(marker.Label, "marker.label");
            Require(Enum.IsDefined(marker.Role) && marker.X is >= 0 and <= 100 && marker.Y is >= 0 and <= 100,
                "Invalid illustrative marker.");
        }
    }

    [GeneratedRegex(@"\S+", RegexOptions.CultureInvariant)]
    private static partial Regex Words();
}
