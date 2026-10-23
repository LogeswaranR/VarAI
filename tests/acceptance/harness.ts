import { isDeepStrictEqual } from 'node:util'
import type {
  Audience, ExplainMutation, ExplainMutationVariables, ScenarioFieldsFragment, ScenarioId, SourceMode,
} from '../../client/src/contracts/graphql.generated'
import {
  ContractResponseError, readExplanationResult, readScenarioResult, readScenarios, wordCount,
} from '../../client/src/contracts/validation'
import { rules } from '../../client/src/contracts/rules.generated'
import { audiences, checks, modes } from './model'
import type { AcceptanceAdapter, AcceptanceReport, CheckResult, CheckSpec, Collaborators, Evidence, Target } from './model'
import { countsFor, evidenceLabel, outcomeFor, unexecutedScopes, validateReport } from './report'

class CheckFailure extends Error {}
class Unavailable extends Error {
  readonly status: 'BLOCKED' | 'SKIPPED'
  constructor(status: 'BLOCKED' | 'SKIPPED', message: string) {
    super(message)
    this.status = status
  }
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new CheckFailure(message)
}

async function load(adapter: Collaborators, id: ScenarioId): Promise<ScenarioFieldsFragment> {
  const requestId = crypto.randomUUID()
  const result = readScenarioResult({ data: { scenario: await adapter.repository.get(id, requestId) } }, id, requestId)
  check(result.__typename === 'Scenario', 'Expected an available scenario, not an error.')
  return result
}

async function explain(adapter: Collaborators, scenario: ScenarioFieldsFragment, audience: Audience, mode: SourceMode) {
  const request: ExplainMutationVariables['input'] = {
    schemaVersion: rules.schemaVersion, requestId: crypto.randomUUID(), scenarioId: scenario.id,
    contentVersion: scenario.contentVersion, audience, sourceMode: mode,
  }
  const output = await adapter.client.explain(request)
  return readExplanationResult({ data: { explain: output } }, request, scenario)
}

type Success = Extract<ExplainMutation['explain'], { __typename: 'ExplanationSuccess' }>
function success(value: ExplainMutation['explain']): asserts value is Success {
  check(value.__typename === 'ExplanationSuccess', 'Expected a successful explanation, not a typed failure.')
}

function requireLive(adapter: AcceptanceAdapter, target: Target, allowLive: boolean) {
  if (target === 'real-application' && !allowLive) throw new Unavailable('SKIPPED', 'Real LIVE_AI execution was not explicitly authorized for this run.')
  if (!adapter.live.available) throw new Unavailable('BLOCKED', adapter.live.reason)
}

function observations(scenario: ScenarioFieldsFragment, response: Success): Evidence {
  return {
    scenario: scenario.id, audience: response.audience, mode: response.sourceMode,
    status: response.status, interpretation: response.interpretation,
    originalDecision: scenario.originalDecision, suppliedReviewOutcome: scenario.suppliedReviewOutcome,
    scoreAfter: scenario.scoreAfterReview === null ? null : `${scenario.scoreAfterReview.home}-${scenario.scoreAfterReview.away}`,
    claimCount: 2 + response.points.length,
    explanationWords: wordCount(response.headline.text) + response.points.reduce((total, point) => total + wordCount(point.text), 0),
    recapWords: wordCount(response.recap.text),
    sourceReviewStatuses: [...new Set(scenario.rules.map(rule => rule.reviewStatus))],
    semanticReview: 'NOT_RUN',
  }
}

