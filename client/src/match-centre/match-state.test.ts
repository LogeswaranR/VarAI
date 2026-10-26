import { describe, expect, it } from 'vitest'
import type { MatchStreamMessage } from './match-model'
import { cueHoldMs, initialMatchState, matchReducer } from './match-state'
import type { MatchState } from './match-state'
import { approvedCue } from './gate-test-data'
import { cue, event, metadata, momentum, resetSequence } from './match-test-data'

const msg = <T extends MatchStreamMessage>(message: T) => message
const feed = (state: MatchState, ...messages: MatchStreamMessage[]) => matchReducer(state, { type: 'messages', messages })

function started() {
  resetSequence()
  return matchReducer(matchReducer(initialMatchState, { type: 'metadata', metadata }), { type: 'connecting', fromSeconds: 0 })
}

describe('match reducer', () => {
  it('starts from the announced score and clears everything on a new run', () => {
    let state = feed(started(), msg({ type: 'event', payload: event({ scoreAfter: { home: 1, away: 0 } }) }))
    expect(state.score).toEqual({ home: 1, away: 0 })
    state = matchReducer(state, { type: 'connecting', fromSeconds: 0 })
    expect(state).toMatchObject({ status: 'connecting', events: [], overlays: [], momentum: [], clockMs: 0, score: { home: 0, away: 0 } })
    expect(state.metadata).toBe(metadata)
  })

  it('accumulates events, advances the clock and follows the score the server reports', () => {
    const first = event({ matchClockMs: 4_000_000 })
    const goal = event({ eventType: 'GOAL', matchClockMs: 4_041_000, scoreAfter: { home: 1, away: 0 } })
    const overturned = event({ eventType: 'REVIEW', matchClockMs: 4_072_000, scoreAfter: { home: 0, away: 0 } })
    const state = feed(started(),
      msg({ type: 'match', payload: metadata }), msg({ type: 'event', payload: first }),
      msg({ type: 'event', payload: goal }), msg({ type: 'event', payload: overturned }))

    expect(state.status).toBe('streaming')
    expect(state.events).toHaveLength(3)
    expect(state.clockMs).toBe(4_072_000)
    expect(state.score).toEqual({ home: 0, away: 0 })
  })

  it('ignores replayed events, momentum samples and cues after a reconnect', () => {
    const item = event()
    const sample = momentum()
    const overlay = cue()
    const once = feed(started(), msg({ type: 'event', payload: item }), msg({ type: 'momentum', payload: sample }), msg({ type: 'overlay', payload: overlay }))
    const twice = feed(once, msg({ type: 'event', payload: item }), msg({ type: 'momentum', payload: sample }), msg({ type: 'overlay', payload: overlay }))
    expect(twice.events).toHaveLength(1)
    expect(twice.momentum).toHaveLength(1)
    expect(twice.overlays).toHaveLength(1)
  })

  it('puts the highest-priority fresh cue on air and never lets a lower one displace it', () => {
    const goal = cue({ overlayId: 'OV-GOAL', priority: 3, inMs: 4_041_800 })
    const sprint = cue({ overlayId: 'OV-SPRINT', priority: 1, inMs: 4_042_000 })
    const later = cue({ overlayId: 'OV-CARD', priority: 2, inMs: 4_050_000 })
    let state = feed(started(), msg({ type: 'overlay', payload: goal }))
    expect(state.presented?.overlayId).toBe('OV-GOAL')
    state = feed(state, msg({ type: 'overlay', payload: sprint }))
    expect(state.presented?.overlayId).toBe('OV-GOAL')
    state = feed(state, msg({ type: 'overlay', payload: later }))
    expect(state.presented?.overlayId).toBe('OV-GOAL')
    state = matchReducer(state, { type: 'hideCue', overlayId: 'OV-GOAL' })
    expect(state.presented).toBeNull()
    state = feed(state, msg({ type: 'overlay', payload: cue({ overlayId: 'OV-NEXT', priority: 1, inMs: 4_060_000 }) }))
    expect(state.presented?.overlayId).toBe('OV-NEXT')
  })

  it('treats cues at or before the jump point as catch-up history and puts later ones on air, whatever the batch size', () => {
    resetSequence()
    const jumped = matchReducer(matchReducer(initialMatchState, { type: 'metadata', metadata }), { type: 'connecting', fromSeconds: 4000 })
    const old = cue({ overlayId: 'OV-OLD', priority: 3, inMs: 1_000_000 })
    const boundary = cue({ overlayId: 'OV-BOUNDARY', priority: 3, inMs: 4_000_000 })
    const live = cue({ overlayId: 'OV-LIVE', priority: 1, inMs: 4_001_000 })
    const farLater = cue({ overlayId: 'OV-LATER', priority: 1, inMs: 4_300_000 })
    const state = feed(jumped, msg({ type: 'overlay', payload: old }), msg({ type: 'overlay', payload: boundary }),
      msg({ type: 'overlay', payload: live }), msg({ type: 'event', payload: event({ matchClockMs: 4_400_000 }) }),
      msg({ type: 'overlay', payload: farLater }))
    expect(state.overlays).toHaveLength(4)
    expect(state.presented?.overlayId).toBe('OV-LATER')
    expect(feed(jumped, msg({ type: 'overlay', payload: old }), msg({ type: 'overlay', payload: boundary })).presented).toBeNull()
  })

  it('ignores a hide request for a cue that is no longer on air', () => {
    const state = feed(started(), msg({ type: 'overlay', payload: cue({ overlayId: 'OV-A' }) }))
    expect(matchReducer(state, { type: 'hideCue', overlayId: 'OV-OTHER' })).toBe(state)
  })

  it('completes only when every announced event, sample and cue arrived', () => {
    const complete = { matchId: 'SYN-MATCH-01', eventCount: 1, momentumCount: 1, overlayCount: 1, finalScore: { home: 1, away: 1 } }
    const all = feed(started(), msg({ type: 'event', payload: event() }), msg({ type: 'momentum', payload: momentum() }),
      msg({ type: 'overlay', payload: cue() }), msg({ type: 'complete', payload: complete }))
    expect(all.status).toBe('complete')

    const missing = feed(started(), msg({ type: 'event', payload: event() }), msg({ type: 'complete', payload: complete }))
    expect(missing.status).toBe('error')
    expect(missing.message).toContain('before every event')
  })

  it('does not revive a stopped or failed run when late data arrives', () => {
    const stopped = matchReducer(started(), { type: 'status', status: 'stopped' })
    expect(feed(stopped, msg({ type: 'event', payload: event() })).status).toBe('stopped')
    const failed = matchReducer(started(), { type: 'status', status: 'error', message: 'boom' })
    expect(feed(failed, msg({ type: 'event', payload: event() }))).toMatchObject({ status: 'error', message: 'boom' })
  })

  it('holds a cue for at least a readable real-time duration at demo speeds', () => {
    expect(cueHoldMs(cue({ priority: 3, durationMs: 9000 }), 1)).toBe(9000)
    expect(cueHoldMs(cue({ priority: 3, durationMs: 9000 }), 120)).toBe(8000)
    expect(cueHoldMs(cue({ priority: 2, durationMs: 7000 }), 60)).toBe(6000)
    expect(cueHoldMs(cue({ priority: 1, durationMs: 5000 }), 600)).toBe(4500)
  })
})

