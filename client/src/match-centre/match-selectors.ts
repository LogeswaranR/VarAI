import type { MatchEvent, OverlayCue } from './match-model'

export interface TeamStats {
  readonly ballActions: number
  readonly passes: number
  readonly passesCompleted: number
  readonly passAccuracyPct: number | null
  readonly avgPassDistanceM: number | null
  readonly avgPassDifficulty: number | null
  readonly hardestPass: { readonly difficulty: number; readonly eventId: string; readonly playerId: string | null } | null
  readonly carries: number
  readonly sprints: number
  readonly topCarrySpeedMps: number | null
  readonly shots: number
  readonly shotsOnTarget: number
  readonly topShotSpeedKph: number | null
}

export interface PlayerStats {
  readonly involvements: number
  readonly passes: number
  readonly passesCompleted: number
  readonly avgPassDistanceM: number | null
  readonly avgPassDifficulty: number | null
  readonly carries: number
  readonly carryDistanceM: number
  readonly topCarrySpeedMps: number | null
  readonly shots: number
  readonly shotsOnTarget: number
  readonly topShotSpeedKph: number | null
}

const round1 = (value: number) => Math.round(value * 10) / 10
const mean = (values: readonly number[]) => values.length === 0 ? null : round1(values.reduce((sum, value) => sum + value, 0) / values.length)
const maxOrNull = (values: readonly number[]) => values.length === 0 ? null : Math.max(...values)

function summarize(events: readonly MatchEvent[]) {
  const passes = events.filter(item => item.eventType === 'PASS')
  const completed = passes.filter(item => item.outcome === 'COMPLETE')
  const carries = events.filter(item => item.eventType === 'CARRY')
  const shots = events.filter(item => item.eventType === 'SHOT')
  const hardest = completed.reduce<MatchEvent | null>((best, item) =>
    (item.metrics?.difficulty ?? -1) > (best?.metrics?.difficulty ?? -1) ? item : best, null)
  return {
    passes, completed, carries, shots, hardest,
    avgDistance: mean(passes.flatMap(item => item.metrics?.distanceM ?? [])),
    avgDifficulty: mean(passes.flatMap(item => item.metrics?.difficulty ?? [])),
    topCarry: maxOrNull(carries.flatMap(item => item.metrics?.speedMps ?? [])),
    topShot: maxOrNull(shots.flatMap(item => item.metrics?.speedKph ?? [])),
    onTarget: shots.filter(item => item.outcome === 'ON_TARGET').length,
  }
}

export function teamStats(events: readonly MatchEvent[], teamId: string): TeamStats {
  const own = summarize(events.filter(item => item.teamId === teamId))
  return {
    ballActions: own.passes.length + own.carries.length + own.shots.length,
    passes: own.passes.length,
    passesCompleted: own.completed.length,
    passAccuracyPct: own.passes.length === 0 ? null : Math.round((own.completed.length / own.passes.length) * 100),
    avgPassDistanceM: own.avgDistance,
    avgPassDifficulty: own.avgDifficulty,
    hardestPass: own.hardest?.metrics?.difficulty == null ? null
      : { difficulty: own.hardest.metrics.difficulty, eventId: own.hardest.eventId, playerId: own.hardest.playerId },
    carries: own.carries.length,
    sprints: own.carries.filter(item => item.metrics?.sprint === true).length,
    topCarrySpeedMps: own.topCarry,
    shots: own.shots.length,
    shotsOnTarget: own.onTarget,
    topShotSpeedKph: own.topShot,
  }
}

export function playerStats(events: readonly MatchEvent[], playerId: string): PlayerStats {
  const own = events.filter(item => item.playerId === playerId)
  const summary = summarize(own)
  return {
    involvements: own.filter(item => item.eventType !== 'PERIOD_START' && item.eventType !== 'PERIOD_END').length,
    passes: summary.passes.length,
    passesCompleted: summary.completed.length,
    avgPassDistanceM: summary.avgDistance,
    avgPassDifficulty: summary.avgDifficulty,
    carries: summary.carries.length,
    carryDistanceM: Math.round(summary.carries.reduce((sum, item) => sum + (item.metrics?.distanceM ?? 0), 0)),
    topCarrySpeedMps: summary.topCarry,
    shots: summary.shots.length,
    shotsOnTarget: summary.onTarget,
    topShotSpeedKph: summary.topShot,
  }
}

export function recentEvents(events: readonly MatchEvent[], clockMs: number, windowMs = 25_000): readonly MatchEvent[] {
  let start = events.length
  while (start > 0 && events[start - 1].matchClockMs > clockMs - windowMs) start--
  return events.slice(start)
}

export function playerTimeline(events: readonly MatchEvent[], playerId: string, limit = 8): readonly MatchEvent[] {
  return events.filter(item => item.playerId === playerId).slice(-limit).reverse()
}

export function cuesForFan(cues: readonly OverlayCue[], clubId: string | null, playerId: string | null): readonly OverlayCue[] {
  return cues.filter(cue => cue.priority >= 2 || cue.teamId === clubId || (playerId !== null && cue.playerIds.includes(playerId)))
}
