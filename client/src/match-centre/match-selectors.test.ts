import { describe, expect, it, vi } from 'vitest'
import { cuesForFan, playerStats, playerTimeline, recentEvents, teamStats } from './match-selectors'
import { cue, event, metadata, resetSequence } from './match-test-data'
import { defaultProfile, loadProfile, parseProfile, PROFILE_STORAGE_KEY, resolveProfile, saveProfile } from './profile'

function pass(playerId: string, outcome: string, distanceM: number, difficulty: number, teamId = 'COMETS') {
  return event({
    teamId, playerId, outcome,
    metrics: { distanceM, forwardM: 5, speedMps: 10, speedKph: 36, difficulty, underPressure: false, finalThird: false, sprint: null },
  })
}

describe('team and player statistics', () => {
  it('summarises passes, carries and shots only from declared metrics', () => {
    resetSequence()
    const events = [
      pass('COMETS-07', 'COMPLETE', 10, 20),
      pass('COMETS-07', 'COMPLETE', 30, 90),
      pass('COMETS-07', 'INCOMPLETE', 20, 50),
      pass('LANTERNS-06', 'COMPLETE', 15, 30, 'LANTERNS'),
      event({ eventType: 'CARRY', playerId: 'COMETS-07', outcome: 'COMPLETE', metrics: { distanceM: 20, forwardM: 18, speedMps: 7.4, speedKph: 26.6, difficulty: null, underPressure: null, finalThird: false, sprint: true } }),
      event({ eventType: 'SHOT', playerId: 'COMETS-09', outcome: 'ON_TARGET', metrics: { distanceM: 12, forwardM: 12, speedMps: 30, speedKph: 108, difficulty: null, underPressure: null, finalThird: true, sprint: null } }),
      event({ eventType: 'PRESSURE', playerId: 'COMETS-04', metrics: null }),
    ]
    const home = teamStats(events, 'COMETS')

    expect(home).toMatchObject({
      ballActions: 5, passes: 3, passesCompleted: 2, passAccuracyPct: 67, avgPassDistanceM: 20, avgPassDifficulty: 53.3,
      carries: 1, sprints: 1, topCarrySpeedMps: 7.4, shots: 1, shotsOnTarget: 1, topShotSpeedKph: 108,
    })
    expect(home.hardestPass).toMatchObject({ difficulty: 90, playerId: 'COMETS-07' })
    expect(teamStats(events, 'LANTERNS').passAccuracyPct).toBe(100)
    expect(teamStats([], 'COMETS')).toMatchObject({ passAccuracyPct: null, avgPassDifficulty: null, hardestPass: null, topShotSpeedKph: null })

    expect(playerStats(events, 'COMETS-07')).toMatchObject({
      involvements: 4, passes: 3, passesCompleted: 2, carries: 1, carryDistanceM: 20, topCarrySpeedMps: 7.4, shots: 0, topShotSpeedKph: null,
    })
    expect(playerStats(events, 'COMETS-09')).toMatchObject({ shots: 1, shotsOnTarget: 1, topShotSpeedKph: 108 })
    expect(playerStats(events, 'COMETS-99').involvements).toBe(0)
  })

  it('returns the newest involvements for a player and the events inside the visible window', () => {
    resetSequence()
    const events = Array.from({ length: 10 }, (_, index) => event({ matchClockMs: 1000 * (index + 1), playerId: index % 2 ? 'COMETS-09' : 'COMETS-07' }))
    expect(playerTimeline(events, 'COMETS-09', 3).map(item => item.sequence)).toEqual([10, 8, 6])
    expect(recentEvents(events, 10_000, 3000).map(item => item.sequence)).toEqual([8, 9, 10])
    expect(recentEvents(events, 10_000, 500).map(item => item.sequence)).toEqual([10])
    expect(recentEvents([], 10_000)).toEqual([])
  })

  it('keeps important cues for everyone and low-priority ones only for the chosen club or player', () => {
    const goal = cue({ overlayId: 'A', priority: 3, teamId: 'LANTERNS', playerIds: ['LANTERNS-09'] })
    const mineByClub = cue({ overlayId: 'B', priority: 1, teamId: 'COMETS', playerIds: [] })
    const mineByPlayer = cue({ overlayId: 'C', priority: 1, teamId: 'LANTERNS', playerIds: ['LANTERNS-06'] })
    const other = cue({ overlayId: 'D', priority: 1, teamId: 'LANTERNS', playerIds: [] })
    const ids = (clubId: string | null, playerId: string | null) => cuesForFan([goal, mineByClub, mineByPlayer, other], clubId, playerId).map(item => item.overlayId)
    expect(ids('COMETS', null)).toEqual(['A', 'B'])
    expect(ids('COMETS', 'LANTERNS-06')).toEqual(['A', 'B', 'C'])
  })
})

describe('audience profile', () => {
  it('treats stored text as untrusted and falls back to safe defaults', () => {
    expect(parseProfile(null)).toEqual(defaultProfile)
    expect(parseProfile('not json')).toEqual(defaultProfile)
    expect(parseProfile('"string"')).toEqual(defaultProfile)
    expect(parseProfile(JSON.stringify({ persona: 'admin', clubId: '<script>', playerId: 42 }))).toEqual(defaultProfile)
    expect(parseProfile(JSON.stringify({ persona: 'studio', clubId: 'COMETS', playerId: 'COMETS-07' })))
      .toEqual({ persona: 'studio', clubId: 'COMETS', playerId: 'COMETS-07' })
  })

  it('repairs a profile against the announced rosters', () => {
    expect(resolveProfile(defaultProfile, metadata)).toEqual({ persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09' })
    expect(resolveProfile({ persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06' }, metadata))
      .toEqual({ persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06' })
    expect(resolveProfile({ persona: 'fan', clubId: 'GHOSTS', playerId: 'GHOSTS-01' }, metadata))
      .toEqual({ persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09' })
    expect(resolveProfile({ persona: 'fan', clubId: 'LANTERNS', playerId: null }, metadata).playerId).toBe('LANTERNS-09')
  })

  it('round-trips through storage and survives unavailable or throwing storage', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    saveProfile(storage, { persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06' })
    expect(values.has(PROFILE_STORAGE_KEY)).toBe(true)
    expect(loadProfile(storage)).toEqual({ persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06' })

    const broken = { getItem: vi.fn(() => { throw new Error('denied') }), setItem: vi.fn(() => { throw new Error('full') }) }
    expect(loadProfile(broken)).toEqual(defaultProfile)
    expect(() => saveProfile(broken, defaultProfile)).not.toThrow()
    expect(loadProfile(null)).toEqual(defaultProfile)
    expect(() => saveProfile(null, defaultProfile)).not.toThrow()
  })
})
