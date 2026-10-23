import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { describeDecisionError, SESSION_ENDED_MESSAGE } from './desk-format'
import { deskReducer, initialDeskState } from './desk-state'
import { GateApiError } from './gate-api'
import type { GateClient } from './gate-api'
import type { CreateSessionRequest, DecisionRequest, DecisionResult, GatePhase, SessionView } from './gate-model'
import type { StreamStatus } from './match-state'
import type { MatchStreamOptions } from './match-stream'
import type { NarrationStatus } from './narration-model'

const NARRATION_REFRESH_MS = 15_000

export interface GatedSessionOptions {
  readonly gate: GateClient
  readonly clock: () => number
  /** True while the page is in operator-gated mode; the narration status is only requested then. */
  readonly active: boolean
  readonly programStatus: StreamStatus
  readonly prepareProgram: (options: { readonly speed: number; readonly fromSeconds: number }) => void
  readonly startProgram: (options: MatchStreamOptions) => void
  readonly failProgram: (message: string) => void
  readonly stopProgram: () => void
}

/**
 * Runs one operator-gated session: creates it, opens the operator desk feed and the program feed, forwards decisions and
 * ends everything cleanly when the session is stopped, replaced, gone from the server, or the page unmounts.
 */
export function useGatedSession({
  gate, clock, active, programStatus, prepareProgram, startProgram, failProgram, stopProgram,
}: GatedSessionOptions) {
  const [phase, setPhase] = useState<GatePhase>('idle')
  const [session, setSession] = useState<SessionView | null>(null)
  const [narration, setNarration] = useState<NarrationStatus | null>(null)
  const [narrationFailed, setNarrationFailed] = useState(false)
  const [desk, dispatchDesk] = useReducer(deskReducer, initialDeskState)
  const creating = useRef<AbortController | null>(null)
  const deskStream = useRef<(() => void) | null>(null)
  const currentSession = useRef<string | null>(null)
  const mounted = useRef(true)

  const closeDesk = useCallback(() => {
    deskStream.current?.()
    deskStream.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      creating.current?.abort()
      closeDesk()
    }
  }, [closeDesk])

  const endSession = useCallback(() => {
    if (!mounted.current) return
    creating.current?.abort()
    closeDesk()
    setPhase('ended')
    dispatchDesk({ type: 'status', connection: 'ended', message: SESSION_ENDED_MESSAGE })
    failProgram(SESSION_ENDED_MESSAGE)
  }, [closeDesk, failProgram])

  const connectDesk = useCallback((created: SessionView) => {
    closeDesk()
    dispatchDesk({ type: 'connecting' })
    const { sessionId } = created
    try {
      deskStream.current = gate.connectDesk(sessionId, {
        onMessage: (message, seq) => dispatchDesk({ type: 'message', message, seq, atMs: clock() }),
        onReconnecting: () => dispatchDesk({ type: 'status', connection: 'reconnecting', message: 'The desk connection was interrupted; reconnecting…' }),
        onClosed: (message, mayBeEnded) => {
          deskStream.current = null
          dispatchDesk({ type: 'status', connection: 'error', message })
          if (!mayBeEnded) return
          gate.sessionStatus(sessionId).then(status => {
            if (status === 'ended' && mounted.current && currentSession.current === sessionId) endSession()
          }, () => undefined)
        },
      })
    } catch (error) {
      dispatchDesk({ type: 'status', connection: 'error', message: error instanceof Error ? error.message : 'The operator desk could not be opened.' })
    }
  }, [clock, closeDesk, endSession, gate])

  const start = useCallback(async (request: CreateSessionRequest) => {
    creating.current?.abort()
    closeDesk()
    dispatchDesk({ type: 'reset' })
    const controller = new AbortController()
    creating.current = controller
    currentSession.current = null
    setSession(null)
    setPhase('creating')
    prepareProgram(request)
    try {
      const created = await gate.createSession(request, controller.signal)
      if (controller.signal.aborted || !mounted.current) return
      currentSession.current = created.sessionId
      setSession(created)
      setNarration(created.narration)
      setPhase('running')
      connectDesk(created)
      startProgram({ speed: created.speed, fromSeconds: created.fromSeconds, sessionId: created.sessionId })
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return
      setPhase('idle')
      failProgram(error instanceof Error ? error.message : 'The operator-gated session could not be started.')
    }
  }, [closeDesk, connectDesk, failProgram, gate, prepareProgram, startProgram])

  const stop = useCallback(() => {
    creating.current?.abort()
    closeDesk()
    stopProgram()
    setPhase(current => current === 'creating' ? 'idle' : current === 'running' ? 'stopped' : current)
    dispatchDesk({ type: 'stopped', message: 'Stopped: the desk no longer receives updates.' })
  }, [closeDesk, stopProgram])

  const reset = useCallback(() => {
    creating.current?.abort()
    closeDesk()
    currentSession.current = null
    setSession(null)
    setPhase('idle')
    dispatchDesk({ type: 'reset' })
  }, [closeDesk])

  const decide = useCallback(async (request: DecisionRequest): Promise<DecisionResult> => {
    const sessionId = currentSession.current
    if (!sessionId) throw new GateApiError('There is no active session.', 0, 'SESSION_ENDED')
    try {
      const result = await gate.decide(sessionId, request)
      if (mounted.current) dispatchDesk({ type: 'recorded', result })
      return result
    } catch (error) {
      if (describeDecisionError(error).sessionEnded && mounted.current && currentSession.current === sessionId) endSession()
      throw error
    }
  }, [endSession, gate])

  const reconnectDesk = useCallback(() => {
    if (session && phase === 'running') connectDesk(session)
  }, [connectDesk, phase, session])

  const running = phase === 'running'

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const refresh = () => {
      gate.narrationStatus(controller.signal).then(
        status => {
          if (controller.signal.aborted) return
          setNarration(status)
          setNarrationFailed(false)
        },
        () => {
          if (!controller.signal.aborted) setNarrationFailed(true)
        },
      )
    }
    refresh()
    const timer = running ? setInterval(refresh, NARRATION_REFRESH_MS) : null
    return () => {
      controller.abort()
      if (timer !== null) clearInterval(timer)
    }
  }, [active, gate, running])

  // An EventSource cannot see a 404, so a program feed that fails is checked against the session before the user is told why.
  useEffect(() => {
    if (!running || programStatus !== 'error' || !session) return
    const controller = new AbortController()
    gate.sessionStatus(session.sessionId, controller.signal).then(status => {
      if (status === 'ended' && !controller.signal.aborted) endSession()
    }, () => undefined)
    return () => controller.abort()
  }, [endSession, gate, programStatus, running, session])

  return {
    phase, session, desk, narration, narrationFailed,
    logUrl: session && phase !== 'ended' ? gate.decisionLogUrl(session.sessionId) : null,
    start, stop, reset, decide, reconnectDesk,
  }
}
