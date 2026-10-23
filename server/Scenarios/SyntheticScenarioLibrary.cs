using VarAI.Contracts;

namespace VarAI.Scenarios;

public static class SyntheticScenarioLibrary
{
    public const string ContentVersion = "synthetic-1.0.0";
    public const string SourceCheckedOn = "2026-10-22";

    private const string PositionRule = "R-L11-POSITION";
    private const string InvolvementRule = "R-L11-INVOLVEMENT";
    private const string ReviewRule = "R-VAR-AUTHORITY";
    private const string SuppliedSource = "Synthetic authored observation; not footage or tracking evidence.";
    private const string MissingSource = "Synthetic authored omission; pass-time position evidence is unavailable.";

    internal static Scenario[] Create()
    {
        var first = new Scenario(
            ContractRules.SchemaVersion, ContentVersion, ScenarioId.S1, true,
            $"S1 — Synthetic offside-supported review ({ContentVersion})",
            new("Alder Vale Comets", "Brindle Reach Lanterns", 67, new(0, 0)),
            OriginalDecision.GoalAwarded, ReviewOutcome.GoalDisallowed, new(0, 0),
            Interpretation.OffsideSupported,
            [
                new("F-PASS", FactKey.PassTimeObserved, new BooleanFactValue(true), EvidenceStatus.Supplied, SuppliedSource),
                new("F-HALF", FactKey.ReceiverInOpponentsHalf, new BooleanFactValue(true), EvidenceStatus.Supplied, SuppliedSource),
                new("F-BALL", FactKey.ReceiverAheadOfBall, new BooleanFactValue(true), EvidenceStatus.Supplied, SuppliedSource),
                new("F-POSITION", FactKey.ReceiverVsSecondLast, new PositionFactValue(ReceiverPosition.Nearer),
                    EvidenceStatus.Supplied, SuppliedSource),
                new("F-TOUCH", FactKey.ActiveInvolvement, new InvolvementFactValue(ActiveInvolvement.Touch),
                    EvidenceStatus.Supplied, SuppliedSource),
                new("F-PLAY", FactKey.PlayType, new PlayTypeFactValue(PlayType.OpenPlay), EvidenceStatus.Supplied, SuppliedSource),
                new("F-OPPONENT", FactKey.InterveningOpponentTouch, new BooleanFactValue(false), EvidenceStatus.Supplied, SuppliedSource)
            ],
            Rules(),
            [
                new("E-PASS", 0, EventKind.Pass,
                    "Synthetic Comets teammate's open-play foot pass; compressed demonstration timing.",
                    ["F-PASS", "F-HALF", "F-BALL", "F-POSITION", "F-PLAY", "F-OPPONENT"]),
                new("E-TOUCH", 1_200, EventKind.ReceiverTouch,
                    "Synthetic Comets receiver plays the teammate's pass.", ["F-TOUCH"]),
                new("E-SHOT", 2_100, EventKind.Shot, "Synthetic Comets receiver shoots.", []),
                new("E-GOAL", 3_000, EventKind.Goal, "Synthetic goal; the original decision awards it to the Comets.", []),
                new("E-REVIEW", 4_400, EventKind.ReviewStarted, "Synthetic offside-review sequence begins.", []),
                new("E-READY", 6_000, EventKind.ReviewReady,
                    "Prototype evidence pack ready; supplied review outcome is not an official decision.", [])
            ],
            new(DiagramStatus.Illustrative, AttackDirection.LeftToRight,
                [
                    new("M-PASSER", MarkerRole.Passer, "Illustrative Comets passer", 39, 54),
                    new("M-BALL", MarkerRole.Ball, "Illustrative ball at the foot pass", 41, 54),
                    new("M-RECEIVER", MarkerRole.Receiver, "Illustrative Comets receiver", 76, 43),
                    new("M-SECOND-LAST", MarkerRole.Opponent, "Illustrative Lanterns second-last opponent", 70, 61),
                    new("M-LAST", MarkerRole.Opponent, "Illustrative Lanterns last opponent", 91, 50)
                ], 70,
                "Synthetic illustration, left to right: the receiver is beyond the second-last opponent and the ball. " +
                "Markers illustrate supplied facts, not measured body positions or an offside calculation."),
            new("PAIR-01", ScenarioId.S2, FactKey.ReceiverVsSecondLast),
            S1Explanations());

        var second = first with
        {
            Id = ScenarioId.S2,
            Label = $"S2 — Synthetic level-position review ({ContentVersion})",
            SuppliedReviewOutcome = ReviewOutcome.GoalConfirmed,
            ScoreAfterReview = new(1, 0),
            Interpretation = Interpretation.NoOffsideSupported,
            Facts = first.Facts.Select(fact => fact.Key == FactKey.ReceiverVsSecondLast
                ? fact with { Value = new PositionFactValue(ReceiverPosition.Level) } : fact).ToArray(),
            Diagram = first.Diagram with
            {
                Markers = first.Diagram.Markers.Select(marker => marker.Role == MarkerRole.Receiver
                    ? marker with { X = 70 } : marker).ToArray(),
                TextAlternative =
                    "Synthetic illustration, left to right: the receiver is level with the second-last opponent and ahead of the ball. " +
                    "Only that supplied positional relation changes from S1; markers are not measurements."
            },
            Comparison = new("PAIR-01", ScenarioId.S1, FactKey.ReceiverVsSecondLast),
            AuthoredExplanations = S2Explanations()
        };

        var missing = first with
        {
            Id = ScenarioId.S3,
            Label = $"S3 — Synthetic missing-position review ({ContentVersion})",
            SuppliedReviewOutcome = null,
            ScoreAfterReview = null,
            Interpretation = Interpretation.InsufficientEvidence,
            Facts = first.Facts.Select(fact => fact.Key switch
            {
                FactKey.PassTimeObserved => fact with
                {
                    Value = new BooleanFactValue(false),
                    SourceLabel = "Synthetic authored omission; no pass-time positional observation is supplied."
                },
                FactKey.ReceiverAheadOfBall or FactKey.ReceiverVsSecondLast => fact with
                {
                    Value = null,
                    Status = EvidenceStatus.Missing,
                    SourceLabel = MissingSource
                },
                _ => fact
            }).ToArray(),
            Events = first.Events.Select(item => item.Kind switch
            {
                EventKind.Pass => item with
                {
                    Label = "Synthetic Comets teammate's foot pass; pass-time positions unavailable; compressed demonstration timing."
                },
                EventKind.ReviewReady => item with
                {
                    Label = "Incomplete prototype evidence pack ready; review outcome and after-review score remain unknown."
                },
                _ => item
            }).ToArray(),
            Diagram = new(DiagramStatus.Unavailable, AttackDirection.LeftToRight, [], null,
                "Pass-time positions are unavailable. No player markers or reference line are supplied; none are inferred."),
            Comparison = null,
            AuthoredExplanations = S3Explanations()
        };

        return [first, second, missing];
    }

