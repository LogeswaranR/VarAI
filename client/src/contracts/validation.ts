import type {
  Audience, BodyFieldsFragment, ErrorFieldsFragment, ExplainMutation,
  ExplainMutationVariables, ScenarioFieldsFragment, ScenarioQuery, ScenariosQuery,
} from './graphql.generated'
import { isExplainMutation, isScenarioQuery, isScenariosQuery } from './response-shapes.generated'
import { isRecord } from './response-shape'
import { rules } from './rules.generated'

export class ContractResponseError extends Error {
  readonly code = 'INVALID_OUTPUT'
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractResponseError(message)
}

function text(value: string, path: string) {
  requireCondition(wordCount(value) > 0, `${path} must be non-empty text.`)
}

function unique(values: readonly string[], path: string) {
  values.forEach(value => text(value, path))
  requireCondition(new Set(values).size === values.length, `Duplicate ${path}.`)
}

function data(payload: unknown): unknown {
  requireCondition(isRecord(payload) && Object.hasOwn(payload, 'data'), 'Missing GraphQL data.')
  if (Object.hasOwn(payload, 'errors')) {
    requireCondition(Array.isArray(payload.errors) && payload.errors.length === 0,
      'GraphQL execution failed; partial data is not a successful response.')
  }
  requireCondition(payload.data !== null, 'GraphQL data must not be null.')
  return payload.data
}

export function assertError(error: ErrorFieldsFragment, requestId: string) {
  requireCondition(error.schemaVersion === rules.schemaVersion && error.status === 'ERROR',
    'Invalid error envelope.')
  text(error.message, 'error.message')
  text(error.requestId, 'error.requestId')
  requireCondition(error.requestId === requestId || (error.code === 'INVALID_REQUEST' && wordCount(requestId) === 0),
    'Error correlation ID does not match.')
  requireCondition(error.retryable === rules.retryable[error.code], 'Inconsistent error retry policy.')
}

export function wordCount(value: string) {
  return value.split(/\p{White_Space}+/u).filter(part => part.length > 0).length
}

export function assertBody(body: BodyFieldsFragment, scenario: ScenarioFieldsFragment, audience: Audience) {
  requireCondition(body.status === (scenario.id === 'S3' ? 'LIMITED' : 'COMPLETE'),
    'Response status disagrees with available evidence.')
  requireCondition(body.interpretation === scenario.interpretation, 'Interpretation changed.')
  const claims = [body.headline, ...body.points, body.recap]
  unique(claims.map(claim => claim.id), 'claim IDs')
  const factIds = new Set(scenario.facts.map(fact => fact.id))
  const evidenceIds = new Set<string>([...factIds, ...rules.contextEvidenceIds])
  const ruleIds = new Set(scenario.rules.map(rule => rule.id))
  for (const claim of claims) {
    text(claim.text, 'claim.text')
    unique(claim.evidenceIds, 'claim.evidenceIds')
    unique(claim.ruleIds, 'claim.ruleIds')
    requireCondition(claim.evidenceIds.length + claim.ruleIds.length > 0, 'Every claim needs a reference.')
    requireCondition(claim.evidenceIds.every(id => evidenceIds.has(id)) &&
      claim.ruleIds.every(id => ruleIds.has(id)), 'Claim references do not resolve in this scenario.')
    requireCondition(claim.ruleIds.length === 0 || claim.evidenceIds.some(id => factIds.has(id)),
      'Rule-application claims need a fact reference.')
  }
  requireCondition(body.limitations.length > 0, 'Limitations must not be empty.')
  body.limitations.forEach(value => text(value, 'limitation'))
  requireCondition(wordCount(body.headline.text) + body.points.reduce((total, point) => total + wordCount(point.text), 0)
    <= rules.wordLimits[audience], 'Explanation word limit exceeded.')
  requireCondition(wordCount(body.recap.text) <= rules.recapWordLimit, 'Recap word limit exceeded.')
}

