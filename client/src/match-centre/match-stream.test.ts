import { describe, expect, it, vi } from 'vitest'
import { createMatchStreamClient, parseMatchMetadata, parseMatchStreamMessage } from './match-stream'
import type { MatchStreamHandlers } from './match-stream'
import { approvedCue, goalCue, SESSION_ID } from './gate-test-data'
import { cue, envelope, event, metadata, momentum, resetSequence } from './match-test-data'

describe('match stream message validation', () => {
  it('accepts every supported message type with explicit nulls preserved', () => {
    resetSequence()
    const item = event({ playerId: null, metrics: null, endX: null, endY: null })
    expect(parseMatchStreamMessage(envelope('match', metadata))).toEqual({ type: 'match', payload: metadata })
    expect(parseMatchStreamMessage(envelope('event', item))).toEqual({ type: 'event', payload: item })
    expect(parseMatchStreamMessage(envelope('momentum', momentum())).type).toBe('momentum')
    expect(parseMatchStreamMessage(envelope('overlay', cue())).type).toBe('overlay')
    expect(parseMatchStreamMessage(envelope('complete', {
      matchId: 'SYN-MATCH-01', eventCount: 1, momentumCount: 1, overlayCount: 1, finalScore: { home: 1, away: 1 },
    })).type).toBe('complete')
  })

  it.each([
    ['invalid JSON', '{'],
    ['an unsupported schema version', envelope('match', metadata, '1.0')],
    ['an unknown message type', envelope('weather', {})],
    ['a different match', envelope('match', { ...metadata, matchId: 'OTHER' })],
    ['non-synthetic metadata', envelope('match', { ...metadata, synthetic: false })],
    ['an unknown event type', envelope('event', { ...event(), eventType: 'VAR_DECISION' })],
    ['a missing nullable field', envelope('event', (() => { const { playerId, ...rest } = event(); void playerId; return rest })())],
    ['a non-finite coordinate', envelope('event', { ...event(), x: null })],
    ['a momentum state the client does not know', envelope('momentum', { ...momentum(), state: 'PANIC' })],
    ['a cue with an invalid priority', envelope('overlay', { ...cue(), priority: 9 })],
    ['a cue whose window is inverted', envelope('overlay', { ...cue(), inMs: 5, outMs: 4 })],
    ['a cue with the wrong overlay schema version', envelope('overlay', { ...cue(), schemaVersion: '2.0' })],
  ])('rejects %s instead of trusting streamed content', (_, raw) => {
    expect(() => parseMatchStreamMessage(raw)).toThrow()
  })

  it('validates the REST match description too', () => {
    expect(parseMatchMetadata(JSON.parse(JSON.stringify(metadata)))).toEqual(metadata)
    expect(() => parseMatchMetadata({ ...metadata, homeTeam: { ...metadata.homeTeam, players: [] } })).toThrow()
    expect(() => parseMatchMetadata({ ...metadata, awayTeam: metadata.homeTeam })).toThrow()
  })
})

