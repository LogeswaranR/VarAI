import type {
  ExplainMutation, ExplainMutationVariables, ScenarioFieldsFragment, ScenarioQuery, ScenariosQuery,
} from './graphql.generated'

export interface ScenarioRepository {
  list(signal?: AbortSignal): Promise<ScenariosQuery['scenarios']>
  get(id: string, requestId: string, signal?: AbortSignal): Promise<ScenarioQuery['scenario']>
}

export interface ExplanationClient {
  explain(request: ExplainMutationVariables['input'], signal?: AbortSignal): Promise<ExplainMutation['explain']>
}

export interface SourceSelection {
  readonly evidenceIds: readonly string[]
  readonly ruleIds: readonly string[]
}

export interface ReviewContext {
  readonly scenario: ScenarioFieldsFragment
  readonly replayRunId: number
  readonly visibleFactIds: readonly string[]
  readonly reviewReady: boolean
}

export interface SceneInput {
  readonly diagram: ScenarioFieldsFragment['diagram']
  readonly visibleFacts: ScenarioFieldsFragment['facts']
  readonly reviewReady: boolean
}

type Supplied<T> = { readonly value: T; readonly status: 'SUPPLIED' }
type MaybeMissing<T> = Supplied<T> | { readonly value: null; readonly status: 'MISSING' }
export type ContextEvidenceEntry = {
  readonly label: string
  readonly sourceLabel: string
} & (
  | ({ readonly id: 'DECISION-ORIGINAL' } & Supplied<ScenarioFieldsFragment['originalDecision']>)
  | ({ readonly id: 'DECISION-REVIEW' } & MaybeMissing<NonNullable<ScenarioFieldsFragment['suppliedReviewOutcome']>>)
  | ({ readonly id: 'MATCH-SCORE-BEFORE' } & Supplied<ScenarioFieldsFragment['match']['scoreBefore']>)
  | ({ readonly id: 'MATCH-SCORE-AFTER' } & MaybeMissing<NonNullable<ScenarioFieldsFragment['scoreAfterReview']>>)
)

export interface EvidenceExplorerInput {
  readonly visibleFacts: ScenarioFieldsFragment['facts']
  readonly contextEvidence: readonly ContextEvidenceEntry[]
  readonly rules: ScenarioFieldsFragment['rules']
  readonly selection: SourceSelection | null
}

export interface ExplanationReaderInput {
  readonly scenarioId: ScenarioFieldsFragment['id']
  readonly contentVersion: string
  readonly replayRunId: number
  readonly reviewReady: boolean
  readonly client: ExplanationClient
  readonly inspectSources: (selection: SourceSelection) => void
}

export interface ComparisonInput {
  readonly scenarioId: ScenarioFieldsFragment['id']
  readonly reviewReady: boolean
  readonly pair: readonly [ScenarioFieldsFragment, ScenarioFieldsFragment]
  readonly selectScenario: (id: 'S1' | 'S2') => void
}