export function assertScenario(scenario: ScenarioFieldsFragment) {
  requireCondition(scenario.schemaVersion === rules.schemaVersion && scenario.synthetic, 'Unsupported scenario version or provenance.')
  text(scenario.contentVersion, 'contentVersion')
  text(scenario.label, 'label')
  text(scenario.match.homeTeam, 'match.homeTeam')
  text(scenario.match.awayTeam, 'match.awayTeam')
  requireCondition(scenario.match.incidentMinute >= 0 &&
    scenario.match.scoreBefore.home >= 0 && scenario.match.scoreBefore.away >= 0, 'Invalid match values.')
  requireCondition(scenario.originalDecision === 'GOAL_AWARDED', 'Unsupported original decision.')
  const expectedInterpretation = scenario.id === 'S1' ? 'OFFSIDE_SUPPORTED'
    : scenario.id === 'S2' ? 'NO_OFFSIDE_SUPPORTED' : 'INSUFFICIENT_EVIDENCE'
  requireCondition(scenario.interpretation === expectedInterpretation, 'Invalid scenario interpretation.')
  if (scenario.id === 'S3') {
    requireCondition(scenario.suppliedReviewOutcome === null && scenario.scoreAfterReview === null &&
      scenario.comparison === null, 'Missing evidence must not invent an outcome or comparison.')
  } else {
    const goal = scenario.id === 'S2'
    requireCondition(scenario.suppliedReviewOutcome === (goal ? 'GOAL_CONFIRMED' : 'GOAL_DISALLOWED') &&
      scenario.scoreAfterReview !== null &&
      scenario.scoreAfterReview.home === scenario.match.scoreBefore.home + (goal ? 1 : 0) &&
      scenario.scoreAfterReview.away === scenario.match.scoreBefore.away, 'Invalid supplied outcome or score.')
    requireCondition(scenario.comparison?.pairId === 'PAIR-01' &&
      scenario.comparison.changedFactKey === 'RECEIVER_VS_SECOND_LAST' &&
      scenario.comparison.otherScenarioId === (goal ? 'S1' : 'S2'), 'Invalid comparison boundary.')
  }
  unique(scenario.facts.map(fact => fact.id), 'fact IDs')
  unique(scenario.facts.map(fact => fact.key), 'fact keys')
  const expectations = rules.factExpectations[scenario.id]
  requireCondition(scenario.facts.length === expectations.length, 'Missing or additional facts.')
  for (const expected of expectations) {
    const fact = scenario.facts.find(item => item.key === expected.key)
    requireCondition(fact && fact.status === expected.status, 'Invalid fact availability.')
    requireCondition(!rules.contextEvidenceIds.some(id => id === fact.id), 'Fact ID collides with context evidence.')
    text(fact.sourceLabel, 'fact.sourceLabel')
    const actual = fact.value
    requireCondition(expected.value === null ? actual === null :
      actual !== null && Object.entries(expected.value).every(([key, value]) =>
        Object.entries(actual).some(([actualKey, actualValue]) => actualKey === key && actualValue === value)),
    'Invalid fact value, type or explicit null.')
  }
  requireCondition(scenario.rules.length > 0, 'At least one rule reference is required.')
  unique(scenario.rules.map(rule => rule.id), 'rule IDs')
  for (const rule of scenario.rules) {
    text(rule.title, 'rule.title')
    text(rule.section, 'rule.section')
    text(rule.summary, 'rule.summary')
    requireCondition(rule.publisher === 'IFAB' && URL.canParse(rule.url), 'Invalid rule publisher or URL.')
    const url = new URL(rule.url)
    requireCondition(url.protocol === 'https:' && ['www.theifab.com', 'theifab.com'].includes(url.hostname) &&
      url.username === '' && url.password === '', 'Rule URL must be an HTTPS IFAB primary source.')
    requireCondition(rule.edition === null || rule.edition === rules.ruleEdition, 'Wrong rule edition.')
    if (rule.checkedOn !== null) {
      const parsed = new Date(`${rule.checkedOn}T00:00:00Z`)
      requireCondition(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rule.checkedOn) &&
        !rule.checkedOn.startsWith('0000') && Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === rule.checkedOn, 'Invalid source-check date.')
    }
    requireCondition(rule.reviewStatus === 'DRAFT' || (rule.edition === rules.ruleEdition && rule.checkedOn !== null),
      'Reviewed rules need an edition and source-check date.')
  }
  unique(scenario.events.map(event => event.id), 'event IDs')
  const kinds = scenario.events.map(event => event.kind)
  requireCondition(kinds[0] === 'PASS' && kinds.at(-1) === 'REVIEW_READY' &&
    new Set(kinds).size === rules.eventKinds.length && kinds.filter(kind => kind === 'REVIEW_READY').length === 1 &&
    kinds.every((kind, index) => index === 0 || rules.eventKinds.indexOf(kinds[index - 1]) <= rules.eventKinds.indexOf(kind)),
  'Invalid replay sequence.')
  let previousOffset = -1
  for (const event of scenario.events) {
    text(event.label, 'event.label')
    requireCondition(event.offsetMs > previousOffset, 'Replay offsets must strictly increase from zero or later.')
    previousOffset = event.offsetMs
    unique(event.revealFactIds, 'revealed fact IDs')
    requireCondition(event.revealFactIds.every(id => scenario.facts.some(fact => fact.id === id)), 'Unknown revealed fact.')
  }
  const diagram = scenario.diagram
  text(diagram.textAlternative, 'diagram.textAlternative')
  requireCondition(diagram.direction === 'LEFT_TO_RIGHT', 'Unsupported diagram direction.')
  if (scenario.id === 'S3') {
    requireCondition(diagram.status === 'UNAVAILABLE' && diagram.markers.length === 0 &&
      diagram.secondLastReferenceX === null, 'Missing snapshot cannot supply positions.')
  } else {
    requireCondition(diagram.status === 'ILLUSTRATIVE' && diagram.markers.length > 0 &&
      diagram.secondLastReferenceX !== null && diagram.secondLastReferenceX >= 0 &&
      diagram.secondLastReferenceX <= 100, 'Invalid illustrative snapshot.')
  }
  unique(diagram.markers.map(marker => marker.id), 'marker IDs')
  for (const marker of diagram.markers) {
    text(marker.label, 'marker.label')
    requireCondition(marker.x >= 0 && marker.x <= 100 && marker.y >= 0 && marker.y <= 100, 'Invalid marker coordinates.')
  }
  requireCondition(scenario.authoredExplanations.casual.sourceMode === 'AUTHORED' &&
    scenario.authoredExplanations.analyst.sourceMode === 'AUTHORED', 'Authored provenance changed.')
  assertBody(scenario.authoredExplanations.casual, scenario, 'CASUAL')
  assertBody(scenario.authoredExplanations.analyst, scenario, 'ANALYST')
}

