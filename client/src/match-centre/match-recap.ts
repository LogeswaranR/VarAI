import { formatClock, playerOf, teamOf } from './match-model'
import type { MatchEvent, MatchMetadata, Score } from './match-model'
import { playerStats, teamStats } from './match-selectors'
import type { MatchState } from './match-state'
import type { AudienceProfile } from './profile'

export type RecapCheckpoint = 'latest' | 'half-time'

export interface RecapClaim {
  readonly id: string
  readonly text: string
  readonly sourceEventIds: readonly string[]
  readonly sourceWindow: { readonly startMs: number; readonly endMs: number }
}

export interface MatchRecap {
  readonly schemaVersion: '1.0'
  readonly matchId: string
  readonly stage: 'LIVE' | 'HALF_TIME' | 'FULL_TIME'
  readonly throughMs: number
  readonly score: Score
  readonly source: 'DETERMINISTIC'
  readonly language: 'en'
  readonly synthetic: true
  readonly operatorApproved: false
  readonly audience: AudienceProfile['persona']
  readonly clubId: string | null
  readonly playerId: string | null
  readonly headline: string
  readonly story: readonly RecapClaim[]
  readonly turningPoints: readonly RecapClaim[]
}

export function hasHalfTime(events: readonly MatchEvent[]) {
  return events.some(item => item.eventType === 'PERIOD_END' && item.period === 1)
}

