import { describe, expect, it } from 'vitest'
import { decidedProposals, deskReducer, initialDeskState, pendingProposals, remainingMs, serverElapsedMs } from './desk-state'
import type { DeskAction, DeskState } from './desk-state'
import type { DeskMessage } from './gate-model'
import { goalCue, HASH, OTHER_HASH, operatorNarration, decision, englishText, proposal, session, fallbackNarration, tamilText } from './gate-test-data'

const message = (payload: DeskMessage, seq: number | null, atMs = 0): DeskAction => ({ type: 'message', message: payload, seq, atMs })
const sessionMessage = (elapsedMs = 100, atMs = 1000) => message({ type: 'session', payload: session({ elapsedMs }) }, 0, atMs)
const proposed = (approvalId: string, seq: number, deadlineMs: number) =>
  message({ type: 'proposal', payload: proposal({ approvalId, deadlineMs, proposedAtMs: deadlineMs - 20_000, payloadHash: HASH }) }, seq)
const decided = (approvalId: string, state: 'APPROVED' | 'HELD' | 'OVERRIDDEN' | 'AUTO_HELD', seq: number, extra = {}) =>
  message({ type: 'decision', payload: decision({ approvalId, state, ...extra }) }, seq)

const run = (...actions: DeskAction[]): DeskState => actions.reduce(deskReducer, { ...initialDeskState, connection: 'connecting' })

