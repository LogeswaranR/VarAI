import { describe, expect, it } from 'vitest'
import { parseApiProblem, parseDecisionResult, parseDeskMessage, parseSessionView } from './gate-validate'
import type { DeskMessage } from './gate-model'
import { parseMatchStreamMessage } from './match-stream'
import { envelope, event, metadata, resetSequence } from './match-test-data'
import { parseApproval, parseCueNarration, parseNarrationStatus, parsePublicNarration } from './narration-validate'
import {
  aiNarration, approval, approvedCue, decision, deskEnvelope, fallbackNarration, flaggedVerification, goalCue, narrationStatus, operatorNarration,
  proposal, publicOf, session, tamilText,
} from './gate-test-data'

type Draft = Record<string, unknown>
const narrationsOf = (draft: Draft) => draft.narrations as Record<string, Draft>
const draftOf = (value: unknown) => structuredClone(value) as Draft
const reject = (raw: string) => expect(() => parseDeskMessage(raw)).toThrow()

describe('desk message validation', () => {
  it('accepts every message type and returns exactly the fields it knows', () => {
    const withExtras = draftOf(proposal({ narrations: {
      en: aiNarration('en'), ta: aiNarration('ta'),
    } }))
    withExtras.surprise = '<script>alert(1)</script>'
    narrationsOf(withExtras).en.extra = 'ignored'

    const parsed = parseDeskMessage(deskEnvelope('proposal', withExtras))
    expect(parsed.type).toBe('proposal')
    expect(parsed.payload).toEqual(proposal({ narrations: { en: aiNarration('en'), ta: aiNarration('ta') } }))
    expect(parsed.payload).not.toHaveProperty('surprise')
    expect(narrationsOf(parsed.payload as unknown as Draft).en).not.toHaveProperty('extra')

    expect(parseDeskMessage(deskEnvelope('session', session()))).toEqual({ type: 'session', payload: session() })
    expect(parseDeskMessage(deskEnvelope('decision', decision({ state: 'AUTO_HELD' })))).toEqual({ type: 'decision', payload: decision({ state: 'AUTO_HELD' }) })
    expect(parseDeskMessage(deskEnvelope('heartbeat', { elapsedMs: 9876, other: 1 }))).toEqual({ type: 'heartbeat', payload: { elapsedMs: 9876 } })
  })

  it('does not let prototype keys or absurd nesting from the server reach the page', () => {
    const polluted = deskEnvelope('proposal', proposal()).replace('{"approvalId"', '{"__proto__":{"polluted":true},"constructor":{"x":1},"approvalId"')
    const parsed = parseDeskMessage(polluted)
    expect(Object.prototype.hasOwnProperty.call(parsed.payload, '__proto__')).toBe(false)
    expect(parsed.payload).not.toHaveProperty('constructor.x')
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    reject(`{"schemaVersion":"1.0","type":"heartbeat","payload":${'['.repeat(100_000)}`)
  })

  it('keeps hostile text as plain text and does not alter it', () => {
    const markup = '<img src=x onerror=alert(1)> & "quotes"'
    const hostile = proposal({ narrations: {
      en: { ...fallbackNarration('en'), text: { ...fallbackNarration('en').text, headline: markup } }, ta: fallbackNarration('ta'),
    } })
    const parsed = parseDeskMessage(deskEnvelope('proposal', hostile)) as Extract<DeskMessage, { type: 'proposal' }>
    expect(parsed.payload.narrations.en.text.headline).toBe(markup)
  })

  it.each([
    ['invalid JSON', '{'],
    ['truncated JSON', deskEnvelope('proposal', proposal()).slice(0, 400)],
    ['an empty message', ''],
    ['a JSON array', '[]'],
    ['the literal null', 'null'],
    ['an unsupported schema version', deskEnvelope('session', session(), '2.0')],
    ['a missing schema version', JSON.stringify({ type: 'session', payload: session() })],
    ['an unknown message type', deskEnvelope('shutdown', {})],
    ['a type that is not text', JSON.stringify({ schemaVersion: '1.0', type: 7, payload: {} })],
    ['a null payload', deskEnvelope('session', null)],
    ['an array payload', deskEnvelope('heartbeat', [1])],
    ['a heartbeat with a negative clock', deskEnvelope('heartbeat', { elapsedMs: -1 })],
    ['a heartbeat with a fractional clock', deskEnvelope('heartbeat', { elapsedMs: 1.5 })],
    ['a heartbeat with a text clock', deskEnvelope('heartbeat', { elapsedMs: '5' })],
    ['an oversized message', `{"schemaVersion":"1.0","type":"heartbeat","payload":{"elapsedMs":1},"padding":"${'x'.repeat(200_001)}"}`],
  ])('rejects %s', (_, raw) => reject(raw))

  const proposalMutations: readonly (readonly [string, (draft: Draft) => void])[] = [
    ['a text deadline', draft => { draft.deadlineMs = '5000' }],
    ['a fractional deadline', draft => { draft.deadlineMs = 5000.5 }],
    ['a negative proposal time', draft => { draft.proposedAtMs = -1 }],
    ['a missing deadline', draft => { delete draft.deadlineMs }],
    ['an unknown state', draft => { draft.state = 'SHELVED' }],
    ['a lower-case state', draft => { draft.state = 'pending' }],
    ['an approval ID of the wrong shape', draft => { draft.approvalId = 'APR-1' }],
    ['an approval ID with markup', draft => { draft.approvalId = 'APR-001"><b>' }],
    ['a short payload hash', draft => { draft.payloadHash = 'abc123' }],
    ['an upper-case payload hash', draft => { draft.payloadHash = 'A'.repeat(64) }],
    ['a cue that is not a valid cue', draft => { draft.cue = { overlayId: 'x' } }],
    ['a cue that already claims an approval', draft => { (draft.cue as Draft).approval = approval() }],
    ['a missing language', draft => { delete narrationsOf(draft).ta }],
    ['a narration for another cue', draft => { narrationsOf(draft).ta.cueId = 'SYN-MATCH-01-OV-001' }],
    ['a narration keyed under the wrong language', draft => { narrationsOf(draft).en.requestedLanguage = 'ta' }],
    ['an unknown narration source', draft => { narrationsOf(draft).en.source = 'HUMAN' }],
    ['an unknown fallback reason', draft => { narrationsOf(draft).en.fallbackReason = 'GREMLINS' }],
    ['a fallback without a reason', draft => { narrationsOf(draft).en.fallbackReason = null }],
    ['a fallback that claims to be Tamil', draft => { narrationsOf(draft).ta.language = 'ta' }],
    ['an AI narration with a fallback reason', draft => { narrationsOf(draft).en = { ...draftOf(aiNarration('en')), fallbackReason: 'TIMEOUT' } }],
    ['an AI narration delivered in the wrong language', draft => { narrationsOf(draft).ta = { ...draftOf(aiNarration('ta')), language: 'en' } }],
    ['an empty headline', draft => { (narrationsOf(draft).en.text as Draft).headline = '   ' }],
    ['an oversized headline', draft => { (narrationsOf(draft).en.text as Draft).headline = 'x'.repeat(2001) }],
    ['a headline that is not text', draft => { (narrationsOf(draft).en.text as Draft).headline = 5 }],
    ['an unknown verifier check', draft => { narrationsOf(draft).en.verification = { passed: false, passedChecks: [], failures: [{ check: 'vibes', field: 'fan', detail: 'x' }] } }],
    ['a pass that lists failures', draft => { narrationsOf(draft).en.verification = { passed: true, passedChecks: [], failures: [{ check: 'numbers', field: 'fan', detail: 'x' }] } }],
    ['a failure with no failures listed', draft => { narrationsOf(draft).en.verification = { passed: false, passedChecks: [], failures: [] } }],
    ['too many listed failures', draft => { narrationsOf(draft).en.verification = { passed: false, passedChecks: [], failures: Array.from({ length: 101 }, () => ({ check: 'numbers', field: 'fan', detail: 'x' })) } }],
    ['an oversized failure detail', draft => { narrationsOf(draft).en.verification = { passed: false, passedChecks: [], failures: [{ check: 'numbers', field: 'fan', detail: 'x'.repeat(501) }] } }],
    ['usage with negative tokens', draft => { narrationsOf(draft).en.usage = { ...draftOf(aiNarration('en').usage), promptTokens: -5 } }],
    ['usage with a text latency', draft => { narrationsOf(draft).en.usage = { ...draftOf(aiNarration('en').usage), latencyMs: 'fast' } }],
    ['a note that is not text', draft => { draft.note = 4 }],
    ['an oversized note', draft => { draft.note = 'n'.repeat(401) }],
    ['a decision time that is not a number', draft => { draft.decidedAtMs = 'later' }],
  ]

  it.each(proposalMutations)('rejects a proposal with %s', (_, mutate) => {
    const draft = draftOf(proposal())
    mutate(draft)
    reject(deskEnvelope('proposal', draft))
  })

  it('accepts the verification a rejected AI draft leaves on a fallback, including an empty field name', () => {
    const rejected = { ...fallbackNarration('ta', 'VERIFIER_FAILED'), verification: { ...flaggedVerification, failures: [
      ...flaggedVerification.failures, { check: 'schema' as const, field: '', detail: 'An unexpected property was returned.' },
    ] }, usage: aiNarration('ta').usage }
    const parsed = parseDeskMessage(deskEnvelope('proposal', proposal({ narrations: { en: fallbackNarration('en'), ta: rejected } }))) as Extract<DeskMessage, { type: 'proposal' }>
    expect(parsed.payload.narrations.ta.verification?.failures).toHaveLength(3)
  })

  const decisionMutations: readonly (readonly [string, (draft: Draft) => void])[] = [
    ['a pending state', draft => { draft.state = 'PENDING' }],
    ['an unknown state', draft => { draft.state = 'REJECTED' }],
    ['a missing decision time', draft => { delete draft.decidedAtMs }],
    ['a payload hash of the wrong shape', draft => { draft.payloadHash = 'x' }],
    ['narrations for two different cues', draft => { narrationsOf(draft).ta.cueId = 'SYN-MATCH-01-OV-001' }],
    ['a note of the wrong type', draft => { draft.note = [] }],
  ]

  it.each(decisionMutations)('rejects a decision with %s', (_, mutate) => {
    const draft = draftOf(decision())
    mutate(draft)
    reject(deskEnvelope('decision', draft))
  })

  const sessionMutations: readonly (readonly [string, (draft: Draft) => void])[] = [
    ['a session ID that is not 32 lower-case hex characters', draft => { draft.sessionId = 'ABC' }],
    ['another match', draft => { draft.matchId = 'OTHER' }],
    ['a speed above the gated maximum', draft => { draft.speed = 60 }],
    ['a speed below one', draft => { draft.speed = 0.5 }],
    ['a start that is not a whole second', draft => { draft.fromSeconds = 1.5 }],
    ['a negative start', draft => { draft.fromSeconds = -1 }],
    ['a zero decision window', draft => { draft.slaSeconds = 0 }],
    ['a decision window above two minutes', draft => { draft.leadSeconds = 121 }],
    ['an unknown language', draft => { draft.languages = ['en', 'fr'] }],
    ['no languages', draft => { draft.languages = [] }],
    ['a narration status of the wrong shape', draft => { draft.narration = { enabled: 'yes' } }],
    ['a timestamp that is not a date', draft => { draft.createdAtUtc = 'yesterday' }],
    ['a negative session clock', draft => { draft.elapsedMs = -3 }],
  ]

  it.each(sessionMutations)('rejects a session with %s', (_, mutate) => {
    const draft = draftOf(session())
    mutate(draft)
    expect(parseSessionView(draft)).toBeNull()
    reject(deskEnvelope('session', draft))
  })

  it('accepts the server timestamp format with seven fractional digits and an explicit offset', () => {
    expect(parseSessionView(session({ createdAtUtc: '2026-10-23T12:12:19.9864610+00:00' }))).not.toBeNull()
    expect(parseSessionView(session({ createdAtUtc: '2026-10-23T12:12:19Z' }))).not.toBeNull()
  })
})

