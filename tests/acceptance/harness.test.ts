import { describe, expect, it } from 'vitest'
import { createContractStubAdapter } from './adapters'
import { runAcceptance } from './harness'
import { exitCode, validateReport } from './report'
import type { AcceptanceReport } from './model'
import type { ExplainMutation } from '../../client/src/contracts/graphql.generated'
import { readExplanationResult } from '../../client/src/contracts/validation'
import { explanationCases, scenarioResponses } from '../contract-stubs/responses.generated'

type Success = Extract<ExplainMutation['explain'], { __typename: 'ExplanationSuccess' }>

async function alteredOutput(alter: (response: Success) => unknown) {
  const adapter = createContractStubAdapter()
  const original = adapter.client
  adapter.client = {
    async explain(request, signal) {
      const result = await original.explain(request, signal)
      return (result.__typename === 'ExplanationSuccess' ? alter(result) : result) as ExplainMutation['explain']
    },
  }
  return runAcceptance({ target: 'contract-stub', adapter })
}

describe('VAR-108 contract acceptance', () => {
  it('executes exactly twelve combinations, seven injected errors and eight invariance/evidence checks', async () => {
    const report = await runAcceptance({ target: 'contract-stub', adapter: createContractStubAdapter() })
    expect(report.counts).toEqual({
      total: 27, PASS: 27, FAIL: 0, BLOCKED: 0, SKIPPED: 0, NOT_RUN: 0, matrix: 12, injectedFailures: 7,
    })
    expect(exitCode(report)).toBe(0)
    expect(report.productAcceptance).toBe('NOT_ESTABLISHED')
    expect(report.unexecuted.every(item => item.status === 'NOT_RUN')).toBe(true)
    expect(() => validateReport(JSON.parse(JSON.stringify(report)))).not.toThrow()
  })

  it.each([
    ['unknown evidence', (response: Success) => ({ ...response, headline: { ...response.headline, evidenceIds: ['UNKNOWN'] } })],
    ['unknown rule', (response: Success) => ({ ...response, headline: { ...response.headline, ruleIds: ['UNKNOWN'] } })],
    ['contradictory interpretation', (response: Success) => ({ ...response, interpretation: 'NO_OFFSIDE_SUPPORTED' })],
    ['stale request ID', (response: Success) => ({ ...response, requestId: 'older-attempt' })],
    ['wrong content version', (response: Success) => ({ ...response, contentVersion: 'unrequested-version' })],
    ['wrong audience', (response: Success) => ({ ...response, audience: 'ANALYST' })],
    ['disguised live fallback', (response: Success) => ({ ...response, sourceMode: 'AUTHORED' })],
    ['missing selected output', (response: Success) => { const invalid: Record<string, unknown> = { ...response }; delete invalid.recap; return invalid }],
    ['malformed output', () => 'not a structured explanation'],
    ['excess explanation words', (response: Success) => ({ ...response, headline: { ...response.headline, text: Array(221).fill('word').join(' ') } })],
    ['excess recap words', (response: Success) => ({ ...response, recap: { ...response.recap, text: Array(41).fill('word').join(' ') } })],
  ] as const)('fails real assertions for a deliberately bad fixture: %s', async (_name, alter) => {
    const report = await alteredOutput(alter)
    expect(report.counts.FAIL).toBeGreaterThan(0)
    expect(report.outcome).toBe('FAIL')
    expect(exitCode(report)).toBe(1)
    expect(report.results.filter(result => result.status === 'FAIL').every(result => Boolean(result.reason))).toBe(true)
  })

  it('rejects GraphQL execution errors even alongside otherwise valid data', () => {
    const fixture = explanationCases[0]
    const scenario = scenarioResponses[0].data.scenario
    expect(() => readExplanationResult({ ...fixture.response, errors: [{ message: 'Execution failed' }] }, fixture.request, scenario)).toThrow()
  })

  it('fails when missing evidence becomes a supplied outcome', async () => {
    const adapter = createContractStubAdapter()
    const repository = adapter.repository
    adapter.repository = {
      list: signal => repository.list(signal),
      async get(id, requestId, signal) {
        const value = await repository.get(id, requestId, signal)
        return value.__typename === 'Scenario' && id === 'S3'
          ? { ...value, suppliedReviewOutcome: 'GOAL_CONFIRMED', scoreAfterReview: { home: 1, away: 0 } }
          : value
      },
    }
    const report = await runAcceptance({ target: 'contract-stub', adapter })
    expect(report.results.find(result => result.id === 'evidence/missing')?.status).toBe('FAIL')
  })

  it('detects a broken team-label adapter instead of comparing the original scenario to itself', async () => {
    const adapter = createContractStubAdapter()
    adapter.withTeamLabels = async () => adapter
    const report = await runAcceptance({ target: 'contract-stub', adapter })
    expect(report.results.filter(result => result.kind === 'team-labels').map(result => result.status)).toEqual(['FAIL', 'FAIL', 'FAIL'])
  })

  it('compares scenario values rather than JSON object-property order', async () => {
    const adapter = createContractStubAdapter()
    const repository = adapter.repository
    adapter.repository = {
      list: signal => repository.list(signal),
      async get(id, requestId, signal) {
        const value = await repository.get(id, requestId, signal)
        if (value.__typename !== 'Scenario' || id !== 'S2') return value
        const { homeTeam, awayTeam, incidentMinute, scoreBefore } = value.match
        return { ...value, match: { scoreBefore, incidentMinute, awayTeam, homeTeam }, facts: value.facts.toReversed() }
      },
    }
    const report = await runAcceptance({ target: 'contract-stub', adapter })
    expect(report.counts.PASS).toBe(27)
    expect(report.counts.FAIL).toBe(0)
  })

  it('does not treat structurally valid unsupported prose as semantically verified', async () => {
    const report = await alteredOutput(response => ({
      ...response,
      headline: { ...response.headline, text: 'An independent tracking system measured the receiver to millimetre precision.' },
    }))
    expect(report.results.filter(result => result.kind === 'matrix').every(result => result.status === 'PASS')).toBe(true)
    expect(report.unexecuted.find(item => item.scope === 'human-semantic-review')?.status).toBe('NOT_RUN')
    expect(report.productAcceptance).toBe('NOT_ESTABLISHED')
  })

  it('blocks missing application access with no implicit fixture fallback', async () => {
    const report = await runAcceptance({ target: 'real-application' })
    expect(report.counts.BLOCKED).toBe(27)
    expect(report.counts.PASS).toBe(0)
    expect(exitCode(report)).toBe(2)
  })

  it('fails if a stub is passed off as the real application', async () => {
    const report = await runAcceptance({ target: 'real-application', adapter: createContractStubAdapter() })
    expect(report.counts.FAIL).toBe(27)
    expect(exitCode(report)).toBe(1)
  })

  it('reports absent live configuration and injection capabilities as incomplete', async () => {
    const adapter = createContractStubAdapter()
    adapter.live = { available: false, reason: 'No live configuration in this synthetic availability test.' }
    delete adapter.failureClient
    delete adapter.withTeamLabels
    const report = await runAcceptance({ target: 'contract-stub', adapter })
    expect(report.counts.BLOCKED).toBe(19)
    expect(report.counts.PASS).toBe(8)
    expect(exitCode(report)).toBe(2)
  })

  it('requires explicit live permission in a simulated G01 adapter self-test', async () => {
    const adapter = { ...createContractStubAdapter(), kind: 'real-application' as const, name: 'availability self-test only; not application evidence' }
    const report = await runAcceptance({ target: 'real-application', adapter })
    expect(report.results.filter(result => result.kind === 'matrix' && result.id.endsWith('LIVE_AI')).map(result => result.status))
      .toEqual(Array(6).fill('SKIPPED'))
    expect(report.outcome).toBe('INCOMPLETE')
    expect(report.productAcceptance).toBe('NOT_ESTABLISHED')
  })
})

