import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { cueHoldMs, initialMatchState, matchReducer } from './match-state'
import { matchStreamClient } from './match-stream'
import type { MatchStreamClient, MatchStreamOptions } from './match-stream'
import type { MatchMetadata, MatchStreamMessage } from './match-model'

const BATCH_MS = 50

export function useMatchStream(client: MatchStreamClient = matchStreamClient) {
  const [state, dispatch] = useReducer(matchReducer, initialMatchState)
  const [speed, setSpeed] = useState(60)
  const disconnect = useRef<(() => void) | null>(null)
  const queue = useRef<MatchStreamMessage[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (queue.current.length > 0) {
      const messages = queue.current
      queue.current = []
      dispatch({ type: 'messages', messages })
    }
  }, [])

  const closeStream = useCallback(() => {
    disconnect.current?.()
    disconnect.current = null
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    queue.current = []
  }, [])

  const setMetadata = useCallback((metadata: MatchMetadata) => dispatch({ type: 'metadata', metadata }), [])

  const start = useCallback((options: MatchStreamOptions) => {
    closeStream()
    setSpeed(options.speed)
    dispatch({ type: 'connecting', fromSeconds: options.fromSeconds, gated: options.sessionId !== undefined })
    try {
      disconnect.current = client.connect(options, {
        onMessage: message => {
          queue.current.push(message)
          if (timer.current === null) timer.current = setTimeout(flush, BATCH_MS)
        },
        onReconnecting: () => dispatch({ type: 'status', status: 'reconnecting' }),
        onError: message => {
          flush()
          disconnect.current = null
          dispatch({ type: 'status', status: 'error', message })
        },
      })
    } catch (error) {
      dispatch({
        type: 'status', status: 'error',
        message: error instanceof Error ? error.message : 'The match stream could not be started.',
      })
    }
  }, [client, closeStream, flush])

  /** Starts an operator-gated run that is still waiting for its session: clears the view and shows it as connecting. */
  const prepare = useCallback((options: { readonly speed: number; readonly fromSeconds: number }) => {
    closeStream()
    setSpeed(options.speed)
    dispatch({ type: 'connecting', fromSeconds: options.fromSeconds, gated: true })
  }, [closeStream])

  const fail = useCallback((message: string) => {
    closeStream()
    dispatch({ type: 'status', status: 'error', message })
  }, [closeStream])

  const stop = useCallback(() => {
    flush()
    closeStream()
    dispatch({ type: 'status', status: 'stopped' })
  }, [closeStream, flush])

  const reset = useCallback(() => {
    closeStream()
    dispatch({ type: 'reset' })
  }, [closeStream])

  useEffect(() => closeStream, [closeStream])

  useEffect(() => {
    const cue = state.presented
    if (!cue) return
    const timeout = setTimeout(() => dispatch({ type: 'hideCue', overlayId: cue.overlayId }), cueHoldMs(cue, speed))
    return () => clearTimeout(timeout)
  }, [state.presented, speed])

  return { state, speed, start, prepare, fail, stop, reset, setMetadata }
}
