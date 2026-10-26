import type { CreateSessionRequest, DecisionRequest, DecisionResult, DeskMessage, SessionView } from './gate-model'
import { parseApiProblem, parseDecisionResult, parseDeskMessage, parseSessionView } from './gate-validate'
import { MATCH_ID, SESSION_ID_PATTERN } from './match-model'
import type { NarrationStatus } from './narration-model'
import { parseNarrationStatus } from './narration-validate'

const BASE = `/api/matches/${MATCH_ID}`

/** A failed call to the gate routes. `code` is the server's error code, or one of this client's own (NETWORK, SESSION_ENDED, UNEXPECTED_RESPONSE). */
export class GateApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly retryAfterSeconds: number | null

  constructor(message: string, status: number, code: string | null, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'GateApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export type SessionProbe = 'active' | 'ended' | 'unknown'

export interface DeskHandlers {
  readonly onMessage: (message: DeskMessage, seq: number | null) => void
  readonly onReconnecting: () => void
  /** The stream is closed for good. `mayBeEnded` is true when the server closed it, which is how an unknown session looks to an EventSource. */
  readonly onClosed: (message: string, mayBeEnded: boolean) => void
}

export interface GateClient {
  createSession: (request: CreateSessionRequest, signal?: AbortSignal) => Promise<SessionView>
  decide: (sessionId: string, request: DecisionRequest, signal?: AbortSignal) => Promise<DecisionResult>
  narrationStatus: (signal?: AbortSignal) => Promise<NarrationStatus>
  sessionStatus: (sessionId: string, signal?: AbortSignal) => Promise<SessionProbe>
  connectDesk: (sessionId: string, handlers: DeskHandlers) => () => void
  decisionLogUrl: (sessionId: string) => string
}

interface EventSourceLike {
  close: () => void
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  readonly readyState: number
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type EventSourceFactory = (url: string) => EventSourceLike

const isAbort = (error: unknown) => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'

async function send(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch (error) {
    if (isAbort(error)) throw error
    throw new GateApiError('The server could not be reached. Check that it is running, then try again.', 0, 'NETWORK')
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function retryAfterOf(response: Response) {
  const value = response.headers.get('Retry-After')
  return value !== null && /^\d{1,4}$/.test(value) ? Number(value) : null
}

async function failure(response: Response, what: string): Promise<GateApiError> {
  const problem = parseApiProblem(await readJson(response))
  const retryAfter = retryAfterOf(response)
  const hint = retryAfter ? ` Try again in about ${retryAfter} s.` : ''
  return new GateApiError(`${problem.message ?? `${what} (HTTP ${response.status}).`}${hint}`, response.status, problem.code, retryAfter)
}

function requireSessionId(sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error('The operator-gated session identifier is not valid.')
}

const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' }

export function createGateClient(
  fetchImpl: FetchLike = (input, init) => globalThis.fetch(input, init),
  createSource: EventSourceFactory = url => new EventSource(url),
): GateClient {
  return {
    async createSession(request, signal) {
      const response = await send(fetchImpl, `${BASE}/sessions`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify({ speed: request.speed, fromSeconds: request.fromSeconds }), signal,
      })
      if (!response.ok) throw await failure(response, 'The operator-gated session could not be started')
      const session = parseSessionView(await readJson(response))
      if (!session) throw new GateApiError('The server sent a session description this page does not understand.', response.status, 'UNEXPECTED_RESPONSE')
      return session
    },

    async decide(sessionId, request, signal) {
      requireSessionId(sessionId)
      const response = await send(fetchImpl, `${BASE}/sessions/${sessionId}/decisions`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify(request), signal,
      })
      if (response.ok) {
        const result = parseDecisionResult(await readJson(response))
        if (!result) throw new GateApiError('The server answered the decision in a form this page does not understand.', response.status, 'UNEXPECTED_RESPONSE')
        return result
      }
      const problem = parseApiProblem(await readJson(response))
      // An unknown proposal comes with an error code; an unknown session is a bare 404.
      if (response.status === 404 && problem.code === null) {
        throw new GateApiError('The session has ended: it expired or the server restarted.', 404, 'SESSION_ENDED')
      }
      throw new GateApiError(problem.message ?? `The decision could not be recorded (HTTP ${response.status}).`, response.status, problem.code)
    },

    async narrationStatus(signal) {
      const response = await send(fetchImpl, '/api/narration', { headers: { Accept: 'application/json' }, signal })
      if (!response.ok) throw await failure(response, 'The narration status could not be loaded')
      const status = parseNarrationStatus(await readJson(response))
      if (!status) throw new GateApiError('The narration status was not in the expected form.', response.status, 'UNEXPECTED_RESPONSE')
      return status
    },

    async sessionStatus(sessionId, signal) {
      requireSessionId(sessionId)
      try {
        const response = await fetchImpl(`${BASE}/sessions/${sessionId}/decision-log.jsonl`, { cache: 'no-store', signal })
        void response.body?.cancel().catch(() => undefined)
        if (response.status === 404) return 'ended'
        return response.ok ? 'active' : 'unknown'
      } catch (error) {
        if (isAbort(error)) throw error
        return 'unknown'
      }
    },

    connectDesk(sessionId, handlers) {
      requireSessionId(sessionId)
      const source = createSource(`${BASE}/sessions/${sessionId}/desk`)
      let closed = false

      function close(message: string, mayBeEnded: boolean) {
        closed = true
        source.close()
        handlers.onClosed(message, mayBeEnded)
      }

      source.onmessage = event => {
        if (closed) return
        let message: DeskMessage
        try {
          message = parseDeskMessage(event.data)
        } catch (error) {
          close(error instanceof Error ? error.message : 'The operator desk message could not be validated.', false)
          return
        }
        handlers.onMessage(message, /^\d{1,9}$/.test(event.lastEventId) ? Number(event.lastEventId) : null)
      }

      source.onerror = () => {
        if (closed) return
        if (source.readyState === 2) close('The operator desk connection closed.', true)
        else handlers.onReconnecting()
      }

      return () => {
        if (closed) return
        closed = true
        source.close()
      }
    },

    decisionLogUrl(sessionId) {
      requireSessionId(sessionId)
      return `${BASE}/sessions/${sessionId}/decision-log.jsonl`
    },
  }
}

export const defaultGateClient = createGateClient()
