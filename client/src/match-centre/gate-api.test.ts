import { describe, expect, it, vi } from 'vitest'
import { createGateClient, GateApiError } from './gate-api'
import type { DeskHandlers } from './gate-api'
import { decision, deskEnvelope, narrationStatus, proposal, session, SESSION_ID, HASH } from './gate-test-data'

const BASE = '/api/matches/SYN-MATCH-01'
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init })

function clientWith(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => respond(url, init))
  return { fetchImpl, client: createGateClient(fetchImpl, () => { throw new Error('no desk stream expected') }) }
}

async function failureOf(call: Promise<unknown>) {
  try {
    await call
  } catch (error) {
    return error
  }
  throw new Error('The call was expected to fail.')
}

describe('creating a session', () => {
  it('posts the chosen speed and start second as JSON and returns the validated session', async () => {
    const { fetchImpl, client } = clientWith(() => json(session({ speed: 5, fromSeconds: 3960 }), { status: 201 }))
    const created = await client.createSession({ speed: 5, fromSeconds: 3960 })
    expect(created).toEqual(session({ speed: 5, fromSeconds: 3960 }))
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/sessions`)
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(init!.body as string)).toEqual({ speed: 5, fromSeconds: 3960 })
  })

  it('shows the server message and code for a rejected request', async () => {
    const { client } = clientWith(() => json({ error: 'speed must be between 1 and 10 so an operator can keep up.', code: 'INVALID_SPEED' }, { status: 400 }))
    const error = await failureOf(client.createSession({ speed: 60, fromSeconds: 0 }))
    expect(error).toBeInstanceOf(GateApiError)
    expect(error).toMatchObject({ status: 400, code: 'INVALID_SPEED', message: 'speed must be between 1 and 10 so an operator can keep up.' })
  })

  it('tells the user when to try again after a full demo', async () => {
    const { client } = clientWith(() => json(
      { error: 'The demo already has the maximum number of live sessions. Try again shortly.', code: 'SESSIONS_FULL' },
      { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }))
    const error = await failureOf(client.createSession({ speed: 10, fromSeconds: 0 }))
    expect(error).toMatchObject({ status: 503, code: 'SESSIONS_FULL', retryAfterSeconds: 30 })
    expect((error as Error).message).toContain('maximum number of live sessions')
    expect((error as Error).message).toContain('Try again in about 30 s.')
  })

  it('falls back to a plain message when the failure has no usable body', async () => {
    const { client } = clientWith(() => new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await failureOf(client.createSession({ speed: 10, fromSeconds: 0 }))
    expect(error).toMatchObject({ status: 502, code: null, message: 'The operator-gated session could not be started (HTTP 502).' })
  })

  it('reports an unreachable server and an unreadable session separately, and passes an abort through untouched', async () => {
    const offline = createGateClient(async () => { throw new TypeError('Failed to fetch') })
    expect(await failureOf(offline.createSession({ speed: 10, fromSeconds: 0 }))).toMatchObject({ code: 'NETWORK', status: 0 })

    const odd = clientWith(() => json({ sessionId: 'nope' }, { status: 201 })).client
    expect(await failureOf(odd.createSession({ speed: 10, fromSeconds: 0 }))).toMatchObject({ code: 'UNEXPECTED_RESPONSE' })

    const aborted = createGateClient(async () => { throw new DOMException('Aborted', 'AbortError') })
    const error = await failureOf(aborted.createSession({ speed: 10, fromSeconds: 0 }))
    expect(error).not.toBeInstanceOf(GateApiError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
})

describe('sending a decision', () => {
  const approve = { approvalId: 'APR-001', payloadHash: HASH, action: 'approve' as const }

  it('sends the hash of the proposal on screen with the action, edits and note, and returns the validated result', async () => {
    const result = { approvalId: 'APR-001', state: 'OVERRIDDEN', payloadHash: 'c'.repeat(64), decidedAtMs: 4100 }
    const { fetchImpl, client } = clientWith(() => json(result))
    const edits = { ta: { headline: 'a', fan: 'b', analyst: 'c', why: 'd' } }
    expect(await client.decide(SESSION_ID, { ...approve, action: 'override', edits, note: 'Tamil checked' })).toEqual(result)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/sessions/${SESSION_ID}/decisions`)
    expect(JSON.parse(init!.body as string)).toEqual({ approvalId: 'APR-001', payloadHash: HASH, action: 'override', edits, note: 'Tamil checked' })
  })

  it.each([
    ['ALREADY_DECIDED', 409], ['SLA_EXPIRED', 409], ['STALE_PAYLOAD', 409], ['UNKNOWN_PROPOSAL', 404], ['INVALID_DECISION', 400],
  ])('keeps the %s code the server sent (HTTP %i)', async (code, status) => {
    const { client } = clientWith(() => json({ error: `Server says ${code}.`, code }, { status }))
    expect(await failureOf(client.decide(SESSION_ID, approve))).toMatchObject({ status, code, message: `Server says ${code}.` })
  })

  it('treats a bare 404 as a session that no longer exists, but a 404 with a code as an unknown proposal', async () => {
    const gone = clientWith(() => new Response(null, { status: 404 })).client
    expect(await failureOf(gone.decide(SESSION_ID, approve))).toMatchObject({ status: 404, code: 'SESSION_ENDED' })
  })

  it('reports a network failure and a result it cannot understand', async () => {
    const offline = createGateClient(async () => { throw new TypeError('Failed to fetch') })
    expect(await failureOf(offline.decide(SESSION_ID, approve))).toMatchObject({ code: 'NETWORK' })
    const odd = clientWith(() => json({ approvalId: 'APR-001', state: 'PENDING' })).client
    expect(await failureOf(odd.decide(SESSION_ID, approve))).toMatchObject({ code: 'UNEXPECTED_RESPONSE' })
  })

  it('refuses a session ID that is not 32 lower-case hex characters before any request is made', async () => {
    const { fetchImpl, client } = clientWith(() => json({}))
    await expect(client.decide('../etc/passwd', approve)).rejects.toThrow('not valid')
    expect(() => client.decisionLogUrl('ABC')).toThrow('not valid')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('narration status and the session probe', () => {
  it('reads the narration status and rejects anything else', async () => {
    const ok = clientWith(() => json(narrationStatus({ enabled: true, deployment: 'gpt-demo', callsUsed: 4 }))).client
    expect(await ok.narrationStatus()).toEqual(narrationStatus({ enabled: true, deployment: 'gpt-demo', callsUsed: 4 }))
    expect(await failureOf(clientWith(() => json({ enabled: 'maybe' })).client.narrationStatus())).toMatchObject({ code: 'UNEXPECTED_RESPONSE' })
    expect(await failureOf(clientWith(() => new Response('x', { status: 500 })).client.narrationStatus())).toMatchObject({ status: 500 })
  })

  it('tells an ended session (404) from a live one and from an unknown answer, using the decision log route', async () => {
    const answer = (response: () => Response) => clientWith(() => response()).client.sessionStatus(SESSION_ID)
    expect(await answer(() => new Response('{}', { status: 200 }))).toBe('active')
    expect(await answer(() => new Response(null, { status: 404 }))).toBe('ended')
    expect(await answer(() => new Response(null, { status: 500 }))).toBe('unknown')
    expect(await createGateClient(async () => { throw new TypeError('offline') }).sessionStatus(SESSION_ID)).toBe('unknown')
    await expect(createGateClient(async () => { throw new DOMException('Aborted', 'AbortError') }).sessionStatus(SESSION_ID)).rejects.toMatchObject({ name: 'AbortError' })
    const { fetchImpl } = clientWith(() => new Response('{}'))
    await createGateClient(fetchImpl).sessionStatus(SESSION_ID)
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/sessions/${SESSION_ID}/decision-log.jsonl`)
  })

  it('builds the decision log link for a session', () => {
    expect(createGateClient().decisionLogUrl(SESSION_ID)).toBe(`${BASE}/sessions/${SESSION_ID}/decision-log.jsonl`)
  })
})

function fakeDesk() {
  const source = {
    close: vi.fn(),
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    readyState: 1,
  }
  const create = vi.fn(() => source)
  const handlers = { onMessage: vi.fn(), onReconnecting: vi.fn(), onClosed: vi.fn() } satisfies DeskHandlers
  const send = (data: string, lastEventId = '') => source.onmessage?.({ data, lastEventId } as MessageEvent<string>)
  const disconnect = createGateClient(vi.fn(), create).connectDesk(SESSION_ID, handlers)
  return { source, create, handlers, send, disconnect }
}

describe('the operator desk stream', () => {
  it('connects to the session desk and forwards validated messages with their message number', () => {
    const { create, handlers, send } = fakeDesk()
    expect(create).toHaveBeenCalledWith(`${BASE}/sessions/${SESSION_ID}/desk`)
    send(deskEnvelope('session', session()), '0')
    send(deskEnvelope('proposal', proposal()), '1')
    send(deskEnvelope('decision', decision()), '2')
    send(deskEnvelope('heartbeat', { elapsedMs: 10_000 }), '2')
    send(deskEnvelope('heartbeat', { elapsedMs: 20_000 }))
    expect(handlers.onMessage.mock.calls.map(([message, seq]) => [message.type, seq])).toEqual([
      ['session', 0], ['proposal', 1], ['decision', 2], ['heartbeat', 2], ['heartbeat', null],
    ])
    expect(handlers.onClosed).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid JSON', '{'],
    ['an unknown message type', deskEnvelope('reboot', {})],
    ['a proposal with an unknown state', deskEnvelope('proposal', { ...proposal(), state: 'SHELVED' })],
  ])('closes the stream and reports %s without asking whether the session ended', (_, raw) => {
    const { source, handlers, send } = fakeDesk()
    send(raw, '1')
    expect(source.close).toHaveBeenCalledOnce()
    expect(handlers.onClosed).toHaveBeenCalledWith(expect.any(String), false)
    expect(handlers.onMessage).not.toHaveBeenCalled()
    send(deskEnvelope('heartbeat', { elapsedMs: 1 }), '1')
    expect(handlers.onMessage).not.toHaveBeenCalled()
  })

  it('reports reconnecting while the browser retries and a closed stream, which may be an ended session, when it gives up', () => {
    const { source, handlers } = fakeDesk()
    source.onerror?.(new Event('error'))
    expect(handlers.onReconnecting).toHaveBeenCalledOnce()
    source.readyState = 2
    source.onerror?.(new Event('error'))
    expect(handlers.onClosed).toHaveBeenCalledWith('The operator desk connection closed.', true)
    expect(source.close).toHaveBeenCalledOnce()
  })

  it('closes once when the caller disconnects and ignores everything afterwards', () => {
    const { source, handlers, send, disconnect } = fakeDesk()
    disconnect()
    disconnect()
    expect(source.close).toHaveBeenCalledOnce()
    send(deskEnvelope('heartbeat', { elapsedMs: 1 }), '1')
    source.onerror?.(new Event('error'))
    expect(handlers.onMessage).not.toHaveBeenCalled()
    expect(handlers.onReconnecting).not.toHaveBeenCalled()
  })

  it('refuses a session ID it should not put in a URL', () => {
    expect(() => createGateClient(vi.fn(), vi.fn()).connectDesk('x/../y', { onMessage: vi.fn(), onReconnecting: vi.fn(), onClosed: vi.fn() })).toThrow('not valid')
  })
})
