// Generated from the C# schema and approved operations; do not edit.
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type ExplanationRequestInput = {
  readonly audience: Audience;
  readonly contentVersion: string;
  readonly requestId: string;
  readonly scenarioId: ScenarioId;
  readonly schemaVersion: string;
  readonly sourceMode: SourceMode;
};

export type ActiveInvolvement =
  | 'TOUCH';

export type AttackDirection =
  | 'LEFT_TO_RIGHT';

export type Audience =
  | 'CASUAL'
  | 'ANALYST';

export type DiagramStatus =
  | 'ILLUSTRATIVE'
  | 'UNAVAILABLE';

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'SCENARIO_NOT_FOUND'
  | 'CONTENT_VERSION_MISMATCH'
  | 'MODEL_NOT_CONFIGURED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_OUTPUT';

export type EventKind =
  | 'PASS'
  | 'RECEIVER_TOUCH'
  | 'SHOT'
  | 'GOAL'
  | 'REVIEW_STARTED'
  | 'REVIEW_READY';

export type EvidenceStatus =
  | 'SUPPLIED'
  | 'MISSING';

export type FactKey =
  | 'PASS_TIME_OBSERVED'
  | 'RECEIVER_IN_OPPONENTS_HALF'
  | 'RECEIVER_AHEAD_OF_BALL'
  | 'RECEIVER_VS_SECOND_LAST'
  | 'ACTIVE_INVOLVEMENT'
  | 'PLAY_TYPE'
  | 'INTERVENING_OPPONENT_TOUCH';

export type Interpretation =
  | 'OFFSIDE_SUPPORTED'
  | 'NO_OFFSIDE_SUPPORTED'
  | 'INSUFFICIENT_EVIDENCE';

export type MarkerRole =
  | 'PASSER'
  | 'RECEIVER'
  | 'OPPONENT'
  | 'BALL';

export type OriginalDecision =
  | 'GOAL_AWARDED';

export type PlayType =
  | 'OPEN_PLAY';

export type ReceiverPosition =
  | 'NEARER'
  | 'LEVEL';

export type ResponseStatus =
  | 'COMPLETE'
  | 'LIMITED'
  | 'ERROR';

export type ReviewOutcome =
  | 'GOAL_DISALLOWED'
  | 'GOAL_CONFIRMED';

export type ReviewStatus =
  | 'DRAFT'
  | 'SOURCE_CHECKED'
  | 'EXPERT_REVIEWED';

export type ScenarioId =
  | 'S1'
  | 'S2'
  | 'S3';

export type SourceMode =
  | 'AUTHORED'
  | 'LIVE_AI';

export type ClaimFieldsFragment = { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> };

export type BodyFieldsFragment = { readonly sourceMode: SourceMode, readonly status: ResponseStatus, readonly interpretation: Interpretation, readonly limitations: ReadonlyArray<string>, readonly headline: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }, readonly points: ReadonlyArray<{ readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }>, readonly recap: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> } };

export type ErrorFieldsFragment = { readonly __typename: 'ContractError', readonly schemaVersion: string, readonly requestId: string, readonly status: ResponseStatus, readonly code: ErrorCode, readonly message: string, readonly retryable: boolean };

export type ExplanationFieldsFragment = { readonly __typename: 'ExplanationSuccess', readonly schemaVersion: string, readonly requestId: string, readonly scenarioId: ScenarioId, readonly contentVersion: string, readonly audience: Audience, readonly sourceMode: SourceMode, readonly status: ResponseStatus, readonly interpretation: Interpretation, readonly limitations: ReadonlyArray<string>, readonly headline: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }, readonly points: ReadonlyArray<{ readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }>, readonly recap: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> } };

export type ScenarioFieldsFragment = { readonly __typename: 'Scenario', readonly schemaVersion: string, readonly contentVersion: string, readonly id: ScenarioId, readonly synthetic: boolean, readonly label: string, readonly originalDecision: OriginalDecision, readonly suppliedReviewOutcome: ReviewOutcome | null, readonly interpretation: Interpretation, readonly match: { readonly homeTeam: string, readonly awayTeam: string, readonly incidentMinute: number, readonly scoreBefore: { readonly home: number, readonly away: number } }, readonly scoreAfterReview: { readonly home: number, readonly away: number } | null, readonly facts: ReadonlyArray<{ readonly id: string, readonly key: FactKey, readonly status: EvidenceStatus, readonly sourceLabel: string, readonly value:
      | { readonly __typename: 'BooleanFactValue', readonly boolean: boolean }
      | { readonly __typename: 'PositionFactValue', readonly position: ReceiverPosition }
      | { readonly __typename: 'InvolvementFactValue', readonly involvement: ActiveInvolvement }
      | { readonly __typename: 'PlayTypeFactValue', readonly playType: PlayType }
     | null }>, readonly rules: ReadonlyArray<{ readonly id: string, readonly title: string, readonly section: string, readonly publisher: string, readonly url: string, readonly edition: string | null, readonly checkedOn: string | null, readonly reviewStatus: ReviewStatus, readonly summary: string }>, readonly events: ReadonlyArray<{ readonly id: string, readonly offsetMs: number, readonly kind: EventKind, readonly label: string, readonly revealFactIds: ReadonlyArray<string> }>, readonly diagram: { readonly status: DiagramStatus, readonly direction: AttackDirection, readonly secondLastReferenceX: number | null, readonly textAlternative: string, readonly markers: ReadonlyArray<{ readonly id: string, readonly role: MarkerRole, readonly label: string, readonly x: number, readonly y: number }> }, readonly comparison: { readonly pairId: string, readonly otherScenarioId: ScenarioId, readonly changedFactKey: FactKey } | null, readonly authoredExplanations: { readonly casual: { readonly sourceMode: SourceMode, readonly status: ResponseStatus, readonly interpretation: Interpretation, readonly limitations: ReadonlyArray<string>, readonly headline: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }, readonly points: ReadonlyArray<{ readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }>, readonly recap: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> } }, readonly analyst: { readonly sourceMode: SourceMode, readonly status: ResponseStatus, readonly interpretation: Interpretation, readonly limitations: ReadonlyArray<string>, readonly headline: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }, readonly points: ReadonlyArray<{ readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }>, readonly recap: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> } } } };