    private static RuleReference[] Rules() =>
    [
        new(PositionRule, "Law 11 — Offside position", "11.1 — Offside position", "IFAB",
            "https://www.theifab.com/laws/latest/offside/#offside-position",
            ContractRules.RuleEdition, SourceCheckedOn, ReviewStatus.SourceChecked,
            "Offside position depends on eligible body parts being in the opponents' half and beyond both the ball " +
            "and second-last opponent. Hands and arms do not count. Level with the second-last opponent is not an offside position; " +
            "position alone is not an offence."),
        new(InvolvementRule, "Law 11 — Playing a teammate's pass", "11.2 — Offside offence; interfering with play", "IFAB",
            "https://www.theifab.com/laws/latest/offside/#offside-offence",
            ContractRules.RuleEdition, SourceCheckedOn, ReviewStatus.SourceChecked,
            "For this open-play foot-pass example, position is assessed at the teammate's first contact with the ball. " +
            "A receiver in an offside position who then plays that pass becomes involved in play. " +
            "Interference, opponent-play exceptions, rebounds, saves and direct restarts are outside this example."),
        new(ReviewRule, "VAR protocol — Goal review and decision authority",
            "1 — Principles 4–6; 2(a) — Goal/no goal", "IFAB",
            "https://www.theifab.com/laws/latest/video-assistant-referee-var-protocol/#principles",
            ContractRules.RuleEdition, SourceCheckedOn, ReviewStatus.SourceChecked,
            "A goal review can examine an attacking offside offence. The referee initiates the review and retains " +
            "the final decision; the VAR assists. Review accuracy takes priority over speed, not a fixed countdown.")
    ];

