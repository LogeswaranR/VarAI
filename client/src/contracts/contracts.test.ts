import { describe, expect, it } from 'vitest'
import invalidScenarios from '../../../tests/contract-stubs/invalid-scenarios.json'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../../../tests/contract-stubs/client'
import { errorCases, explanationCases, scenarioResponses, summaryResponse } from '../../../tests/contract-stubs/responses.generated'
import { isRecord } from './response-shape'
import {
  assertBody, assertScenario, ContractResponseError, readExplanationResult, readScenarioResult, readScenarios, wordCount,
} from './validation'

function scenario(id: string) {
  const fixture = scenarioResponses.find(item => item.data.scenario.id === id)
  if (!fixture) throw new Error(`Missing test scenario ${id}`)
  const result = readScenarioResult(structuredClone(fixture), id, `query-${id}`)
  if (result.__typename !== 'Scenario') throw new Error('Expected a scenario fixture.')
  return result
}

function change(root: unknown, path: string, operation: string, value: unknown) {
  const segments = path.split('/').slice(1)
  let parent = root
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[Number(segment)]
    else if (isRecord(parent)) parent = parent[segment]
    else throw new Error(`Invalid test mutation path ${path}`)
  }
  const key = segments.at(-1)
  if (!key) throw new Error('Missing test mutation key.')
  if (Array.isArray(parent)) {
    if (operation === 'remove') parent.splice(Number(key), 1)
    else parent[Number(key)] = value
  } else if (isRecord(parent)) {
    if (operation === 'remove') delete parent[key]
    else parent[key] = value
  } else throw new Error(`Invalid test mutation target ${path}`)
}

describe('shared scenario contract', () => {
  it('accepts the three generated GraphQL scenarios and summaries', () => {
    expect(readScenarios(summaryResponse).map(item => item.id)).toEqual(['S1', 'S2', 'S3'])
    for (const id of ['S1', 'S2', 'S3']) {
      const value = scenario(id)
      expect(value.synthetic).toBe(true)
      expect(value.rules.every(rule => rule.reviewStatus === 'DRAFT' && rule.edition === '2026/27' && rule.checkedOn === null)).toBe(true)
    }
    const missing = scenario('S3')
    expect(missing.suppliedReviewOutcome).toBeNull()
    expect(missing.scoreAfterReview).toBeNull()
    expect(missing.facts.filter(fact => fact.status === 'MISSING').map(fact => fact.value)).toEqual([null, null])
  })

  it.each(invalidScenarios)('rejects shared negative case: $name', testCase => {
    const record = structuredClone(scenario(testCase.scenarioId))
    change(record, testCase.path, testCase.operation, testCase.value)
    expect(() => readScenarioResult({ data: { scenario: record } }, testCase.scenarioId, 'query-negative'))
      .toThrow(ContractResponseError)
  })

  it('does not infer football facts from team labels or illustration coordinates', () => {
    const original = scenario('S1')
    const changed = {
      ...original,
      match: { ...original.match, homeTeam: 'Another Synthetic Team' },
      diagram: { ...original.diagram, markers: original.diagram.markers.map(marker => ({ ...marker, x: 1, y: 99 })) },
    }
    assertScenario(changed)
    expect(changed.interpretation).toBe(original.interpretation)
  })

  it('allows additional ordered events without moving review readiness earlier', () => {
    const original = scenario('S1')
    const events = [...original.events]
    events.splice(3, 0, { ...original.events[2], id: 'E-SECOND-SHOT', offsetMs: 2500 })
    assertScenario({ ...original, events })
  })
})