describe('VAR-108 report integrity', () => {
  it.each([
    ['invented count', (report: AcceptanceReport) => { report.counts.PASS++ }],
    ['omitted case', (report: AcceptanceReport) => { report.results.pop() }],
    ['duplicate case', (report: AcceptanceReport) => { report.results[1] = report.results[0] }],
    ['missing reason', (report: AcceptanceReport) => { report.results[0].status = 'BLOCKED'; report.results[0].reason = null }],
    ['empty pass evidence', (report: AcceptanceReport) => { report.results[0].observed = {} }],
    ['changed requirement', (report: AcceptanceReport) => { report.results[0].requirements = ['BR-10'] }],
    ['invented product acceptance', (report: AcceptanceReport) => { Object.assign(report, { productAcceptance: 'PASS' }) }],
    ['invented human review', (report: AcceptanceReport) => { Object.assign(report.unexecuted[3], { status: 'PASS' }) }],
    ['false real-app identity', (report: AcceptanceReport) => { report.target = 'real-application' }],
    ['missing adapter identity', (report: AcceptanceReport) => { report.adapter = null }],
    ['extra success field', (report: AcceptanceReport) => { Object.assign(report, { integratedSuccess: true }) }],
    ['invalid observation', (report: AcceptanceReport) => { report.results[0].observed.elapsed = Number.NaN }],
  ] as const)('rejects a manufactured report: %s', async (_name, alter) => {
    const report = structuredClone(await runAcceptance({ target: 'contract-stub', adapter: createContractStubAdapter() }))
    alter(report)
    expect(() => validateReport(report)).toThrow('Invalid acceptance report')
  })
})