    private static string[] Limitations(bool missing = false)
    {
        var common = new[]
        {
            "Synthetic authored example with fictional teams, events and supplied observations; not footage, tracking data or live AI.",
            "Provisional educational interpretation: IFAB 2026/27 sources checked on 2026-10-22; no expert review or official approval.",
            "Compressed replay timings and illustrative coordinates cannot establish a real offside decision. The referee retains decision authority."
        };
        return missing
            ? [.. common, "Pass-time positions, the supplied review outcome and after-review score are missing. Their absence supports neither confirmation nor disallowance."]
            : common;
    }

    private static AuthoredExplanations S1Explanations() => new(
        new(SourceMode.Authored, ResponseStatus.Complete, Interpretation.OffsideSupported,
            new("C-HEAD", "The supplied facts support offside in this synthetic review.",
                ["F-PASS", "F-HALF", "F-BALL", "F-POSITION", "F-TOUCH"], [PositionRule, InvolvementRule]),
            [
                new("C-POSITION", "At the teammate's pass, the receiver is in the opponents' half, ahead of the ball and nearer the goal line than the second-last opponent.",
                    ["F-PASS", "F-HALF", "F-BALL", "F-POSITION"], [PositionRule, InvolvementRule]),
                new("C-TOUCH", "The receiver then plays that pass; being ahead alone is not enough.",
                    ["F-PASS", "F-HALF", "F-BALL", "F-POSITION", "F-TOUCH"], [PositionRule, InvolvementRule]),
                new("C-RESULT", "The original goal award and supplied review disallowance are separate records, not an AI decision.",
                    ["DECISION-ORIGINAL", "DECISION-REVIEW"], [])
            ],
            Limitations(),
            new("C-RECAP", "The original goal was awarded. The supplied review disallows it, leaving the fictional Comets–Lanterns score at 0-0.",
                ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER"], [])),
        new(SourceMode.Authored, ResponseStatus.Complete, Interpretation.OffsideSupported,
            new("A-HEAD", "Supplied pass-time position and subsequent involvement support the authored offside interpretation.",
                ["F-PASS", "F-HALF", "F-BALL", "F-POSITION", "F-TOUCH"], [PositionRule, InvolvementRule]),
            [
                new("A-POSITION", "At the teammate's first foot contact, the supplied receiver is in the opponents' half, ahead of the ball and nearer the opponents' goal line than their second-last opponent. These are authored positional relations, not measurements extracted from the diagram.",
                    ["F-PASS", "F-HALF", "F-BALL", "F-POSITION", "F-PLAY"], [PositionRule, InvolvementRule]),
                new("A-TOUCH", "Playing the teammate's pass supplies active involvement separately from position. This is open play with no intervening opponent touch; no deliberate-play, rebound, save or direct-restart exception is being evaluated.",
                    ["F-PASS", "F-TOUCH", "F-PLAY", "F-OPPONENT"], [InvolvementRule]),
                new("A-RESULT", "The original goal award is retained separately from the supplied disallowance and unchanged 0-0 score. This evidence pack explains authored records; it does not conduct an official review or replace the referee's final decision.",
                    ["F-PLAY", "DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER"], [ReviewRule])
            ],
            Limitations(),
            new("A-RECAP", "The supplied review disallows the originally awarded goal. The fictional score remains 0-0; the offside interpretation explains the supplied facts, not a new referee decision.",
                ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER",
                    "F-PASS", "F-HALF", "F-BALL", "F-POSITION", "F-TOUCH"], [PositionRule, InvolvementRule])));

    private static AuthoredExplanations S2Explanations() => new(
        new(SourceMode.Authored, ResponseStatus.Complete, Interpretation.NoOffsideSupported,
            new("C-HEAD", "The supplied level position does not support offside in this synthetic review.",
                ["F-PASS", "F-POSITION"], [PositionRule, InvolvementRule]),
            [
                new("C-POSITION", "At the teammate's pass, the receiver is level with the second-last opponent. Level is not an offside position, even though the receiver is ahead of the ball.",
                    ["F-PASS", "F-HALF", "F-BALL", "F-POSITION"], [PositionRule, InvolvementRule]),
                new("C-TOUCH", "The later touch does not turn this supplied level position into an offside offence.",
                    ["F-PASS", "F-POSITION", "F-TOUCH"], [PositionRule, InvolvementRule]),
                new("C-RESULT", "The original goal award and supplied confirmation remain separate; the fictional score becomes 1-0.",
                    ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-AFTER"], [])
            ],
            Limitations(),
            new("C-RECAP", "The supplied review confirms the originally awarded goal. The fictional Comets lead the Lanterns 1-0, from a supplied 0-0 starting score.",
                ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER"], [])),
        new(SourceMode.Authored, ResponseStatus.Complete, Interpretation.NoOffsideSupported,
            new("A-HEAD", "The supplied level relation supports no offside for this receiver's involvement.",
                ["F-PASS", "F-POSITION", "F-TOUCH"], [PositionRule, InvolvementRule]),
            [
                new("A-POSITION", "At the teammate's first foot contact, the receiver is in the opponents' half and ahead of the ball, but level with the second-last opponent. Law 11 excludes that level relation from offside position; later playing the pass does not change the pass-time relation.",
                    ["F-PASS", "F-HALF", "F-BALL", "F-POSITION", "F-TOUCH", "F-PLAY"], [PositionRule, InvolvementRule]),
                new("A-SCOPE", "Open play, the receiver's touch and absence of an intervening opponent touch remain supplied facts. The illustrative markers are not measured evidence. This interpretation is limited to the stated offside question, not a finding about every possible offence.",
                    ["F-PLAY", "F-TOUCH", "F-OPPONENT", "F-POSITION"], [PositionRule, InvolvementRule]),
                new("A-RESULT", "The supplied review confirms the original goal award, moving the fictional score from 0-0 to 1-0. Confirmation is an authored outcome, not a decision produced by this library; the referee retains final authority.",
                    ["F-PLAY", "DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER"], [ReviewRule])
            ],
            Limitations(),
            new("A-RECAP", "The originally awarded goal is confirmed in the supplied review record. The fictional Comets–Lanterns score changes from 0-0 to 1-0; level position supports the authored no-offside interpretation.",
                ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER", "F-PASS", "F-POSITION"],
                [PositionRule, InvolvementRule])));

    private static AuthoredExplanations S3Explanations() => new(
        new(SourceMode.Authored, ResponseStatus.Limited, Interpretation.InsufficientEvidence,
            new("C-HEAD", "Missing pass-time positions prevent a supported offside conclusion.",
                ["F-PASS", "F-BALL", "F-POSITION"], [PositionRule, InvolvementRule]),
            [
                new("C-MISSING", "The receiver's later touch is supplied, but their relation to the ball and second-last opponent at the teammate's pass is unavailable. A later touch cannot fill those gaps.",
                    ["F-PASS", "F-BALL", "F-POSITION", "F-TOUCH"], [PositionRule, InvolvementRule]),
                new("C-RESULT", "The original goal award is known. No review outcome or after-review score is supplied; missing evidence does not mean the goal was confirmed or disallowed.",
                    ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-AFTER", "F-BALL", "F-POSITION"], [])
            ],
            Limitations(missing: true),
            new("C-RECAP", "The original goal was awarded, but no review outcome or after-review score is supplied. The starting score was 0-0; it must not be presented as the final score.",
                ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER"], [])),
        new(SourceMode.Authored, ResponseStatus.Limited, Interpretation.InsufficientEvidence,
            new("A-HEAD", "The evidence is insufficient: the decisive pass-time positional relations are absent, not onside.",
                ["F-PASS", "F-BALL", "F-POSITION"], [PositionRule, InvolvementRule]),
            [
                new("A-MISSING", "A teammate's open-play pass and the receiver's later involvement are authored events. No pass-time positional observation is supplied. The relations to the ball and second-last opponent are explicitly missing, rather than replaced with level, behind or illustrative coordinates.",
                    ["F-PASS", "F-BALL", "F-POSITION", "F-PLAY", "F-TOUCH"], [PositionRule, InvolvementRule]),
                new("A-TOUCH", "The opponents' half, active involvement and absence of an intervening opponent touch are supplied independently. They do not reconstruct the missing positional relations needed to apply the offside test.",
                    ["F-HALF", "F-TOUCH", "F-OPPONENT", "F-PASS", "F-BALL", "F-POSITION"], [PositionRule, InvolvementRule]),
                new("A-RESULT", "The original goal award is recorded, but a supplied review outcome and after-review score are not. An incomplete prototype evidence pack cannot establish confirmation or disallowance, and does not replace the referee's decision.",
                    ["F-PASS", "DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-AFTER"], [ReviewRule])
            ],
            Limitations(missing: true),
            new("A-RECAP", "The supplied original goal award is known. Review outcome and after-review score remain unknown; the 0-0 pre-incident score cannot be promoted to a final result.",
                ["DECISION-ORIGINAL", "DECISION-REVIEW", "MATCH-SCORE-BEFORE", "MATCH-SCORE-AFTER"], [])));
}