describe('explanation contract', () => {
  it('covers exactly the 3 x 2 x 2 matrix with explicit stub provenance', () => {
    expect(explanationCases).toHaveLength(12)
    const combinations = new Set(explanationCases.map(item =>
      `${item.request.scenarioId}/${item.request.audience}/${item.request.sourceMode}`))
    expect(combinations.size).toBe(12)
    for (const item of explanationCases) {
      const result = readExplanationResult(item.response, item.request, scenario(item.request.scenarioId))
      expect(result.__typename).toBe('ExplanationSuccess')
      if (result.__typename !== 'ExplanationSuccess') throw new Error('Unexpected error fixture.')
      expect(result.status).toBe(item.request.scenarioId === 'S3' ? 'LIMITED' : 'COMPLETE')
      expect(result.limitations.some(text => text.startsWith('SIMULATED LIVE-AI'))).toBe(item.request.sourceMode === 'LIVE_AI')
    }
  })

  it('covers all seven errors without an authored fallback', () => {
    expect(errorCases).toHaveLength(7)
    expect(new Set(errorCases.map(item => item.response.data.explain.code)).size).toBe(7)
    for (const item of errorCases) {
      const result = readExplanationResult(item.response, item.request, scenario(item.request.scenarioId))
      expect(result.__typename).toBe('ContractError')
      expect(result).not.toHaveProperty('headline')
    }
  })

  it.each([
    ['schemaVersion', '0.1'],
    ['requestId', 'stale-request'],
    ['scenarioId', 'S2'],
    ['contentVersion', 'stale-version'],
    ['audience', 'ANALYST'],
    ['sourceMode', 'LIVE_AI'],
    ['status', 'LIMITED'],
    ['interpretation', 'NO_OFFSIDE_SUPPORTED'],
  ])('rejects mismatched success metadata %s', (key, value) => {
    const fixture = explanationCases[0]
    const response = structuredClone(fixture.response)
    change(response, `/data/explain/${key}`, 'set', value)
    expect(() => readExplanationResult(response, fixture.request, scenario('S1'))).toThrow(ContractResponseError)
  })

  it('rejects unknown citations and incorrect error retryability', () => {
    const fixture = explanationCases[0]
    const response = structuredClone(fixture.response)
    change(response, '/data/explain/headline/evidenceIds/0', 'set', 'UNKNOWN')
    expect(() => readExplanationResult(response, fixture.request, scenario('S1'))).toThrow(ContractResponseError)
    const error = errorCases[0]
    const wrongRetry = { data: { explain: { ...error.response.data.explain, retryable: true } } }
    expect(() => readExplanationResult(wrongRetry, error.request, scenario('S1'))).toThrow(ContractResponseError)
  })

  it.each(['errors', 'partial', 'missing-null', 'null-data', 'wrong-type', 'omitted-request'])(
    'rejects malformed GraphQL envelopes: %s', fault => {
      const fixture = explanationCases[0]
      let payload: unknown = structuredClone(fixture.response)
      if (fault === 'errors') payload = { ...fixture.response, errors: [{ message: 'Execution failed.' }] }
      if (fault === 'partial') change(payload, '/data/explain/recap', 'remove', undefined)
      if (fault === 'missing-null') change(payload, '/data/explain/headline', 'set', null)
      if (fault === 'null-data') payload = { data: null }
      if (fault === 'wrong-type') change(payload, '/data/explain/points', 'set', 'not a list')
      if (fault === 'omitted-request') change(payload, '/data/explain/requestId', 'remove', undefined)
      expect(() => readExplanationResult(payload, fixture.request, scenario('S1'))).toThrow(ContractResponseError)
    },
  )

  it.each([{ audience: 'CASUAL', limit: 90 }, { audience: 'ANALYST', limit: 220 }] as const)(
    'enforces the exact $limit-word $audience boundary', ({ audience, limit }) => {
      const selected = scenario('S1')
      const original = selected.authoredExplanations.casual
      const body = {
        ...original,
        headline: { ...original.headline, text: Array(limit - 1).fill('word').join(' ') },
        points: [{ ...original.points[0], text: 'word' }],
      }
      expect(() => assertBody(body, selected, audience)).not.toThrow()
      expect(() => assertBody({ ...body, headline: { ...body.headline, text: body.headline.text + ' word' } }, selected, audience))
        .toThrow(ContractResponseError)
    },
  )

  it('enforces the exact recap boundary and Unicode whitespace counting', () => {
    const selected = scenario('S1')
    const original = selected.authoredExplanations.casual
    const body = { ...original, recap: { ...original.recap, text: Array(40).fill('word').join(' ') } }
    expect(() => assertBody(body, selected, 'CASUAL')).not.toThrow()
    expect(() => assertBody({ ...body, recap: { ...body.recap, text: body.recap.text + ' word' } }, selected, 'CASUAL'))
      .toThrow(ContractResponseError)
    expect(wordCount('one\u0085two\u00a0three\tfour\nfive')).toBe(5)
  })
})

describe('injected client/repository stubs', () => {
  it('clones fixture data and preserves per-attempt IDs', async () => {
    const repository = createScenarioRepositoryStub()
    expect(await repository.list()).toHaveLength(3)
    expect(await repository.get('S4', 'missing-request')).toMatchObject({
      __typename: 'ContractError', code: 'SCENARIO_NOT_FOUND', requestId: 'missing-request',
    })
    const client = createExplanationClientStub()
    const request = { ...explanationCases[0].request, requestId: 'new-attempt' }
    const first = await client.explain(request)
    expect(first.requestId).toBe('new-attempt')
    expect(first).not.toBe(explanationCases[0].response.data.explain)
    const second = await client.explain({ ...request, requestId: 'another-attempt' })
    expect(second.requestId).toBe('another-attempt')
    expect(first.requestId).toBe('new-attempt')
  })

  it('supports every injected failure and explicit cancellation', async () => {
    for (const item of errorCases) {
      const result = await createExplanationClientStub(item.response.data.explain.code).explain(item.request)
      expect(result).toMatchObject({ __typename: 'ContractError', code: item.response.data.explain.code })
    }
    const cancellation = new AbortController()
    cancellation.abort()
    await expect(createScenarioRepositoryStub().list(cancellation.signal)).rejects.toThrow()
    await expect(createExplanationClientStub().explain(explanationCases[0].request, cancellation.signal)).rejects.toThrow()
  })

  it('matches server stub behavior for invalid and stale requests', async () => {
    const request = explanationCases[0].request
    const client = createExplanationClientStub()
    expect(await client.explain({ ...request, schemaVersion: '0.1' }))
      .toMatchObject({ __typename: 'ContractError', code: 'INVALID_REQUEST' })
    expect(await client.explain({ ...request, contentVersion: 'different-version' }))
      .toMatchObject({ __typename: 'ContractError', code: 'CONTENT_VERSION_MISMATCH' })
    expect(await client.explain({ ...request, requestId: ' ' }))
      .toMatchObject({ __typename: 'ContractError', code: 'INVALID_REQUEST', requestId: 'stub-invalid-request' })
  })
})