export type ScenariosQueryVariables = Exact<{ [key: string]: never; }>;


export type ScenariosQuery = { readonly scenarios: ReadonlyArray<{ readonly id: ScenarioId, readonly contentVersion: string, readonly synthetic: boolean, readonly label: string }> };

export type ScenarioQueryVariables = Exact<{
  id: string;
  requestId: string;
}>;


export type ScenarioQuery = { readonly scenario:
    | { readonly __typename: 'Scenario', readonly schemaVersion: string, readonly contentVersion: string, readonly id: ScenarioId, readonly synthetic: boolean, readonly label: string, readonly originalDecision: OriginalDecision, readonly suppliedReviewOutcome: ReviewOutcome | null, readonly interpretation: Interpretation, readonly match: { readonly homeTeam: string, readonly awayTeam: string, readonly incidentMinute: number, readonly scoreBefore: { readonly home: number, readonly away: number } }, readonly scoreAfterReview: { readonly home: number, readonly away: number } | null, readonly facts: ReadonlyArray<{ readonly id: string, readonly key: FactKey, readonly status: EvidenceStatus, readonly sourceLabel: string, readonly value:
          | { readonly __typename: 'BooleanFactValue', readonly boolean: boolean }
          | { readonly __typename: 'PositionFactValue', readonly position: ReceiverPosition }
          | { readonly __typename: 'InvolvementFactValue', readonly involvement: ActiveInvolvement }
          | { readonly __typename: 'PlayTypeFactValue', readonly playType: PlayType }
         | null }>, readonly rules: ReadonlyArray<{ readonly id: string, readonly title: string, readonly section: string, readonly publisher: string, readonly url: string, readonly edition: string | null, readonly checkedOn: string | null, readonly reviewStatus: ReviewStatus, readonly summary: string }>, readonly events: ReadonlyArray<{ readonly id: string, readonly offsetMs: number, readonly kind: EventKind, readonly label: string, readonly revealFactIds: ReadonlyArray<string> }>, readonly diagram: { readonly status: DiagramStatus, readonly direction: AttackDirection, readonly secondLastReferenceX: number | null, readonly textAlternative: string, readonly markers: ReadonlyArray<{ readonly id: string, readonly role: MarkerRole, readonly label: string, readonly x: number, readonly y: number }> }, readonly comparison: { readonly pairId: string, readonly otherScenarioId: ScenarioId, readonly changedFactKey: FactKey } | null, readonly authoredExplanations: { readonly casual: { readonly sourceMode: SourceMode, readonly status: ResponseStatus, readonly interpretation: Interpretation, readonly limitations: ReadonlyArray<string>, readonly headline: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }, readonly points: ReadonlyArray<{ readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }>, readonly recap: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> } }, readonly analyst: { readonly sourceMode: SourceMode, readonly status: ResponseStatus, readonly interpretation: Interpretation, readonly limitations: ReadonlyArray<string>, readonly headline: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }, readonly points: ReadonlyArray<{ readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }>, readonly recap: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> } } } }
    | { readonly __typename: 'ContractError', readonly schemaVersion: string, readonly requestId: string, readonly status: ResponseStatus, readonly code: ErrorCode, readonly message: string, readonly retryable: boolean }
   };

export type ExplainMutationVariables = Exact<{
  input: ExplanationRequestInput;
}>;


export type ExplainMutation = { readonly explain:
    | { readonly __typename: 'ExplanationSuccess', readonly schemaVersion: string, readonly requestId: string, readonly scenarioId: ScenarioId, readonly contentVersion: string, readonly audience: Audience, readonly sourceMode: SourceMode, readonly status: ResponseStatus, readonly interpretation: Interpretation, readonly limitations: ReadonlyArray<string>, readonly headline: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }, readonly points: ReadonlyArray<{ readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> }>, readonly recap: { readonly id: string, readonly text: string, readonly evidenceIds: ReadonlyArray<string>, readonly ruleIds: ReadonlyArray<string> } }
    | { readonly __typename: 'ContractError', readonly schemaVersion: string, readonly requestId: string, readonly status: ResponseStatus, readonly code: ErrorCode, readonly message: string, readonly retryable: boolean }
   };