export function buildMatchRecap(
  metadata: MatchMetadata,
  state: Pick<MatchState, 'events' | 'clockMs' | 'status' | 'complete'>,
  profile: AudienceProfile,
  checkpoint: RecapCheckpoint = 'latest',
): MatchRecap | null {
  const halfTime = state.events.find(item => item.eventType === 'PERIOD_END' && item.period === 1 && item.matchClockMs <= state.clockMs)
  const atHalfTime = halfTime !== undefined && (checkpoint === 'half-time' ||
    !state.events.some(item => item.period > 1 && item.matchClockMs <= state.clockMs))
  const throughMs = atHalfTime ? halfTime.matchClockMs : Math.min(state.clockMs, metadata.durationMs)
  const events = state.events.filter(item => item.matchClockMs <= throughMs && (!atHalfTime || item.period === 1))
  if (events.length === 0) return null

  const scored = events.filter(item => item.scoreAfter !== null)
  const score = scored.at(-1)?.scoreAfter ?? metadata.startingScore
  const complete = state.complete
  const fullTime = !atHalfTime && state.status === 'complete' && complete !== null &&
    complete.eventCount === events.length && score.home === complete.finalScore.home && score.away === complete.finalScore.away &&
    events.some(item => item.eventType === 'PERIOD_END' && item.matchClockMs === metadata.durationMs)
  const stage = atHalfTime ? 'HALF_TIME' : fullTime ? 'FULL_TIME' : 'LIVE'
  const label = stage === 'FULL_TIME' ? 'Full-time recap' : stage === 'HALF_TIME' ? 'Half-time recap' : 'Match so far'
  const home = metadata.homeTeam
  const away = metadata.awayTeam
  const scoreline = (value: Score) => `${home.shortName} ${value.home}-${value.away} ${away.shortName}`
  const claim = (id: string, text: string, sources: readonly MatchEvent[]): RecapClaim => ({
    id, text, sourceEventIds: sources.map(item => item.eventId), sourceWindow: { startMs: 0, endMs: throughMs },
  })
  const points = events.filter(item => item.eventType === 'GOAL' ||
    (item.eventType === 'REVIEW' && item.outcome === 'GOAL_DISALLOWED'))
  const turningPoints = points.map(item => {
    const team = teamOf(metadata, item.teamId)
    const scorer = playerOf(metadata, item.playerId)
    const result = item.scoreAfter ? ` Score: ${scoreline(item.scoreAfter)}.` : ''
    const text = item.eventType === 'REVIEW'
      ? `At ${formatClock(item.matchClockMs)}, ${team?.shortName ?? item.teamId}'s awarded goal was disallowed.${result}`
      : `At ${formatClock(item.matchClockMs)}, ${scorer?.name ?? team?.shortName ?? item.teamId} was awarded a goal.${result}`
    return claim(item.eventId, text, [item])
  })

  const club = teamOf(metadata, profile.clubId)
  const leader = score.home > score.away ? home : score.away > score.home ? away : null
  const result = leader
    ? fullTime ? `${leader.name} won.` : `${leader.name} lead at this checkpoint.`
    : fullTime ? 'The match finished level.' : 'The teams are level at this checkpoint.'
  const perspective = club
    ? ` ${club.name}: ${score.home === score.away ? 'level' : leader?.teamId === club.teamId ? 'ahead' : 'behind'}${fullTime ? ' at full time' : ''}.`
    : ''
  const story: RecapClaim[] = [
    claim('result', `${scoreline(score)} at ${formatClock(throughMs)}. ${result}${profile.persona === 'fan' ? perspective : ''}`, scored),
  ]

  const lastPoint = points.at(-1)
  const previousScore = lastPoint
    ? scored.filter(item => item.sequence < lastPoint.sequence).at(-1)?.scoreAfter ?? metadata.startingScore
    : metadata.startingScore
  if (lastPoint?.eventType === 'GOAL' && lastPoint.scoreAfter?.home === score.home && lastPoint.scoreAfter?.away === score.away &&
    score.home === score.away && previousScore.home !== previousScore.away) {
    const team = teamOf(metadata, lastPoint.teamId)
    story.push(claim('equaliser',
      `${team?.name ?? lastPoint.teamId} equalised at ${formatClock(lastPoint.matchClockMs)}${fullTime ? ' and the score stayed level through full time' : ''}.`,
      [...scored.filter(item => item.sequence < lastPoint.sequence).slice(-1), ...scored.filter(item => item.sequence >= lastPoint.sequence)]))
  }
  const overturned = points.filter(item => item.eventType === 'REVIEW')
  if (overturned.length > 0) {
    story.push(claim('reviews',
      `${overturned.length} awarded ${overturned.length === 1 ? 'goal was' : 'goals were'} disallowed on review; the score above includes those reversals.`, overturned))
  }

  const homeStats = teamStats(events, home.teamId)
  const awayStats = teamStats(events, away.teamId)
  const actions = events.filter(item => item.eventType === 'PASS' || item.eventType === 'CARRY' || item.eventType === 'SHOT')
  if (profile.persona === 'analyst') {
    const accuracy = (stats: ReturnType<typeof teamStats>) =>
      stats.passAccuracyPct === null ? 'no pass attempts' : `${stats.passesCompleted}/${stats.passes} passes completed (${stats.passAccuracyPct}%)`
    story.push(claim('metrics',
      `${home.shortName}: ${accuracy(homeStats)}, ${homeStats.shots} shots. ${away.shortName}: ${accuracy(awayStats)}, ${awayStats.shots} shots.`, actions))
  } else if (actions.length > 0) {
    const more = homeStats.ballActions > awayStats.ballActions ? home : awayStats.ballActions > homeStats.ballActions ? away : null
    story.push(claim('rhythm', more
      ? `${more.name} had more recorded ball actions (passes, carries and shots). That describes activity, not possession time or chance quality.`
      : 'The teams recorded the same number of ball actions (passes, carries and shots).', actions))
  }

  const firstHalf = actions.filter(item => item.period === 1)
  const secondHalf = actions.filter(item => item.period === 2)
  if (firstHalf.length > 0 && secondHalf.length > 0) {
    const share = (items: readonly MatchEvent[]) => Math.round(100 * items.filter(item => item.teamId === home.teamId).length / items.length)
    const before = share(firstHalf)
    const after = share(secondHalf)
    story.push(claim('change',
      `${home.shortName}'s share of recorded ball actions ${after > before ? 'rose' : after < before ? 'fell' : 'stayed at the same rounded percentage'} from ${before}% in the first half to ${after}% after the interval. This is an activity comparison, not a measure of possession time.`, actions))
  }

  const player = playerOf(metadata, profile.playerId)
  if (player && profile.persona !== 'studio') {
    const stats = playerStats(events, player.playerId)
    story.push(claim('player',
      `${player.name}: ${stats.passesCompleted}/${stats.passes} passes completed, ${stats.shots} shots and ${stats.carryDistanceM} m carried with the ball. Only events tagged to this player are counted.`,
      events.filter(item => item.playerId === player.playerId)))
  }

  return {
    schemaVersion: '1.0', matchId: metadata.matchId, stage, throughMs, score, source: 'DETERMINISTIC', language: 'en',
    synthetic: true, operatorApproved: false, audience: profile.persona, clubId: profile.clubId, playerId: profile.playerId,
    headline: `${label}: ${scoreline(score)}`, story, turningPoints,
  }
}