export function readScenarioResult(payload: unknown, id: string, requestId: string): ScenarioQuery['scenario'] {
  const result = data(payload)
  requireCondition(isScenarioQuery(result), 'Malformed or incomplete scenario response.')
  if (result.scenario.__typename === 'ContractError') {
    assertError(result.scenario, requestId)
  } else {
    requireCondition(result.scenario.id === id, 'Scenario does not match the request.')
    assertScenario(result.scenario)
  }
  return result.scenario
}

export function readScenarios(payload: unknown): ScenariosQuery['scenarios'] {
  const result = data(payload)
  requireCondition(isScenariosQuery(result), 'Malformed scenario summaries.')
  unique(result.scenarios.map(scenario => scenario.id), 'scenario IDs')
  for (const scenario of result.scenarios) {
    text(scenario.contentVersion, 'contentVersion')
    text(scenario.label, 'label')
    requireCondition(scenario.synthetic, 'Scenario summaries must be synthetic.')
  }
  return result.scenarios
}

export function readExplanationResult(
  payload: unknown, request: ExplainMutationVariables['input'], scenario: ScenarioFieldsFragment,
): ExplainMutation['explain'] {
  const result = data(payload)
  requireCondition(isExplainMutation(result), 'Malformed or incomplete explanation response.')
  const response = result.explain
  if (response.__typename === 'ContractError') {
    assertError(response, request.requestId)
  } else {
    text(request.requestId, 'requestId')
    text(request.contentVersion, 'contentVersion')
    requireCondition(response.schemaVersion === rules.schemaVersion &&
      response.schemaVersion === request.schemaVersion &&
      response.requestId === request.requestId && response.scenarioId === request.scenarioId &&
      response.contentVersion === request.contentVersion && response.audience === request.audience &&
      response.sourceMode === request.sourceMode, 'Explanation metadata does not match the request.')
    requireCondition(scenario.id === request.scenarioId && scenario.contentVersion === request.contentVersion,
      'Request does not match the loaded scenario version.')
    assertBody(response, scenario, request.audience)
  }
  return response
}