describe('operator desk reducer', () => {
  it('opens on the session message and records the server clock reading with the local one', () => {
    const state = run(sessionMessage(250, 4000))
    expect(state).toMatchObject({ connection: 'open', session: { sessionId: session().sessionId }, sync: { elapsedMs: 250, atMs: 4000 } })
  })

  it('collects proposals once each and lists pending ones by soonest deadline, decided ones by latest decision', () => {
    const state = run(sessionMessage(), proposed('APR-001', 1, 30_000), proposed('APR-002', 2, 25_000), proposed('APR-003', 3, 40_000),
      decided('APR-003', 'HELD', 4, { decidedAtMs: 7000 }), decided('APR-001', 'APPROVED', 5, { decidedAtMs: 9000 }))
    expect(state.proposals.map(item => item.approvalId)).toEqual(['APR-001', 'APR-002', 'APR-003'])
    expect(pendingProposals(state.proposals).map(item => item.approvalId)).toEqual(['APR-002'])
    expect(decidedProposals(state.proposals).map(item => item.approvalId)).toEqual(['APR-001', 'APR-003'])
  })

  it('applies a replay of the whole history after a reconnect without changing anything', () => {
    const history = [sessionMessage(), proposed('APR-001', 1, 21_000), proposed('APR-002', 2, 26_000), decided('APR-001', 'APPROVED', 3, { decidedAtMs: 8000 })]
    const once = run(...history)
    const twice = history.reduce(deskReducer, once)
    expect(twice.proposals).toEqual(once.proposals)
    expect(twice.lastSeq).toBe(3)
    expect(twice.proposals.find(item => item.approvalId === 'APR-001')?.state).toBe('APPROVED')
    expect(twice.proposals.find(item => item.approvalId === 'APR-002')?.state).toBe('PENDING')
  })

  it('merges by approval ID even when the stream gives no message numbers', () => {
    const withoutSeq = [sessionMessage(), message({ type: 'proposal', payload: proposal() }, null), message({ type: 'decision', payload: decision() }, null)]
    const once = run(...withoutSeq)
    const twice = withoutSeq.reduce(deskReducer, once)
    expect(twice.proposals).toHaveLength(1)
    expect(twice.proposals[0].state).toBe('APPROVED')
    expect(deskReducer(twice, message({ type: 'proposal', payload: proposal() }, null)).proposals[0].state).toBe('APPROVED')
  })

  it('moves a proposal to its final state and swaps in the hash and text an override produced', () => {
    const edited = { en: operatorNarration('en', englishText), ta: operatorNarration('ta', tamilText) }
    const state = run(sessionMessage(), proposed('APR-001', 1, 21_000),
      decided('APR-001', 'OVERRIDDEN', 2, { payloadHash: OTHER_HASH, decidedAtMs: 5000, note: 'Tamil reviewed by the desk', narrations: edited }))
    const [overridden] = state.proposals
    expect(overridden).toMatchObject({ state: 'OVERRIDDEN', payloadHash: OTHER_HASH, decidedAtMs: 5000, note: 'Tamil reviewed by the desk' })
    expect(overridden.narrations.ta.source).toBe('OPERATOR')
    expect(overridden.narrations.ta.text).toEqual(tamilText)
    expect(overridden.payloadHash).not.toBe(HASH)
  })

  it('records an automatic hold the same way as a decision', () => {
    const state = run(sessionMessage(), proposed('APR-001', 1, 21_000), decided('APR-001', 'AUTO_HELD', 2, { decidedAtMs: 21_005 }))
    expect(state.proposals[0]).toMatchObject({ state: 'AUTO_HELD', decidedAtMs: 21_005 })
  })

  it('treats a decision as final: a later, different outcome for the same proposal is ignored', () => {
    const state = run(sessionMessage(), proposed('APR-001', 1, 21_000), decided('APR-001', 'APPROVED', 2), decided('APR-001', 'HELD', 3))
    expect(state.proposals[0].state).toBe('APPROVED')
    expect(state.lastSeq).toBe(3)
  })

  it('ignores a decision for a proposal it never saw instead of inventing a card for it', () => {
    const state = run(sessionMessage(), decided('APR-009', 'APPROVED', 1))
    expect(state.proposals).toEqual([])
    expect(state.lastSeq).toBe(1)
  })

  it('shows a locally recorded decision at once and lets the stream message complete it with the text and note', () => {
    const base = run(sessionMessage(), proposed('APR-001', 1, 21_000))
    const recorded = deskReducer(base, { type: 'recorded', result: { approvalId: 'APR-001', state: 'OVERRIDDEN', payloadHash: OTHER_HASH, decidedAtMs: 4000 } })
    expect(recorded.proposals[0]).toMatchObject({ state: 'OVERRIDDEN', payloadHash: OTHER_HASH, decidedAtMs: 4000 })
    expect(recorded.proposals[0].narrations.ta.source).toBe('FALLBACK')

    const completed = deskReducer(recorded, decided('APR-001', 'OVERRIDDEN', 2, {
      payloadHash: OTHER_HASH, decidedAtMs: 4000, note: 'edited', narrations: { en: operatorNarration('en', englishText), ta: operatorNarration('ta', tamilText) },
    }))
    expect(completed.proposals[0]).toMatchObject({ state: 'OVERRIDDEN', note: 'edited' })
    expect(completed.proposals[0].narrations.ta.source).toBe('OPERATOR')
  })

  it('does not let a late local record overwrite a decision the stream already delivered', () => {
    const state = run(sessionMessage(), proposed('APR-001', 1, 21_000), decided('APR-001', 'HELD', 2))
    const after = deskReducer(state, { type: 'recorded', result: { approvalId: 'APR-001', state: 'APPROVED', payloadHash: HASH, decidedAtMs: 1 } })
    expect(after).toBe(state)
    expect(deskReducer(state, { type: 'recorded', result: { approvalId: 'APR-404', state: 'APPROVED', payloadHash: HASH, decidedAtMs: 1 } })).toBe(state)
  })

  it('ignores a session message about a different session', () => {
    const state = run(sessionMessage(100, 0))
    const other = deskReducer(state, message({ type: 'session', payload: session({ sessionId: 'f'.repeat(32), elapsedMs: 99_999 }) }, 0, 50))
    expect(other).toBe(state)
  })

  it('tracks the connection: reconnecting, stopped, closed for good, and a clean reset', () => {
    const open = run(sessionMessage())
    expect(deskReducer(open, { type: 'status', connection: 'reconnecting', message: 'again' })).toMatchObject({ connection: 'reconnecting', message: 'again' })
    expect(deskReducer(open, { type: 'stopped', message: 'Stopped' })).toMatchObject({ connection: 'closed', message: 'Stopped' })
    expect(deskReducer(initialDeskState, { type: 'stopped', message: 'Stopped' })).toBe(initialDeskState)
    const ended = deskReducer(open, { type: 'status', connection: 'ended', message: 'gone' })
    expect(deskReducer(ended, { type: 'stopped' })).toBe(ended)
    const reconnected = deskReducer(deskReducer(open, { type: 'status', connection: 'reconnecting' }), message({ type: 'heartbeat', payload: { elapsedMs: 500 } }, 0, 2000))
    expect(reconnected.connection).toBe('open')
    expect(deskReducer(open, { type: 'reset' })).toBe(initialDeskState)
  })
})

