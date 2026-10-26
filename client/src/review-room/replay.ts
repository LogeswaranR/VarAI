import type { FactKey, ScenarioFieldsFragment } from '../contracts/graphql.generated'
import type { ContextEvidenceEntry, EvidenceExplorerInput, SceneInput, SourceSelection } from '../contracts/interfaces'

export interface ReplayState {
  readonly replayRunId: number
  readonly status: 'ready' | 'playing' | 'paused' | 'complete'
  readonly elapsedMs: number
  readonly eventCount: number
}

export function freshReplay(replayRunId: number): ReplayState {
  return { replayRunId, status: 'ready', elapsedMs: 0, eventCount: 0 }
}

const positionKeys: readonly FactKey[] = [
  'PASS_TIME_OBSERVED', 'RECEIVER_IN_OPPONENTS_HALF', 'RECEIVER_AHEAD_OF_BALL', 'RECEIVER_VS_SECOND_LAST',
]

export function projectReplay(
  scenario: ScenarioFieldsFragment, replay: ReplayState, selection: SourceSelection | null,
): {
  readonly events: ScenarioFieldsFragment['events']
  readonly scene: SceneInput
  readonly evidence: EvidenceExplorerInput
  readonly reviewReady: boolean
  readonly illustrationRevealed: boolean
} {
  const events = scenario.events.slice(0, replay.eventCount)
  const visibleIds = new Set(events.flatMap(event => event.revealFactIds))
  const visibleFacts = scenario.facts.filter(fact => visibleIds.has(fact.id))
  const reviewReady = events.some(event => event.kind === 'REVIEW_READY')
  const illustrationRevealed = events.some(event => event.kind === 'PASS') &&
    positionKeys.every(key => visibleFacts.some(fact => fact.key === key))
  const diagram: SceneInput['diagram'] = illustrationRevealed ? scenario.diagram : {
    status: 'UNAVAILABLE',
    direction: 'LEFT_TO_RIGHT',
    markers: [],
    secondLastReferenceX: null,
    textAlternative: 'Not yet revealed: the pass-time illustration is withheld until its position facts are released.',
  }
  const sourceLabel = 'Supplied synthetic scenario context; not live match evidence'
  const contextEvidence: ContextEvidenceEntry[] = [{
    id: 'MATCH-SCORE-BEFORE', label: 'Supplied score before', sourceLabel,
    value: scenario.match.scoreBefore, status: 'SUPPLIED',
  }]
  if (events.some(event => event.kind === 'GOAL')) {
    contextEvidence.push({
      id: 'DECISION-ORIGINAL', label: 'Supplied original decision', sourceLabel,
      value: scenario.originalDecision, status: 'SUPPLIED',
    })
  }
  if (reviewReady) {
    contextEvidence.push(scenario.suppliedReviewOutcome === null
      ? { id: 'DECISION-REVIEW', label: 'Review outcome unavailable', sourceLabel, value: null, status: 'MISSING' }
      : { id: 'DECISION-REVIEW', label: 'Supplied review outcome', sourceLabel, value: scenario.suppliedReviewOutcome, status: 'SUPPLIED' })
    contextEvidence.push(scenario.scoreAfterReview === null
      ? { id: 'MATCH-SCORE-AFTER', label: 'After-review score unavailable', sourceLabel, value: null, status: 'MISSING' }
      : { id: 'MATCH-SCORE-AFTER', label: 'Supplied score after review', sourceLabel, value: scenario.scoreAfterReview, status: 'SUPPLIED' })
  }
  return {
    events, reviewReady, illustrationRevealed,
    scene: { diagram, visibleFacts, reviewReady },
    evidence: { visibleFacts, contextEvidence, rules: scenario.rules, selection },
  }
}
