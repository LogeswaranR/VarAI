import { beforeEach, describe, expect, it } from 'vitest'
import { buildMatchRecap } from './match-recap'
import type { MatchEvent } from './match-model'
import { initialMatchState } from './match-state'
import { event, metadata, resetSequence } from './match-test-data'
import type { AudienceProfile } from './profile'

const fan: AudienceProfile = { persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09' }
beforeEach(resetSequence)

function match() {
  return [
    event({ eventType: 'PERIOD_START', period: 1, matchClockMs: 0, playerId: null, scoreAfter: { home: 0, away: 0 } }),
    event({ period: 1, matchClockMs: 1000 }),
    event({ eventType: 'PERIOD_END', period: 1, matchClockMs: 2_700_000, playerId: null, scoreAfter: { home: 0, away: 0 } }),
    event({ eventType: 'PERIOD_START', period: 2, matchClockMs: 2_700_000, playerId: null, scoreAfter: { home: 0, away: 0 } }),
    event({ eventType: 'GOAL', matchClockMs: 4_041_000, scoreAfter: { home: 1, away: 0 } }),
    event({ eventType: 'REVIEW', matchClockMs: 4_080_000, outcome: 'GOAL_DISALLOWED', scoreAfter: { home: 0, away: 0 } }),
    event({ eventType: 'GOAL', matchClockMs: 4_852_400, teamId: 'LANTERNS', playerId: 'LANTERNS-09', scoreAfter: { home: 0, away: 1 } }),
    event({ eventType: 'GOAL', matchClockMs: 5_290_400, scoreAfter: { home: 1, away: 1 } }),
    event({ eventType: 'PERIOD_END', matchClockMs: metadata.durationMs, playerId: null, scoreAfter: { home: 1, away: 1 } }),
  ]
}

function state(events: readonly MatchEvent[], complete = true) {
  return {
    ...initialMatchState, events, clockMs: events.at(-1)?.matchClockMs ?? 0,
    status: complete ? 'complete' as const : 'streaming' as const,
    complete: complete ? { matchId: metadata.matchId, eventCount: events.length, momentumCount: 0, overlayCount: 0, finalScore: { home: 1, away: 1 } } : null,
  }
}

describe('evidence-backed match recap', () => {
  it('does not create a story before any event has arrived', () => {
    expect(buildMatchRecap(metadata, initialMatchState, fan)).toBeNull()
  })

  it('summarises the actual final result, reversal and equaliser rather than counting awarded goals', () => {
    const events = match()
    const recap = buildMatchRecap(metadata, state(events), fan)!
    expect(recap.stage).toBe('FULL_TIME')
    expect(recap.score).toEqual({ home: 1, away: 1 })
    expect(recap.headline).toBe('Full-time recap: AVC 1-1 BRL')
    expect(recap.story.map(claim => claim.text).join(' ')).toContain('equalised at 88:10 and the score stayed level through full time')
    expect(recap.story.map(claim => claim.text).join(' ')).toContain('1 awarded goal was disallowed')
    expect(recap.turningPoints).toHaveLength(4)
    expect(recap.turningPoints[1].text).toContain("AVC's awarded goal was disallowed")
    expect(recap).toMatchObject({ synthetic: true, source: 'DETERMINISTIC', operatorApproved: false, language: 'en', schemaVersion: '1.0' })
    for (const claim of [...recap.story, ...recap.turningPoints]) {
      expect(claim.sourceEventIds.every(id => events.some(item => item.eventId === id))).toBe(true)
      expect(claim.sourceWindow.endMs).toBe(metadata.durationMs)
    }
  })

  it('has prefix invariance: later events cannot change a recap at an earlier clock', () => {
    const events = match()
    const prefix = events.slice(0, 5)
    const snapshot = state(prefix, false)
    const expected = buildMatchRecap(metadata, snapshot, fan)
    expect(buildMatchRecap(metadata, { ...snapshot, events }, fan)).toEqual(expected)
    expect(expected?.stage).toBe('LIVE')
    expect(expected?.turningPoints).toHaveLength(1)
    expect(JSON.stringify(expected)).not.toContain('disallowed')
    expect(JSON.stringify(expected)).not.toContain('equalised')
  })

  it('freezes halftime without including second-half events at the same timestamp or later', () => {
    const events = match()
    const recap = buildMatchRecap(metadata, state(events), fan, 'half-time')!
    expect(recap.stage).toBe('HALF_TIME')
    expect(recap.score).toEqual({ home: 0, away: 0 })
    expect(recap.throughMs).toBe(2_700_000)
    expect(recap.turningPoints).toEqual([])
    expect(recap).toEqual(buildMatchRecap(metadata, state(events.slice(0, 3), false), fan))
    expect(recap.story.flatMap(claim => claim.sourceEventIds)).not.toContain(events[3].eventId)
  })

  it('does not call a stopped, broken, mismatched or unconfirmed stream full-time', () => {
    const events = match()
    const finished = state(events)
    for (const status of ['stopped', 'error', 'reconnecting', 'streaming'] as const) {
      expect(buildMatchRecap(metadata, { ...finished, status }, fan)?.stage).toBe('LIVE')
    }
    expect(buildMatchRecap(metadata, { ...finished, complete: null }, fan)?.stage).toBe('LIVE')
    expect(buildMatchRecap(metadata, { ...finished, complete: { ...finished.complete!, finalScore: { home: 3, away: 1 } } }, fan)?.stage).toBe('LIVE')
    expect(buildMatchRecap(metadata, state(events.slice(0, -1)), fan)?.stage).toBe('LIVE')
  })

  it('produces distinct fan, analyst and studio stories and follows the selected club/player', () => {
    const current = state(match())
    const fanRecap = buildMatchRecap(metadata, current, fan)!
    const analyst = buildMatchRecap(metadata, current, { ...fan, persona: 'analyst' })!
    const studio = buildMatchRecap(metadata, current, { ...fan, persona: 'studio' })!
    expect(fanRecap.story[0].text).toContain('Alder Vale Comets: level at full time')
    expect(analyst.story.find(claim => claim.id === 'metrics')?.text).toContain('1/1 passes completed (100%)')
    expect(studio.story.some(claim => claim.id === 'player')).toBe(false)
    expect(studio.story).not.toEqual(fanRecap.story)
    const away = buildMatchRecap(metadata, current, { ...fan, clubId: 'LANTERNS', playerId: 'LANTERNS-09', language: 'ta' })!
    expect(away.story[0].text).toContain('Brindle Reach Lanterns: level at full time')
    expect(away.story.find(claim => claim.id === 'player')?.text).toContain('Zane Ostrander')
    expect(away.language).toBe('en')
  })

  it('supports a scoreless match and never treats missing pass data as a percentage', () => {
    const events = match().slice(0, 1)
    events.push(event({ eventType: 'PERIOD_END', matchClockMs: metadata.durationMs, playerId: null, scoreAfter: { home: 0, away: 0 } }))
    const current = state(events)
    const recap = buildMatchRecap(metadata, { ...current, complete: { ...current.complete!, finalScore: { home: 0, away: 0 } } },
      { ...fan, persona: 'analyst' })!
    expect(recap.stage).toBe('FULL_TIME')
    expect(recap.turningPoints).toEqual([])
    expect(recap.story.find(claim => claim.id === 'metrics')?.text).toContain('no pass attempts')
    expect(JSON.stringify(recap)).not.toContain('NaN')
  })

  it('compares activity across halves without calling event share possession', () => {
    const events = [
      event({ period: 1, matchClockMs: 1000 }),
      event({ period: 1, matchClockMs: 2000 }),
      event({ period: 2, matchClockMs: 3_000_000, teamId: 'LANTERNS', playerId: 'LANTERNS-09' }),
      event({ period: 2, matchClockMs: 3_001_000 }),
    ]
    const recap = buildMatchRecap(metadata, state(events, false), fan)!
    expect(recap.story.find(claim => claim.id === 'change')).toMatchObject({
      text: "AVC's share of recorded ball actions fell from 100% in the first half to 50% after the interval. This is an activity comparison, not a measure of possession time.",
      sourceEventIds: events.map(item => item.eventId),
    })
  })
})
