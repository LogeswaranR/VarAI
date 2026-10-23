import type { CueApproval } from './narration-model'

export const MATCH_ID = 'SYN-MATCH-01'
export const FEED_SCHEMA_VERSION = '2.0'
export const OVERLAY_SCHEMA_VERSION = '1.0'
export const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/

export const eventTypes = [
  'PASS', 'CARRY', 'PRESSURE', 'TACKLE', 'POSSESSION_CHANGE', 'SHOT', 'GOAL', 'FOUL', 'CARD', 'REVIEW',
  'PERIOD_START', 'PERIOD_END',
] as const
export type MatchEventType = typeof eventTypes[number]

export const momentumStates = ['CONTROL', 'BALANCED', 'CHAOS'] as const
export type MomentumState = typeof momentumStates[number]

export interface Score {
  readonly home: number
  readonly away: number
}

export interface MatchPlayer {
  readonly playerId: string
  readonly name: string
  readonly shirtNumber: number
  readonly role: string
}

export interface MatchTeam {
  readonly teamId: string
  readonly name: string
  readonly shortName: string
  readonly attackDirection: string
  readonly players: readonly MatchPlayer[]
}

export interface MatchHighlight {
  readonly highlightId: string
  readonly label: string
  readonly matchClockMs: number
}

export interface MatchMetadata {
  readonly matchId: string
  readonly pitch: { readonly lengthM: number; readonly widthM: number }
  readonly periods: readonly { readonly period: number; readonly startMs: number; readonly endMs: number }[]
  readonly durationMs: number
  readonly startingScore: Score
  readonly homeTeam: MatchTeam
  readonly awayTeam: MatchTeam
  readonly highlights: readonly MatchHighlight[]
  readonly seed: number
  readonly synthetic: true
}

export interface EventMetrics {
  readonly distanceM: number | null
  readonly forwardM: number | null
  readonly speedMps: number | null
  readonly speedKph: number | null
  readonly difficulty: number | null
  readonly underPressure: boolean | null
  readonly finalThird: boolean | null
  readonly sprint: boolean | null
}

export interface MatchEvent {
  readonly eventId: string
  readonly matchId: string
  readonly sequence: number
  readonly period: number
  readonly matchClockMs: number
  readonly teamId: string
  readonly playerId: string | null
  readonly eventType: MatchEventType
  readonly x: number
  readonly y: number
  readonly endX: number | null
  readonly endY: number | null
  readonly durationMs: number | null
  readonly outcome: string | null
  readonly receiverId: string | null
  readonly scoreAfter: Score | null
  readonly scenarioId: string | null
  readonly metrics: EventMetrics | null
  readonly description: string
  readonly synthetic: true
}

export interface MomentumSample {
  readonly minute: number
  readonly matchClockMs: number
  readonly windowSeconds: number
  readonly homeBallActionSharePct: number
  readonly controlIndex: number
  readonly turnovers: number
  readonly turnoversPerMinute: number
  readonly homePressures: number
  readonly awayPressures: number
  readonly state: MomentumState
  readonly controllingTeamId: string | null
}

export interface OverlayMetric {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly unit: string
}

export interface OverlayCue {
  readonly schemaVersion: typeof OVERLAY_SCHEMA_VERSION
  readonly overlayId: string
  readonly matchId: string
  readonly kind: string
  readonly priority: 1 | 2 | 3
  readonly inMs: number
  readonly outMs: number
  readonly durationMs: number
  readonly headline: string
  readonly detail: string
  readonly whyItMatters: string
  readonly lowerThird: { readonly title: string; readonly subtitle: string }
  readonly metrics: readonly OverlayMetric[]
  readonly teamId: string | null
  readonly playerIds: readonly string[]
  readonly sourceEventIds: readonly string[]
  readonly sourceWindow: { readonly startMs: number; readonly endMs: number } | null
  readonly rule: string
  readonly scenarioId: string | null
  readonly synthetic: true
  /** Present only on cues of an operator-gated program feed, where it proves a person released the cue. */
  readonly approval?: CueApproval
}

export interface MatchComplete {
  readonly matchId: string
  readonly eventCount: number
  readonly momentumCount: number
  readonly overlayCount: number
  readonly finalScore: Score
}

export type MatchStreamMessage =
  | { readonly type: 'match'; readonly payload: MatchMetadata }
  | { readonly type: 'event'; readonly payload: MatchEvent }
  | { readonly type: 'momentum'; readonly payload: MomentumSample }
  | { readonly type: 'overlay'; readonly payload: OverlayCue }
  | { readonly type: 'complete'; readonly payload: MatchComplete }

export function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export function teamOf(metadata: MatchMetadata, teamId: string | null) {
  if (teamId === metadata.homeTeam.teamId) return metadata.homeTeam
  if (teamId === metadata.awayTeam.teamId) return metadata.awayTeam
  return null
}

export function playerOf(metadata: MatchMetadata, playerId: string | null) {
  if (playerId === null) return null
  return [...metadata.homeTeam.players, ...metadata.awayTeam.players].find(player => player.playerId === playerId) ?? null
}
