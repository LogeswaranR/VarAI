import type { MatchEvent, OverlayCue, OverlayMetric } from './match-model'

export const speedChoices = [30, 60, 120, 300, 600] as const

const kindLabels: Readonly<Record<string, string>> = {
  GOAL: 'Goal',
  REVIEW_STARTED: 'Review',
  GOAL_DISALLOWED: 'Ruled out',
  CARD: 'Card',
  PRESS_TRAP: 'High press',
  SPRINT_CARRY: 'Sprint',
  HARD_PASS: 'Pass quality',
  SHOT_SPEED: 'Shot speed',
  MOMENTUM_SWING: 'Control',
  CHAOS_SPIKE: 'Chaos',
}

export function kindLabel(kind: string) {
  return kindLabels[kind] ?? kind.toLowerCase().replaceAll('_', ' ')
}

export function shortEventId(eventId: string) {
  return eventId.replace(/^.*-(E\d+)$/, '$1')
}

export function formatMetric(metric: OverlayMetric) {
  const value = Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)
  return metric.unit === '/100' ? `${value}/100` : `${value} ${metric.unit}`
}

export function eventLabel(eventType: MatchEvent['eventType']) {
  return eventType.toLowerCase().replaceAll('_', ' ')
}

export function cueIncludesTeamOrPlayer(cue: OverlayCue, clubId: string | null, playerId: string | null) {
  return cue.teamId === clubId || (playerId !== null && cue.playerIds.includes(playerId))
}

export function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
