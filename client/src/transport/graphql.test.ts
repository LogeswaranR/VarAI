import { describe, expect, it, vi } from 'vitest'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../../../tests/contract-stubs/client'
import type { ExplainMutationVariables } from '../contracts/graphql.generated'
import { fixture } from '../harness/fixtures'
import { createHttpClients } from './graphql'

const request: ExplainMutationVariables['input'] = {
  schemaVersion: '0.2', scenarioId: 'S1', contentVersion: fixture('S1').contentVersion,
  requestId: ' exact Ünicode request / identity ', audience: 'CASUAL', sourceMode: 'AUTHORED',
}
const json = (data: unknown, mediaType = 'application/graphql-response+json') =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': mediaType } })

describe('G01 fetch adapters using approved operations and runtime validation', () => {
  it('sends only approved operations, preserves request IDs and propagates cancellation', async () => {
    const repository = createScenarioRepositoryStub()
    const stub = createExplanationClientStub()
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(options!.body as string)
      if (body.operationName === 'Scenarios') return json({ data: { scenarios: await repository.list() } })
      if (body.operationName === 'Scenario') return json({ data: { scenario: await repository.get(body.variables.id, body.variables.requestId) } })
      return json({ data: { explain: await stub.explain(body.variables.input) } }, 'application/json; charset=utf-8')
    })
    const clients = createHttpClients('/graphql', fetcher)
    const signal = new AbortController().signal
    expect(await clients.repository.list(signal)).toHaveLength(3)
    expect((await clients.repository.get('S1', request.requestId, signal)).__typename).toBe('Scenario')
    const result = await clients.client.explain(request, signal)
    expect(result.__typename).toBe('ExplanationSuccess')
    expect(result.requestId).toBe(request.requestId)
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBe('/graphql')
      expect(options?.method).toBe('POST')
      expect(options?.signal).toBe(signal)
      expect(options?.redirect).toBe('error')
      expect(JSON.parse(options!.body as string).query).toContain('mutation Explain($input: ExplanationRequestInput!)')
    }
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1]!.body as string).variables).toEqual({ input: request })
  })

  it.each([
    ['HTTP error', () => new Response('Unavailable', { status: 503 })],
    ['HTML', () => new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } })],
    ['missing media type', () => new Response('{}')],
    ['broken JSON', () => new Response('{', { headers: { 'Content-Type': 'application/json' } })],
    ['top-level errors with partial data', () => json({ errors: [{ message: 'execution failed' }], data: { scenarios: [] } })],
    ['null data', () => json({ data: null })],
    ['missing data', () => json({})],
    ['incomplete summaries', () => json({ data: { scenarios: [{ id: 'S1' }] } })],
  ] as const)('rejects %s without a success-shaped fallback', async (_label, response) => {
    const clients = createHttpClients('/graphql', vi.fn<typeof fetch>(async () => response()))
    await expect(clients.repository.list()).rejects.toThrow()
  })

  it('rejects wrong scenarios and missing explicit nullable fields', async () => {
    const scenario = fixture('S3')
    const fetcher = vi.fn<typeof fetch>(async () => json({ data: { scenario } }))
    const clients = createHttpClients('/graphql', fetcher)
    await expect(clients.repository.get('S1', 'get-id')).rejects.toThrow('Scenario does not match')
    const incomplete: Record<string, unknown> = { ...scenario }
    delete incomplete.scoreAfterReview
    fetcher.mockResolvedValue(json({ data: { scenario: incomplete } }))
    await expect(clients.repository.get('S3', 'get-id')).rejects.toThrow('Malformed or incomplete')
  })

  it.each(['requestId', 'scenarioId', 'contentVersion', 'audience', 'sourceMode', 'citation', 'partial', 'error-correlation'] as const)(
    'rejects mismatched explanation %s', async field => {
      const response = await createExplanationClientStub().explain(request)
      if (response.__typename !== 'ExplanationSuccess') throw Error('Bad fixture')
      let broken = structuredClone(response)
      if (field === 'requestId') broken = { ...broken, requestId: 'old-id' }
      if (field === 'scenarioId') broken = { ...broken, scenarioId: 'S2' }
      if (field === 'contentVersion') broken = { ...broken, contentVersion: 'different' }
      if (field === 'audience') broken = { ...broken, audience: 'ANALYST' }
      if (field === 'sourceMode') broken = { ...broken, sourceMode: 'LIVE_AI' }
      if (field === 'citation') broken = { ...broken, headline: { ...broken.headline, evidenceIds: ['invented'] } }
      const payload = field === 'error-correlation'
        ? { data: { explain: { ...await createExplanationClientStub('TIMEOUT').explain(request), requestId: 'wrong' } } }
        : field === 'partial' ? { errors: [{ message: 'failure' }], data: { explain: broken } } : { data: { explain: broken } }
      const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(json({ data: { scenario: fixture('S1') } }))
        .mockResolvedValueOnce(json(payload))
      await expect(createHttpClients('/graphql', fetcher).client.explain(request)).rejects.toThrow()
    },
  )

  it('returns a typed domain failure and never changes live mode to authored', async () => {
    const live = { ...request, sourceMode: 'LIVE_AI' as const }
    const error = await createExplanationClientStub('MODEL_NOT_CONFIGURED').explain(live)
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { scenario: fixture('S1') } }))
      .mockResolvedValueOnce(json({ data: { explain: error } }))
    expect(await createHttpClients('/graphql', fetcher).client.explain(live)).toEqual(error)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).variables.input.sourceMode).toBe('LIVE_AI')
  })

  it('does not publish a response after an abort even when a transport ignores the signal', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>(async () => {
      controller.abort()
      return json({ data: { scenarios: [] } })
    })
    await expect(createHttpClients('/graphql', fetcher).repository.list(controller.signal)).rejects.toThrow()
  })
})