async function execute(spec: CheckSpec, adapter: AcceptanceAdapter, target: Target, allowLive: boolean): Promise<Evidence> {
  if (spec.kind === 'matrix') {
    if (spec.mode === 'LIVE_AI') requireLive(adapter, target, allowLive)
    const summaries = readScenarios({ data: { scenarios: await adapter.repository.list() } })
    check(JSON.stringify(summaries.map(item => item.id).sort()) === JSON.stringify(['S1', 'S2', 'S3']), 'The scenario catalog must contain exactly S1/S2/S3.')
    const scenario = await load(adapter, spec.scenario!)
    const response = await explain(adapter, scenario, spec.audience!, spec.mode!)
    success(response)
    if (target === 'contract-stub' && spec.mode === 'LIVE_AI') {
      check(response.limitations.some(text => text.includes('SIMULATED LIVE-AI TEST STUB')), 'Simulated live output lost its explicit test-stub provenance.')
    }
    return observations(scenario, response)
  }
  if (spec.kind === 'injected-failure') {
    if (!adapter.failureClient) throw new Unavailable('BLOCKED', 'No explicit fault-injection adapter was supplied; no real provider failure is inferred.')
    const scenario = await load(adapter, 'S1')
    const response = await explain({ ...adapter, client: adapter.failureClient(spec.error!) }, scenario, 'CASUAL', 'LIVE_AI')
    check(response.__typename === 'ContractError' && response.code === spec.error, 'Injected failure became success or the wrong error.')
    check(!Object.hasOwn(response, 'headline') && !Object.hasOwn(response, 'recap'), 'An error must not carry a success-shaped fallback.')
    return { code: response.code, retryable: response.retryable, successFallback: false, injection: 'explicit; not an observed provider incident' }
  }
  if (spec.kind === 'missing-evidence') {
    const scenario = await load(adapter, 'S3')
    const response = await explain(adapter, scenario, 'CASUAL', 'AUTHORED')
    success(response)
    const missing = scenario.facts.filter(fact => fact.status === 'MISSING')
    check(missing.length === 2 && missing.every(fact => fact.value === null), 'Missing decisive evidence must stay explicitly null.')
    check(scenario.suppliedReviewOutcome === null && scenario.scoreAfterReview === null &&
      scenario.diagram.status === 'UNAVAILABLE' && scenario.diagram.markers.length === 0 &&
      response.interpretation === 'INSUFFICIENT_EVIDENCE' && response.status === 'LIMITED', 'Missing evidence was converted into a definitive result.')
    return { ...observations(scenario, response), missingFactIds: missing.map(fact => fact.id), inventedOutcome: false }
  }
  if (spec.kind === 'comparison') {
    const first = await load(adapter, 'S1')
    const second = await load(adapter, 'S2')
    const missing = await load(adapter, 'S3')
    const differences = first.facts.filter(fact => {
      const other = second.facts.find(item => item.key === fact.key)
      return !isDeepStrictEqual({ value: fact.value, status: fact.status }, { value: other?.value, status: other?.status })
    }).map(fact => fact.key)
    check(JSON.stringify(differences) === JSON.stringify(['RECEIVER_VS_SECOND_LAST']), 'The curated pair changes more than the permitted independent fact.')
    check(first.contentVersion === second.contentVersion && isDeepStrictEqual(first.match, second.match) &&
      isDeepStrictEqual(first.rules.toSorted((a, b) => a.id.localeCompare(b.id)), second.rules.toSorted((a, b) => a.id.localeCompare(b.id))),
    'Pair versions, match context or rule sources differ.')
    check(missing.comparison === null, 'S3 must not expose a comparison.')
    return { pair: first.comparison!.pairId, changedFacts: differences, comparisonAvailableForS3: missing.comparison !== null }
  }
  const original = await load(adapter, spec.scenario!)
  requireLive(adapter, target, allowLive)
  let selected: Collaborators = adapter
  let scenario = original
  if (spec.kind === 'team-labels') {
    if (!adapter.withTeamLabels) throw new Unavailable('BLOCKED', 'No isolated team-label injection adapter was supplied; generated request inputs do not accept arbitrary scenario data.')
    selected = await adapter.withTeamLabels(original.id, { homeTeam: original.match.awayTeam, awayTeam: original.match.homeTeam })
    scenario = await load(selected, original.id)
    check(scenario.match.homeTeam === original.match.awayTeam && scenario.match.awayTeam === original.match.homeTeam &&
      scenario.match.homeTeam !== scenario.match.awayTeam, 'The adapter did not actually swap distinct team labels.')
    check(isDeepStrictEqual({ ...scenario.match, homeTeam: '', awayTeam: '' }, { ...original.match, homeTeam: '', awayTeam: '' }) &&
      isDeepStrictEqual(scenario.facts.toSorted((a, b) => a.id.localeCompare(b.id)), original.facts.toSorted((a, b) => a.id.localeCompare(b.id))) &&
      isDeepStrictEqual(scenario.rules.toSorted((a, b) => a.id.localeCompare(b.id)), original.rules.toSorted((a, b) => a.id.localeCompare(b.id))) &&
      scenario.originalDecision === original.originalDecision && scenario.suppliedReviewOutcome === original.suppliedReviewOutcome &&
      isDeepStrictEqual(scenario.scoreAfterReview, original.scoreAfterReview), 'Team-label injection changed evidence, sources or supplied consequences.')
  }
  const interpretations: string[] = []
  for (const audience of audiences) for (const mode of modes) {
    const response = await explain(selected, scenario, audience, mode)
    success(response)
    check(response.interpretation === original.interpretation, 'Structured interpretation changed with audience or team labels.')
    interpretations.push(response.interpretation)
  }
  return {
    scenario: scenario.id, combinations: interpretations.length, interpretations,
    teamLabelsSwapped: spec.kind === 'team-labels',
    semanticReview: 'NOT_RUN',
    limitation: target === 'contract-stub' ? 'Fixture invariance only; no provider reasoning or prose invariance demonstrated.' : 'Structured adapter result only; prose requires human review.',
  }
}

