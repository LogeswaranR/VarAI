import type {
  MatchComplete, MatchEvent, MatchMetadata, MatchStreamMessage, MomentumSample, OverlayCue, Score,
} from './match-model'

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'reconnecting' | 'complete' | 'stopped' | 'error'

export interface MatchState {
  readonly status: StreamStatus
  readonly message: string | null
  readonly metadata: MatchMetadata | null
  readonly events: readonly MatchEvent[]
  readonly momentum: readonly MomentumSample[]
  readonly overlays: readonly OverlayCue[]
  readonly presented: OverlayCue | null
  readonly catchUpUntilMs: number
  readonly clockMs: number
  readonly score: Score
  readonly complete: MatchComplete | null
  /** True for an operator-gated program feed, which carries only the cues a person approved. */
  readonly gated: boolean
}

export type MatchAction =
  | { readonly type: 'metadata'; readonly metadata: MatchMetadata }
  | { readonly type: 'connecting'; readonly fromSeconds: number; readonly gated?: boolean }
  | { readonly type: 'reset' }
  | { readonly type: 'messages'; readonly messages: readonly MatchStreamMessage[] }
  | { readonly type: 'status'; readonly status: StreamStatus; readonly message?: string | null }
  | { readonly type: 'hideCue'; readonly overlayId: string }

const noScore: Score = { home: 0, away: 0 }

export const initialMatchState: MatchState = {
  status: 'idle', message: null, metadata: null, events: [], momentum: [], overlays: [], presented: null,
  catchUpUntilMs: 0, clockMs: 0, score: noScore, complete: null, gated: false,
}

const live = new Set<StreamStatus>(['connecting', 'streaming', 'reconnecting'])

function applyMessages(state: MatchState, messages: readonly MatchStreamMessage[]): MatchState {
  const { catchUpUntilMs, gated } = state
  let { metadata, clockMs, score, presented, complete, status, message } = state
  const events = [...state.events]
  const momentum = [...state.momentum]
  const overlays = [...state.overlays]
  const arrivals: OverlayCue[] = []

  for (const item of messages) {
    switch (item.type) {
      case 'match':
        metadata = item.payload
        if (events.length === 0) score = item.payload.startingScore
        break
      case 'event':
        if (item.payload.sequence <= (events.at(-1)?.sequence ?? 0)) break
        events.push(item.payload)
        clockMs = Math.max(clockMs, item.payload.matchClockMs)
        if (item.payload.scoreAfter) score = item.payload.scoreAfter
        break
      case 'momentum':
        if (!momentum.some(sample => sample.minute === item.payload.minute)) momentum.push(item.payload)
        clockMs = Math.max(clockMs, item.payload.matchClockMs)
        break
      case 'overlay':
        if (overlays.some(cue => cue.overlayId === item.payload.overlayId)) break
        // Defence in depth: the parser already refuses an unapproved cue on the gated feed; the reducer never keeps one either.
        if (gated && !item.payload.approval) break
        overlays.push(item.payload)
        arrivals.push(item.payload)
        clockMs = Math.max(clockMs, item.payload.inMs)
        break
      case 'complete':
        complete = item.payload
        break
    }
  }

  // Cues at or before the jump point arrive in the server's catch-up burst: they are history, not live.
  for (const cue of arrivals) {
    if (cue.inMs <= catchUpUntilMs) continue
    if (presented === null || cue.priority >= presented.priority) presented = cue
  }

  if (live.has(status)) status = 'streaming'
  if (complete && live.has(status)) {
    // The gated feed omits every held cue and every cue before the start point, but the completion marker still counts them all.
    const cuesAccountedFor = gated ? overlays.length <= complete.overlayCount : overlays.length === complete.overlayCount
    const consistent = events.length === complete.eventCount && momentum.length === complete.momentumCount && cuesAccountedFor
    status = consistent ? 'complete' : 'error'
    message = consistent ? null : 'The stream ended before every event, momentum sample and cue arrived.'
  }
  return { status, message, metadata, events, momentum, overlays, presented, catchUpUntilMs, clockMs, score, complete, gated }
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'metadata':
      return {
        ...state, metadata: action.metadata,
        score: state.events.length === 0 ? action.metadata.startingScore : state.score,
      }
    case 'connecting':
      return {
        ...initialMatchState, metadata: state.metadata, score: state.metadata?.startingScore ?? noScore,
        catchUpUntilMs: action.fromSeconds * 1000, status: 'connecting', gated: action.gated ?? false,
      }
    case 'reset':
      return { ...initialMatchState, metadata: state.metadata, score: state.metadata?.startingScore ?? noScore }
    case 'status':
      return { ...state, status: action.status, message: action.message ?? null }
    case 'hideCue':
      return state.presented?.overlayId === action.overlayId ? { ...state, presented: null } : state
    case 'messages':
      return applyMessages(state, action.messages)
  }
}

/** Real-time hold for an on-air cue. At 1x this equals the cue's own window; faster playback holds it long enough to read. */
export function cueHoldMs(cue: OverlayCue, speed: number) {
  const minimum = cue.priority === 3 ? 8000 : cue.priority === 2 ? 6000 : 4500
  return Math.max(cue.durationMs / speed, minimum)
}