describe('decision countdown', () => {
  it('estimates the server clock from the last reading plus the local time since', () => {
    const state = run(sessionMessage(1000, 50_000))
    expect(serverElapsedMs(state.sync, 50_000)).toBe(1000)
    expect(serverElapsedMs(state.sync, 56_500)).toBe(7500)
    expect(serverElapsedMs(state.sync, 40_000)).toBe(1000)
    expect(serverElapsedMs(null, 1)).toBeNull()
  })

  it('counts down to the deadline and goes negative once the window has closed', () => {
    const state = run(sessionMessage(1000, 50_000))
    const due = { deadlineMs: 21_000 }
    expect(remainingMs(due, state.sync, 50_000)).toBe(20_000)
    expect(remainingMs(due, state.sync, 60_000)).toBe(10_000)
    expect(remainingMs(due, state.sync, 70_000)).toBe(0)
    expect(remainingMs(due, state.sync, 70_001)).toBe(-1)
    expect(remainingMs(due, null, 70_001)).toBeNull()
  })

  it('re-syncs from every heartbeat so drift or a throttled tab cannot hide the real deadline', () => {
    const start = run(sessionMessage(1000, 50_000))
    expect(remainingMs({ deadlineMs: 21_000 }, start.sync, 60_000)).toBe(10_000)
    const resynced = deskReducer(start, message({ type: 'heartbeat', payload: { elapsedMs: 14_000 } }, 1, 60_000))
    expect(resynced.sync).toEqual({ elapsedMs: 14_000, atMs: 60_000 })
    expect(remainingMs({ deadlineMs: 21_000 }, resynced.sync, 60_000)).toBe(7000)
    expect(remainingMs({ deadlineMs: 21_000 }, resynced.sync, 67_000)).toBe(0)
    const reconnected = deskReducer(resynced, message({ type: 'session', payload: session({ elapsedMs: 18_000 }) }, 1, 70_000))
    expect(remainingMs({ deadlineMs: 21_000 }, reconnected.sync, 70_000)).toBe(3000)
  })

  it('keeps proposals of the same cue distinct by approval ID', () => {
    const first = proposal({ approvalId: 'APR-001', cue: goalCue() })
    const second = proposal({ approvalId: 'APR-002', cue: goalCue({ overlayId: 'SYN-MATCH-01-OV-028' }), narrations: {
      en: fallbackNarration('en', 'DISABLED', 'SYN-MATCH-01-OV-028'), ta: fallbackNarration('ta', 'DISABLED', 'SYN-MATCH-01-OV-028'),
    } })
    const state = run(sessionMessage(), message({ type: 'proposal', payload: first }, 1), message({ type: 'proposal', payload: second }, 2))
    expect(state.proposals.map(item => item.approvalId)).toEqual(['APR-001', 'APR-002'])
  })
})