export async function runAcceptance(options: {
  target: Target
  adapter?: AcceptanceAdapter
  allowLive?: boolean
  startupFailure?: string
}): Promise<AcceptanceReport> {
  const startedAt = new Date().toISOString()
  const results: CheckResult[] = []
  for (const spec of checks) {
    const result: CheckResult = {
      id: spec.id, requirements: spec.requirements, expected: spec.expected, kind: spec.kind,
      status: 'NOT_RUN', reason: 'Not executed yet.', observed: {},
    }
    try {
      if (options.startupFailure) throw new CheckFailure(options.startupFailure)
      const adapter = options.adapter
      if (!adapter) throw new Unavailable('BLOCKED', 'No explicit application adapter supplied. G00 has no integrated /graphql endpoint; fixtures are never substituted.')
      check(adapter.kind === options.target && typeof adapter.name === 'string' && adapter.name.trim().length > 0,
        'Adapter identity does not match the explicitly selected execution target.')
      if (!adapter.application.available) throw new Unavailable('BLOCKED', adapter.application.reason)
      result.observed = await execute(spec, adapter, options.target, options.allowLive === true)
      result.status = 'PASS'
      result.reason = null
    } catch (error) {
      result.status = error instanceof Unavailable ? error.status : 'FAIL'
      result.reason = error instanceof Unavailable || error instanceof CheckFailure || error instanceof ContractResponseError
        ? error.message : 'Adapter/check threw an error. Inspect it locally; raw exceptions are withheld to avoid disclosing credentials or provider content.'
    }
    results.push(result)
  }
  const counts = countsFor(results)
  const report: AcceptanceReport = {
    schemaVersion: 'var108.acceptance/1', runId: crypto.randomUUID(), startedAt, finishedAt: new Date().toISOString(),
    target: options.target, adapter: typeof options.adapter?.name === 'string' && options.adapter.name.trim() ? options.adapter.name : null,
    scope: 'contract-data-and-injected-faults',
    evidenceLabel: evidenceLabel(options.target), results, counts, outcome: outcomeFor(counts),
    productAcceptance: 'NOT_ESTABLISHED', unexecuted: unexecutedScopes(options.target),
  }
  validateReport(report)
  return report
}
