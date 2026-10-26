import { eventTypes, FEED_SCHEMA_VERSION, MATCH_ID, momentumStates, OVERLAY_SCHEMA_VERSION, SESSION_ID_PATTERN } from './match-model'
import type {
  MatchComplete, MatchEvent, MatchEventType, MatchMetadata, MatchPlayer, MatchStreamMessage, MatchTeam, MomentumSample,
  MomentumState, OverlayCue, Score,
} from './match-model'
import { parseApproval } from './narration-validate'
import { isBool, isInt, isNum, isRec, isStr, isStrArray, orNull } from './validate-primitives'
function isScore(value: unknown): value is Score {
  return isRec(value) && isInt(value.home) && value.home >= 0 && isInt(value.away) && value.away >= 0
}

function isPlayer(value: unknown): value is MatchPlayer {
  return isRec(value) && isStr(value.playerId) && isStr(value.name) && isInt(value.shirtNumber) && isStr(value.role)
}

function isTeam(value: unknown): value is MatchTeam {
  return isRec(value) && isStr(value.teamId) && isStr(value.name) && isStr(value.shortName) &&
    isStr(value.attackDirection) && Array.isArray(value.players) && value.players.length > 0 && value.players.every(isPlayer)
}

function isMetadata(value: unknown): value is MatchMetadata {
  return isRec(value) && value.matchId === MATCH_ID && value.synthetic === true &&
    isRec(value.pitch) && isNum(value.pitch.lengthM) && value.pitch.lengthM > 0 && isNum(value.pitch.widthM) && value.pitch.widthM > 0 &&
    Array.isArray(value.periods) && value.periods.every(period =>
      isRec(period) && isInt(period.period) && isInt(period.startMs) && isInt(period.endMs)) &&
    isInt(value.durationMs) && value.durationMs > 0 && isScore(value.startingScore) &&
    isTeam(value.homeTeam) && isTeam(value.awayTeam) && value.homeTeam.teamId !== value.awayTeam.teamId &&
    Array.isArray(value.highlights) && value.highlights.every(highlight =>
      isRec(highlight) && isStr(highlight.highlightId) && isStr(highlight.label) && isInt(highlight.matchClockMs)) &&
    isNum(value.seed)
}

function isMetrics(value: unknown): boolean {
  return isRec(value) && orNull(isNum)(value.distanceM) && orNull(isNum)(value.forwardM) && orNull(isNum)(value.speedMps) &&
    orNull(isNum)(value.speedKph) && orNull(isInt)(value.difficulty) && orNull(isBool)(value.underPressure) &&
    orNull(isBool)(value.finalThird) && orNull(isBool)(value.sprint)
}

function isEvent(value: unknown): value is MatchEvent {
  return isRec(value) && isStr(value.eventId) && value.matchId === MATCH_ID && isInt(value.sequence) && value.sequence > 0 &&
    isInt(value.period) && isInt(value.matchClockMs) && value.matchClockMs >= 0 && isStr(value.teamId) &&
    orNull(isStr)(value.playerId) && isStr(value.eventType) && eventTypes.includes(value.eventType as MatchEventType) &&
    isNum(value.x) && isNum(value.y) && orNull(isNum)(value.endX) && orNull(isNum)(value.endY) &&
    orNull(isInt)(value.durationMs) && orNull(isStr)(value.outcome) && orNull(isStr)(value.receiverId) &&
    orNull(isScore)(value.scoreAfter) && orNull(isStr)(value.scenarioId) &&
    (value.metrics === null || isMetrics(value.metrics)) && isStr(value.description) && value.synthetic === true
}

function isMomentum(value: unknown): value is MomentumSample {
  return isRec(value) && isInt(value.minute) && value.minute > 0 && isInt(value.matchClockMs) && isInt(value.windowSeconds) &&
    isNum(value.homeBallActionSharePct) && isInt(value.controlIndex) && isInt(value.turnovers) && isNum(value.turnoversPerMinute) &&
    isInt(value.homePressures) && isInt(value.awayPressures) && isStr(value.state) &&
    momentumStates.includes(value.state as MomentumState) && orNull(isStr)(value.controllingTeamId)
}

export function isCue(value: unknown): value is OverlayCue {
  return isRec(value) && value.schemaVersion === OVERLAY_SCHEMA_VERSION && isStr(value.overlayId) && value.matchId === MATCH_ID &&
    isStr(value.kind) && (value.priority === 1 || value.priority === 2 || value.priority === 3) &&
    isInt(value.inMs) && isInt(value.outMs) && value.outMs > value.inMs && isInt(value.durationMs) &&
    isStr(value.headline) && isStr(value.detail) && isStr(value.whyItMatters) &&
    isRec(value.lowerThird) && isStr(value.lowerThird.title) && isStr(value.lowerThird.subtitle) &&
    Array.isArray(value.metrics) && value.metrics.every(metric =>
      isRec(metric) && isStr(metric.key) && isStr(metric.label) && isNum(metric.value) && isStr(metric.unit)) &&
    orNull(isStr)(value.teamId) && isStrArray(value.playerIds) && isStrArray(value.sourceEventIds) &&
    (value.sourceWindow === null || (isRec(value.sourceWindow) && isInt(value.sourceWindow.startMs) && isInt(value.sourceWindow.endMs))) &&
    isStr(value.rule) && orNull(isStr)(value.scenarioId) && value.synthetic === true
}

