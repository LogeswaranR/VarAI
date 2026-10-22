import { scenarioResponses } from '../../../tests/contract-stubs/responses.generated'
import type { ScenarioFieldsFragment, ScenarioId } from '../contracts/graphql.generated'
import type { ContextEvidenceEntry, EvidenceExplorerInput, ReviewContext, SceneInput, SourceSelection } from '../contracts/interfaces'
import { readScenarioResult } from '../contracts/validation'
import type { HarnessSlots } from './FeatureHarness'
import { ComparisonProbe, EvidenceProbe, ExplanationProbe, ReviewRoomProbe, SceneProbe } from './probes'

export const stages = ['before-pass', 'pass', 'goal', 'review-ready'] as const
export type HarnessStage = typeof stages[number]
export const frontendPackages = ['VAR-102', 'VAR-103', 'VAR-104', 'VAR-106', 'VAR-107'] as const
export type FrontendPackage = typeof frontendPackages[number]

export function probeSlots(id: FrontendPackage | 'none'): Partial<HarnessSlots> {
  switch (id) {
    case 'none': return {}
    case 'VAR-102': return { reviewRoom: ReviewRoomProbe }
    case 'VAR-103': return { scene: SceneProbe }
    case 'VAR-104': return { evidence: EvidenceProbe }
    case 'VAR-106': return { explanation: ExplanationProbe }
    case 'VAR-107': return { comparison: ComparisonProbe }
  }
}

export function fixture(id: ScenarioId): ScenarioFieldsFragment {
  const entry = scenarioResponses.find(item => item.data.scenario.id === id)
  if (!entry) throw new Error(`Missing fixture ${id}.`)
  const result = readScenarioResult(structuredClone(entry), id, `harness-${id}`)
  if (result.__typename !== 'Scenario') throw new Error(`Invalid fixture ${id}.`)
  return result
}

export function snapshot(
  scenario: ScenarioFieldsFragment, stage: HarnessStage, replayRunId: number, selection: SourceSelection | null,
): { context: ReviewContext; scene: SceneInput; evidence: EvidenceExplorerInput } {
  const lastEvent = stage === 'before-pass' ? -1 : scenario.events.findIndex(event =>
    event.kind === (stage === 'pass' ? 'PASS' : stage === 'goal' ? 'GOAL' : 'REVIEW_READY'))
  if (stage !== 'before-pass' && lastEvent < 0) throw new Error('The fixture is missing the selected stage.')
  const visibleFactIds = [...new Set(scenario.events.slice(0, lastEvent + 1).flatMap(event => event.revealFactIds))]
  const visibleFacts = scenario.facts.filter(fact => visibleFactIds.includes(fact.id))
  const reviewReady = stage === 'review-ready'
  const sourceLabel = 'Synthetic T03 harness context, not live evidence'
  const contextEvidence: ContextEvidenceEntry[] = [
    { id: 'MATCH-SCORE-BEFORE', label: 'Supplied score before', sourceLabel, value: scenario.match.scoreBefore, status: 'SUPPLIED' },
  ]
  if (stage === 'goal' || reviewReady) {
    contextEvidence.push({ id: 'DECISION-ORIGINAL', label: 'Supplied original decision', sourceLabel, value: scenario.originalDecision, status: 'SUPPLIED' })
  }
  if (reviewReady) {
    contextEvidence.push(scenario.suppliedReviewOutcome === null
      ? { id: 'DECISION-REVIEW', label: 'Review outcome unavailable', sourceLabel, value: null, status: 'MISSING' }
      : { id: 'DECISION-REVIEW', label: 'Supplied review outcome', sourceLabel, value: scenario.suppliedReviewOutcome, status: 'SUPPLIED' })
    contextEvidence.push(scenario.scoreAfterReview === null
      ? { id: 'MATCH-SCORE-AFTER', label: 'After-review score unavailable', sourceLabel, value: null, status: 'MISSING' }
      : { id: 'MATCH-SCORE-AFTER', label: 'Supplied after-review score', sourceLabel, value: scenario.scoreAfterReview, status: 'SUPPLIED' })
  }
  const diagram: SceneInput['diagram'] = stage === 'before-pass'
    ? { status: 'UNAVAILABLE', direction: 'LEFT_TO_RIGHT', markers: [], secondLastReferenceX: null, textAlternative: 'Fixture snapshot is not revealed at this stage.' }
    : scenario.diagram
  return {
    context: { scenario, replayRunId, visibleFactIds, reviewReady },
    scene: { diagram, visibleFacts, reviewReady },
    evidence: { visibleFacts, contextEvidence, rules: scenario.rules, selection },
  }
}
