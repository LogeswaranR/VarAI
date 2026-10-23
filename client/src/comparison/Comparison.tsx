import type { ComparisonInput } from '../contracts/interfaces'
import type { ScenarioFieldsFragment } from '../contracts/graphql.generated'
import { assertScenario } from '../contracts/validation'
import { UI_HOOKS } from '../contracts/ui-hooks'
import './comparison.css'

function sameRecord(first: object, second: object): boolean {
  return Object.entries(first).length === Object.entries(second).length &&
    Object.entries(first).every(([key, value]) => Object.entries(second).some(([otherKey, otherValue]) =>
      key === otherKey && (value !== null && otherValue !== null && typeof value === 'object' && typeof otherValue === 'object'
        ? sameRecord(value, otherValue) : value === otherValue)))
}

function approvedPair(pair: ComparisonInput['pair']) {
  try {
    const first = pair.find(scenario => scenario.id === 'S1')
    const second = pair.find(scenario => scenario.id === 'S2')
    if (pair.length !== 2 || !first || !second) return false
    assertScenario(first)
    assertScenario(second)
    return first.contentVersion === second.contentVersion && sameRecord(first.match, second.match) &&
      first.rules.length === second.rules.length && first.rules.every(rule =>
        second.rules.some(other => sameRecord(rule, other))) &&
      first.facts.every(fact => {
        const other = second.facts.find(item => item.key === fact.key)
        return other && (fact.key === 'RECEIVER_VS_SECOND_LAST' ||
          (fact.status === other.status && (fact.value === null ? other.value === null
            : other.value !== null && sameRecord(fact.value, other.value))))
      })
  } catch {
    return false
  }
}

function outcome(scenario: ScenarioFieldsFragment) {
  return scenario.suppliedReviewOutcome === 'GOAL_CONFIRMED' ? 'Goal confirmed' : 'Goal disallowed'
}

export function Comparison({ scenarioId, reviewReady, pair, selectScenario }: ComparisonInput) {
  let unavailable: string | null = null
  if (scenarioId === 'S3') unavailable = 'S3 has no comparison: missing position evidence cannot support the offered S1/S2 comparison.'
  else if (!reviewReady) unavailable = 'Complete the replay to reveal the curated comparison.'
  else if (!approvedPair(pair)) unavailable = 'Comparison unavailable: only the validated S1/S2 pair with one independent changed fact is supported.'

  return (
    <div className="comparison" data-testid={UI_HOOKS.comparisonPanel}>
      <p><strong>Curated hypothetical</strong> · not an edited match record or an official decision.</p>
      {unavailable ? <p data-testid={UI_HOOKS.comparisonUnavailable}>{unavailable}</p> : <>
        <h3>One independent fact changes</h3>
        <p>Receiver versus second-last opponent at the pass: nearer in S1, level in S2.
          All other independent football facts stay the same.</p>
        <div className="comparison-variants">
          {[...pair].sort((a, b) => a.id.localeCompare(b.id)).map(scenario => <section key={scenario.id}
            aria-label={`${scenario.id} comparison variant`} className={scenarioId === scenario.id ? 'comparison-current' : undefined}>
            <h3>{scenario.id}{scenarioId === scenario.id ? ' · selected' : ''}</h3>
            <p><strong>Independent fact:</strong> {scenario.id === 'S1' ? 'Nearer' : 'Level'}</p>
            <p><strong>Supplied derived outcome:</strong> {outcome(scenario)}</p>
            <p>Supplied after-score: {scenario.scoreAfterReview!.home} – {scenario.scoreAfterReview!.away}</p>
          </section>)}
        </div>
        <p>Outcome, after-score, explanation wording and marker layout are derived differences, not extra edited evidence.
          Switching restarts the replay and clears the explanation and recap.</p>
        <button type="button" data-testid={UI_HOOKS.comparisonToggle}
          onClick={() => selectScenario(scenarioId === 'S1' ? 'S2' : 'S1')}>
          {scenarioId === 'S1' ? 'Try S2 · level position' : 'Restore S1 · nearer position'}
        </button>
      </>}
    </div>
  )
}