describe('operator-gated program state', () => {
  const gatedStart = (fromSeconds = 5280) => {
    resetSequence()
    return matchReducer(matchReducer(initialMatchState, { type: 'metadata', metadata }), { type: 'connecting', fromSeconds, gated: true })
  }
  const complete = { matchId: 'SYN-MATCH-01', eventCount: 1, momentumCount: 1, overlayCount: 29, finalScore: { home: 1, away: 1 } }

  it('marks a run as gated only when it connects as gated, and a preview run clears the mark', () => {
    expect(initialMatchState.gated).toBe(false)
    expect(gatedStart().gated).toBe(true)
    expect(matchReducer(gatedStart(), { type: 'connecting', fromSeconds: 0 }).gated).toBe(false)
  })

  it('completes with fewer cues than the completion marker counts, because held cues and cues before the start never air', () => {
    const aired = feed(gatedStart(), msg({ type: 'event', payload: event() }), msg({ type: 'momentum', payload: momentum() }),
      msg({ type: 'overlay', payload: approvedCue({ inMs: 5_291_200 }) }), msg({ type: 'complete', payload: complete }))
    expect(aired).toMatchObject({ status: 'complete', message: null })
    expect(aired.overlays).toHaveLength(1)

    const nothingApproved = feed(gatedStart(), msg({ type: 'event', payload: event() }), msg({ type: 'momentum', payload: momentum() }),
      msg({ type: 'complete', payload: complete }))
    expect(nothingApproved.status).toBe('complete')
  })

  it('still fails when events or momentum samples are missing, and when more cues arrive than the match has', () => {
    const missingEvent = feed(gatedStart(), msg({ type: 'momentum', payload: momentum() }), msg({ type: 'complete', payload: complete }))
    expect(missingEvent.status).toBe('error')
    const tooMany = feed(gatedStart(), msg({ type: 'event', payload: event() }), msg({ type: 'momentum', payload: momentum() }),
      msg({ type: 'overlay', payload: approvedCue({ overlayId: 'A', inMs: 5_291_200 }) }),
      msg({ type: 'overlay', payload: approvedCue({ overlayId: 'B', inMs: 5_292_200 }) }),
      msg({ type: 'complete', payload: { ...complete, overlayCount: 1 } }))
    expect(tooMany.status).toBe('error')
  })

  it('keeps the preview rule that every cue must arrive before full time', () => {
    resetSequence()
    const preview = matchReducer(matchReducer(initialMatchState, { type: 'metadata', metadata }), { type: 'connecting', fromSeconds: 0 })
    const state = feed(preview, msg({ type: 'event', payload: event() }), msg({ type: 'momentum', payload: momentum() }), msg({ type: 'complete', payload: complete }))
    expect(state.status).toBe('error')
  })

  it('never keeps or puts on air a cue without an approval, even if one is delivered to a gated run', () => {
    const state = feed(gatedStart(), msg({ type: 'overlay', payload: cue({ overlayId: 'UNAPPROVED', priority: 3, inMs: 5_291_200 }) }),
      msg({ type: 'overlay', payload: approvedCue({ overlayId: 'APPROVED', priority: 1, inMs: 5_292_000 }) }))
    expect(state.overlays.map(item => item.overlayId)).toEqual(['APPROVED'])
    expect(state.presented?.overlayId).toBe('APPROVED')
    expect(JSON.stringify(state)).not.toContain('UNAPPROVED')
  })

  it('puts an approved cue on air by the same priority rules as the preview, and treats history before the start as history', () => {
    const early = approvedCue({ overlayId: 'EARLY', priority: 3, inMs: 5_000_000 })
    const goal = approvedCue({ overlayId: 'GOAL', priority: 3, inMs: 5_291_200 })
    const sprint = approvedCue({ overlayId: 'SPRINT', priority: 1, inMs: 5_300_000 })
    const state = feed(gatedStart(), msg({ type: 'overlay', payload: early }), msg({ type: 'overlay', payload: goal }), msg({ type: 'overlay', payload: sprint }))
    expect(state.presented?.overlayId).toBe('GOAL')
    expect(feed(gatedStart(), msg({ type: 'overlay', payload: early })).presented).toBeNull()
  })

  it('resets to an idle view of the same match, so one mode\'s cues, events and status never show in the other', () => {
    const running = feed(gatedStart(), msg({ type: 'event', payload: event({ scoreAfter: { home: 1, away: 0 } }) }),
      msg({ type: 'overlay', payload: approvedCue({ inMs: 5_291_200 }) }))
    const reset = matchReducer(running, { type: 'reset' })
    expect(reset).toMatchObject({
      status: 'idle', message: null, events: [], momentum: [], overlays: [], presented: null, clockMs: 0, score: { home: 0, away: 0 }, gated: false,
    })
    expect(reset.metadata).toBe(metadata)
  })
})