describe('narration validation', () => {
  it('requires a fallback to be English with a reason and every other source to match the requested language', () => {
    expect(parsePublicNarration(publicOf(fallbackNarration('ta', 'TIMEOUT')), 'ta')).toMatchObject({ source: 'FALLBACK', language: 'en', requestedLanguage: 'ta', fallbackReason: 'TIMEOUT' })
    expect(parsePublicNarration(publicOf(aiNarration('ta')), 'ta')).toMatchObject({ source: 'AI', language: 'ta', fallbackReason: null })
    expect(parsePublicNarration(publicOf(operatorNarration('ta', tamilText)), 'ta')).toMatchObject({ source: 'OPERATOR', language: 'ta' })
    expect(parsePublicNarration(publicOf(aiNarration('ta')), 'en')).toBeNull()
    expect(parsePublicNarration(null, 'en')).toBeNull()
    expect(parsePublicNarration('text', 'en')).toBeNull()
  })

  it('drops the verifier and usage internals from the public form and keeps them on the desk form', () => {
    const publicForm = parsePublicNarration(aiNarration('en'), 'en')
    expect(publicForm).not.toHaveProperty('usage')
    expect(publicForm).not.toHaveProperty('verification')
    expect(parseCueNarration(aiNarration('en'), 'en')).toMatchObject({ usage: { promptTokens: 1200 }, verification: { passed: true } })
    expect(parseCueNarration({ ...aiNarration('en'), usage: undefined }, 'en')).toBeNull()
    expect(parseCueNarration({ ...aiNarration('en'), verification: undefined }, 'en')).toBeNull()
  })

  it('validates the approval and the narration status', () => {
    expect(parseApproval(approval())).toEqual(approval())
    expect(parseApproval({ ...approval(), decision: 'REJECTED' })).toBeNull()
    expect(parseApproval({ ...approval(), payloadHash: 'nope' })).toBeNull()
    expect(parseApproval({ ...approval(), narrations: { en: publicOf(fallbackNarration('en')) } })).toBeNull()
    expect(parseApproval(undefined)).toBeNull()
    expect(parseNarrationStatus(narrationStatus({ enabled: true, deployment: 'gpt-demo', callsUsed: 3 }))).toEqual(narrationStatus({ enabled: true, deployment: 'gpt-demo', callsUsed: 3 }))
    expect(parseNarrationStatus({ ...narrationStatus(), callsUsed: -1 })).toBeNull()
    expect(parseNarrationStatus({ ...narrationStatus(), deployment: 7 })).toBeNull()
    expect(parseNarrationStatus([])).toBeNull()
  })
})