function isComplete(value: unknown): value is MatchComplete {
  return isRec(value) && value.matchId === MATCH_ID && isInt(value.eventCount) && isInt(value.momentumCount) &&
    isInt(value.overlayCount) && isScore(value.finalScore)
}

export function parseMatchMetadata(value: unknown): MatchMetadata {
  if (!isMetadata(value)) throw new Error('The match description is not a valid synthetic match.')
  return value
}

function admitCue(cue: OverlayCue, gated: boolean): OverlayCue {
  if (!gated) {
    if ('approval' in cue) throw new Error('The preview stream carried an operator approval, which only the gated program feed may carry.')
    return cue
  }
  const approval = parseApproval(cue.approval)
  if (!approval) throw new Error('The program feed carried a cue without a valid operator approval, so it was not shown.')
  return { ...cue, approval }
}

/** `gated` marks the operator-gated program feed, where every cue must carry its approval and nothing else may. */
export function parseMatchStreamMessage(raw: string, gated = false): MatchStreamMessage {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The match stream sent invalid JSON.')
  }
  if (!isRec(parsed) || parsed.schemaVersion !== FEED_SCHEMA_VERSION || !isRec(parsed.payload) || typeof parsed.type !== 'string') {
    throw new Error('The match stream message has an unsupported shape or schema version.')
  }
  if (parsed.type === 'match' && isMetadata(parsed.payload)) return { type: 'match', payload: parsed.payload }
  if (parsed.type === 'event' && isEvent(parsed.payload)) return { type: 'event', payload: parsed.payload }
  if (parsed.type === 'momentum' && isMomentum(parsed.payload)) return { type: 'momentum', payload: parsed.payload }
  if (parsed.type === 'overlay' && isCue(parsed.payload)) return { type: 'overlay', payload: admitCue(parsed.payload, gated) }
  if (parsed.type === 'complete' && isComplete(parsed.payload)) return { type: 'complete', payload: parsed.payload }
  throw new Error('The match stream message contains invalid data.')
}

export interface MatchStreamOptions {
  readonly speed: number
  readonly fromSeconds: number
  /** Opt-in causal processing; the default remains the curated replay. */
  readonly incremental?: boolean
  /** When set, the stream is the operator-gated program feed of that session; speed and start are the session's own. */
  readonly sessionId?: string
}

export interface MatchStreamHandlers {
  readonly onMessage: (message: MatchStreamMessage) => void
  readonly onReconnecting: () => void
  readonly onError: (message: string) => void
}

export interface MatchStreamClient {
  connect: (options: MatchStreamOptions, handlers: MatchStreamHandlers) => () => void
}

interface EventSourceLike {
  close: () => void
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  readonly readyState: number
}

type EventSourceFactory = (url: string) => EventSourceLike

export function createMatchStreamClient(
  createSource: EventSourceFactory = url => new EventSource(url),
): MatchStreamClient {
  return {
    connect(options, handlers) {
      const { sessionId } = options
      const gated = sessionId !== undefined
      if (gated && options.incremental) throw new Error('Incremental simulation cannot use an operator-gated replay session.')
      if (gated && !SESSION_ID_PATTERN.test(sessionId)) {
        throw new Error('The operator-gated session identifier is not valid.')
      }
      if (!gated && (!Number.isFinite(options.speed) || options.speed < 1 || options.speed > 1000)) {
        throw new Error('Playback speed must be between 1 and 1000.')
      }
      const source = createSource(gated
        ? `/api/matches/${MATCH_ID}/sessions/${sessionId}/program`
        : `/api/matches/${MATCH_ID}/${options.incremental ? 'live' : 'stream'}?speed=${options.speed}&fromSeconds=${Math.max(0, Math.floor(options.fromSeconds))}`)
      let metadata: MatchMetadata | null = null
      let lastSequence = 0
      let closed = false

      function fail(message: string) {
        closed = true
        source.close()
        handlers.onError(message)
      }

      source.onmessage = message => {
        if (closed) return
        try {
          const envelope = parseMatchStreamMessage(message.data, gated)
          if (envelope.type === 'match') {
            metadata = envelope.payload
          } else if (!metadata) {
            throw new Error('The match stream sent data before describing the match.')
          } else if (envelope.type === 'event') {
            const { teamId, sequence } = envelope.payload
            if (teamId !== metadata.homeTeam.teamId && teamId !== metadata.awayTeam.teamId) {
              throw new Error('The match stream sent an event for an unannounced team.')
            }
            if (sequence <= lastSequence) return
            if (sequence !== lastSequence + 1) throw new Error('The match stream skipped an event.')
            lastSequence = sequence
          } else if (envelope.type === 'complete') {
            closed = true
            source.close()
          }
          handlers.onMessage(envelope)
        } catch (error) {
          fail(error instanceof Error ? error.message : 'The match stream message could not be validated.')
        }
      }

      source.onerror = () => {
        if (closed) return
        if (source.readyState === 2) fail('The match stream closed before full time.')
        else handlers.onReconnecting()
      }

      return () => {
        if (closed) return
        closed = true
        source.close()
      }
    },
  }
}

export const matchStreamClient = createMatchStreamClient()

export async function fetchMatchMetadata(signal?: AbortSignal): Promise<MatchMetadata> {
  const response = await fetch(`/api/matches/${MATCH_ID}`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`The match description could not be loaded (HTTP ${response.status}).`)
  if (!(response.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new Error('The match description response was not JSON.')
  }
  return parseMatchMetadata(await response.json())
}