function fakeSource() {
  const source = {
    close: vi.fn(),
    onmessage: null as ((message: MessageEvent<string>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    readyState: 1,
  }
  const send = (data: string) => source.onmessage?.({ data } as MessageEvent<string>)
  return { source, send }
}

function handlers() {
  const received: string[] = []
  const value: MatchStreamHandlers = {
    onMessage: message => received.push(message.type),
    onReconnecting: vi.fn(),
    onError: vi.fn(),
  }
  return { received, value }
}

describe('match stream client', () => {
  it('uses the causal endpoint only when opted in, and cannot mix it with an approval session', () => {
    const { source } = fakeSource()
    const create = vi.fn(() => source)
    const { value } = handlers()
    createMatchStreamClient(create).connect({ speed: 1, fromSeconds: 0, incremental: true }, value)
    expect(create).toHaveBeenCalledWith('/api/matches/SYN-MATCH-01/live?speed=1&fromSeconds=0')
    expect(() => createMatchStreamClient(create).connect({ speed: 1, fromSeconds: 0, incremental: true, sessionId: SESSION_ID }, value))
      .toThrow('cannot use an operator-gated replay session')
  })

  it('requests the chosen speed and start point and forwards validated messages in order', () => {
    resetSequence()
    const { source, send } = fakeSource()
    const create = vi.fn(() => source)
    const { received, value } = handlers()
    createMatchStreamClient(create).connect({ speed: 120, fromSeconds: 3990.7 }, value)

    expect(create).toHaveBeenCalledWith('/api/matches/SYN-MATCH-01/stream?speed=120&fromSeconds=3990')
    send(envelope('match', metadata))
    send(envelope('event', event()))
    send(envelope('event', event()))
    send(envelope('momentum', momentum()))
    expect(received).toEqual(['match', 'event', 'event', 'momentum'])
    expect(value.onError).not.toHaveBeenCalled()
  })

  it('closes on completion and when the caller disconnects', () => {
    const { source, send } = fakeSource()
    const { value } = handlers()
    const disconnect = createMatchStreamClient(() => source).connect({ speed: 60, fromSeconds: 0 }, value)
    send(envelope('match', metadata))
    send(envelope('complete', { matchId: 'SYN-MATCH-01', eventCount: 0, momentumCount: 0, overlayCount: 0, finalScore: { home: 0, away: 0 } }))
    expect(source.close).toHaveBeenCalledOnce()
    disconnect()
    expect(source.close).toHaveBeenCalledOnce()
  })

  it.each([
    ['data before the match is described', () => [envelope('event', event())]],
    ['an event for an unannounced team', () => [envelope('match', metadata), envelope('event', event({ teamId: 'OTHER' }))]],
    ['a skipped event', () => [envelope('match', metadata), envelope('event', event({ sequence: 5, eventId: 'SYN-MATCH-01-E0005' }))]],
    ['invalid JSON', () => ['{']],
  ])('fails visibly on %s', (_, messages) => {
    resetSequence()
    const { source, send } = fakeSource()
    const { value } = handlers()
    createMatchStreamClient(() => source).connect({ speed: 60, fromSeconds: 0 }, value)
    for (const raw of messages()) send(raw)
    expect(value.onError).toHaveBeenCalledOnce()
    expect(source.close).toHaveBeenCalled()
  })

  it('reports reconnecting while the browser retries and an error when the stream is closed', () => {
    const { source } = fakeSource()
    const { value } = handlers()
    createMatchStreamClient(() => source).connect({ speed: 60, fromSeconds: 0 }, value)
    source.onerror?.(new Event('error'))
    expect(value.onReconnecting).toHaveBeenCalledOnce()
    source.readyState = 2
    source.onerror?.(new Event('error'))
    expect(value.onError).toHaveBeenCalledWith('The match stream closed before full time.')
  })

  it('refuses a playback speed the server would reject', () => {
    const { value } = handlers()
    const client = createMatchStreamClient(() => fakeSource().source)
    expect(() => client.connect({ speed: 0, fromSeconds: 0 }, value)).toThrow('between 1 and 1000')
    expect(() => client.connect({ speed: 5000, fromSeconds: 0 }, value)).toThrow('between 1 and 1000')
  })
})

describe('operator-gated program feed client', () => {
  it('reads the session program route, which carries no speed or start of its own, and forwards approved cues', () => {
    resetSequence()
    const { source, send } = fakeSource()
    const create = vi.fn(() => source)
    const { received, value } = handlers()
    createMatchStreamClient(create).connect({ speed: 10, fromSeconds: 5280, sessionId: SESSION_ID }, value)

    expect(create).toHaveBeenCalledWith(`/api/matches/SYN-MATCH-01/sessions/${SESSION_ID}/program`)
    send(envelope('match', metadata))
    send(envelope('event', event()))
    send(envelope('overlay', approvedCue()))
    send(envelope('momentum', momentum()))
    expect(received).toEqual(['match', 'event', 'overlay', 'momentum'])
    expect(value.onError).not.toHaveBeenCalled()
  })

  it('fails visibly, and shows nothing, when a cue arrives without an approval', () => {
    const { source, send } = fakeSource()
    const { received, value } = handlers()
    createMatchStreamClient(() => source).connect({ speed: 10, fromSeconds: 0, sessionId: SESSION_ID }, value)
    send(envelope('match', metadata))
    send(envelope('overlay', goalCue()))
    expect(received).toEqual(['match'])
    expect(value.onError).toHaveBeenCalledWith(expect.stringContaining('without a valid operator approval'))
    expect(source.close).toHaveBeenCalled()
  })

  it('fails visibly when the preview stream carries an approval it must never carry', () => {
    const { source, send } = fakeSource()
    const { received, value } = handlers()
    createMatchStreamClient(() => source).connect({ speed: 60, fromSeconds: 0 }, value)
    send(envelope('match', metadata))
    send(envelope('overlay', approvedCue()))
    expect(received).toEqual(['match'])
    expect(value.onError).toHaveBeenCalledWith(expect.stringContaining('preview stream carried an operator approval'))
  })

  it('refuses a session identifier that is not 32 lower-case hex characters instead of building a URL from it', () => {
    const { value } = handlers()
    const client = createMatchStreamClient(() => fakeSource().source)
    for (const sessionId of ['', 'ABC', 'g'.repeat(32), `${SESSION_ID}/../x`, SESSION_ID.toUpperCase()]) {
      expect(() => client.connect({ speed: 10, fromSeconds: 0, sessionId }, value)).toThrow('not valid')
    }
  })

  it('keeps the preview rules for events: it ignores a replayed event after a reconnect, fails on a skipped one, and closes at full time', () => {
    resetSequence()
    const { source, send } = fakeSource()
    const { received, value } = handlers()
    createMatchStreamClient(() => source).connect({ speed: 10, fromSeconds: 0, sessionId: SESSION_ID }, value)
    send(envelope('match', metadata))
    const first = event()
    send(envelope('event', first))
    send(envelope('event', first))
    expect(received).toEqual(['match', 'event'])
    send(envelope('event', event({ sequence: 9, eventId: 'SYN-MATCH-01-E0009' })))
    expect(value.onError).toHaveBeenCalledWith('The match stream skipped an event.')

    const finished = fakeSource()
    const other = handlers()
    createMatchStreamClient(() => finished.source).connect({ speed: 10, fromSeconds: 0, sessionId: SESSION_ID }, other.value)
    finished.send(envelope('match', metadata))
    finished.send(envelope('complete', { matchId: 'SYN-MATCH-01', eventCount: 0, momentumCount: 0, overlayCount: 29, finalScore: { home: 1, away: 1 } }))
    expect(finished.source.close).toHaveBeenCalledOnce()
    expect(other.received).toEqual(['match', 'complete'])
  })
})