describe('gate responses', () => {
  it('validates a decision result and reads the error body of a failed call', () => {
    const result = { approvalId: 'APR-001', state: 'OVERRIDDEN', payloadHash: 'c'.repeat(64), decidedAtMs: 4200 }
    expect(parseDecisionResult(result)).toEqual(result)
    expect(parseDecisionResult({ ...result, state: 'PENDING' })).toBeNull()
    expect(parseDecisionResult({ ...result, decidedAtMs: -1 })).toBeNull()
    expect(parseDecisionResult(null)).toBeNull()

    expect(parseApiProblem({ error: '  Text too long.  ', code: 'INVALID_DECISION' })).toEqual({ message: 'Text too long.', code: 'INVALID_DECISION' })
    expect(parseApiProblem({ error: 7, code: 'lowercase' })).toEqual({ message: null, code: null })
    expect(parseApiProblem({ error: 'x'.repeat(401), code: 'A' })).toEqual({ message: null, code: null })
    expect(parseApiProblem('<html>')).toEqual({ message: null, code: null })
  })
})

describe('the program feed carries an approval on every cue', () => {
  it('requires a valid approval on the gated feed and keeps it as validated data', () => {
    const raw = envelope('overlay', approvedCue())
    const parsed = parseMatchStreamMessage(raw, true)
    expect(parsed.type === 'overlay' && parsed.payload.approval?.approvalId).toBe('APR-001')
    expect(() => parseMatchStreamMessage(envelope('overlay', goalCue()), true)).toThrow(/without a valid operator approval/)
    expect(() => parseMatchStreamMessage(envelope('overlay', { ...approvedCue(), approval: { ...approval(), decision: 'PENDING' } }), true)).toThrow()
    expect(() => parseMatchStreamMessage(envelope('overlay', { ...approvedCue(), approval: 'yes' }), true)).toThrow()
  })

  it('never lets the preview stream carry an approval, so preview text can never be mistaken for approved text', () => {
    expect(parseMatchStreamMessage(envelope('overlay', goalCue())).type).toBe('overlay')
    expect(() => parseMatchStreamMessage(envelope('overlay', approvedCue()))).toThrow(/preview stream carried an operator approval/)
    expect(() => parseMatchStreamMessage(envelope('overlay', { ...goalCue(), approval: null }))).toThrow()
  })

  it('leaves events and the rest of the gated feed as they are on the preview stream', () => {
    resetSequence()
    expect(parseMatchStreamMessage(envelope('match', metadata), true).type).toBe('match')
    expect(parseMatchStreamMessage(envelope('event', event()), true).type).toBe('event')
  })
})
