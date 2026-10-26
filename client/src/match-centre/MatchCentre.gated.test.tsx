import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GateApiError } from './gate-api'
import type { DeskHandlers, GateClient } from './gate-api'
import type { DecisionRequest, DecisionResult, DeskMessage, SessionView } from './gate-model'
import type { MatchMetadata, MatchStreamMessage } from './match-model'
import type { MatchStreamHandlers, MatchStreamOptions } from './match-stream'
import { MatchCentre } from './MatchCentre'
import { cue, event, metadata, momentum, resetSequence } from './match-test-data'
import type { CueNarration, NarrationStatus } from './narration-model'
import { PROFILE_STORAGE_KEY } from './profile'
import {
  aiNarration, approvedCue, englishText, fallbackNarration, goalCue, narrationStatus, operatorNarration, proposal, session, SESSION_ID, tamilText,
} from './gate-test-data'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial ? [[PROFILE_STORAGE_KEY, initial]] : [])
  return {
    values,
    api: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    },
  }
}

interface FakeGateOptions {
  readonly narration?: NarrationStatus | Error
  readonly createSession?: GateClient['createSession']
  readonly decide?: GateClient['decide']
  readonly sessionStatus?: GateClient['sessionStatus']
}

function fakeGate(options: FakeGateOptions = {}) {
  const desk: { current?: DeskHandlers } = {}
  const closeDesk = vi.fn()
  const createSession = vi.fn(options.createSession ?? (async (request: { speed: number; fromSeconds: number }): Promise<SessionView> =>
    session({ speed: request.speed, fromSeconds: request.fromSeconds })))
  const decide = vi.fn(options.decide ?? (async (_id: string, request: DecisionRequest): Promise<DecisionResult> => ({
    approvalId: request.approvalId, state: request.action === 'approve' ? 'APPROVED' : request.action === 'hold' ? 'HELD' : 'OVERRIDDEN',
    payloadHash: request.payloadHash, decidedAtMs: 3000,
  })))
  const narration = vi.fn(async () => {
    if (options.narration instanceof Error) throw options.narration
    return options.narration ?? narrationStatus()
  })
  const sessionStatus = vi.fn(options.sessionStatus ?? (async () => 'active' as const))
  const client: GateClient = {
    createSession, decide, narrationStatus: narration, sessionStatus,
    connectDesk: vi.fn((_id: string, handlers: DeskHandlers) => {
      desk.current = handlers
      return closeDesk
    }),
    decisionLogUrl: id => `/api/matches/SYN-MATCH-01/sessions/${id}/decision-log.jsonl`,
  }
  return { client, desk, closeDesk, createSession, decide, narration, sessionStatus }
}

async function setup(options: {
  storage?: ReturnType<typeof memoryStorage>
  gate?: FakeGateOptions
  loadMetadata?: () => Promise<MatchMetadata>
} = {}) {
  resetSequence()
  const program: { current?: MatchStreamHandlers } = {}
  const close = vi.fn()
  const connect = vi.fn((_options: MatchStreamOptions, callbacks: MatchStreamHandlers) => {
    program.current = callbacks
    return close
  })
  const gate = fakeGate(options.gate)
  const storage = options.storage ?? memoryStorage()
  const time = { now: 50_000 }
  const view = render(<MatchCentre streamClient={{ connect }} gateClient={gate.client} storage={storage.api} clock={() => time.now}
    loadMetadata={options.loadMetadata ?? (async () => metadata)} />)
  await screen.findByTestId('scorebug')
  fireEvent.click(screen.getByText('Personalise'))
  fireEvent.click(screen.getByText('Playback options & guide'))
  vi.useFakeTimers()
  const settle = async (ms = 60) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
  const deliver = async (...messages: MatchStreamMessage[]) => {
    await act(async () => {
      for (const message of messages) program.current?.onMessage(message)
      await vi.advanceTimersByTimeAsync(60)
    })
  }
  const deliverDesk = async (...messages: readonly (readonly [DeskMessage, number | null])[]) => {
    await act(async () => {
      for (const [message, seq] of messages) gate.desk.current?.onMessage(message, seq)
      await vi.advanceTimersByTimeAsync(0)
    })
  }
  const choose = async (name: RegExp | string) => { await act(async () => { fireEvent.click(screen.getByRole('radio', { name })) }) }
  const press = async (name: RegExp | string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
  const goGated = () => choose(/Operator-gated/)
  const start = async () => {
    await press('Start gated run')
    await settle(0)
  }
  return { connect, close, gate, program, storage, time, view, settle, deliver, deliverDesk, choose, press, goGated, start }
}

afterEach(() => { vi.useRealTimers() })

const moments = () => screen.getByRole('region', { name: /^(Moments|Insight feed)$/ })
const deskSession = [{ type: 'session', payload: session() }, 0] as const
const deskProposal = (approvalId: string, cueId: string, headline: string, seq: number, deadlineMs = 21_000) => {
  const source = goalCue({ overlayId: cueId, headline })
  return [{ type: 'proposal', payload: proposal({ approvalId, deadlineMs, cue: source, narrations: {
    en: fallbackNarration('en', 'DISABLED', cueId, source), ta: fallbackNarration('ta', 'DISABLED', cueId, source),
  } }) }, seq] as const
}
const aiCue = (overlayId: string, headline: string, overrides: { en?: Partial<CueNarration>; ta?: Partial<CueNarration> } = {}) => approvedCue(
  { overlayId, headline: `Rule: ${headline}`, inMs: 5_292_000 },
  aiNarration('en', overlayId, { text: { ...englishText, headline }, ...overrides.en }),
  aiNarration('ta', overlayId, { text: { ...tamilText, headline: `${headline} (ta)` }, ...overrides.ta }))

describe('Preview mode is unchanged and says what it is', () => {
  it('opens in Preview with no approval interface and a label that says the cues are not operator-approved', async () => {
    const { connect, press } = await setup()
    expect(screen.getByRole('radio', { name: /Preview/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Operator-gated/ })).not.toBeChecked()
    expect(screen.getByTestId('mode-note')).toHaveTextContent('Preview - deterministic rules only, not operator-approved')
    expect(screen.queryByTestId('operator-desk')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Operator desk' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /decision log/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Jump to 66:00' })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Speed')).getAllByRole('option').map(option => option.textContent)).toEqual(['30×', '60×', '120×', '300×', '600×'])
    expect(screen.getByTestId('provenance')).toHaveTextContent('No AI model is called here')
    expect(screen.getByTestId('provenance')).toHaveTextContent('not an official decision')

    await press('Kick off')
    expect(connect).toHaveBeenCalledWith({ speed: 60, fromSeconds: 0 }, expect.any(Object))
    expect(screen.getByTestId('match-status')).toHaveTextContent('Connecting to the synthetic match stream…')
  })

  it('never reaches the gate while in Preview, not even to ask about narration', async () => {
    const { gate, press, settle } = await setup()
    await press('Kick off')
    await settle(30_000)
    expect(gate.createSession).not.toHaveBeenCalled()
    expect(gate.narration).not.toHaveBeenCalled()
    expect(gate.client.connectDesk).not.toHaveBeenCalled()
  })

  it('shows the language switch but keeps it off, with the reason, because Preview has no Tamil narration', async () => {
    await setup()
    const english = screen.getByRole('radio', { name: 'English' })
    const tamil = screen.getByRole('radio', { name: 'தமிழ்' })
    expect(english).toBeChecked()
    expect(english).toBeDisabled()
    expect(tamil).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Language' })).toHaveAccessibleDescription('Tamil narration is available in operator-gated mode')
    expect(screen.getByText('Tamil narration is available in operator-gated mode')).toBeVisible()
  })

  it('shows preview cues as plain rule text with no provenance chip and no narration, whatever language was saved', async () => {
    const storage = memoryStorage(JSON.stringify({ persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09', language: 'ta' }))
    const { press, deliver } = await setup({ storage })
    await press('Kick off')
    await deliver({ type: 'match', payload: metadata }, { type: 'overlay', payload: cue({ headline: 'Rule text only', whyItMatters: 'Deterministic why' }) })
    const card = screen.getByTestId('moment-card')
    expect(card).toHaveTextContent('Rule text only')
    expect(card).toHaveTextContent('Deterministic why')
    expect(within(card).queryByTestId('provenance-chip')).not.toBeInTheDocument()
    expect(card.querySelector('[lang="ta"]')).toBeNull()
    expect(screen.getByRole('radio', { name: 'தமிழ்' })).toBeChecked()
  })
})

describe('switching to operator-gated mode', () => {
  it('offers the gated speeds with 10× as the default, the honest note, the narration status and the 66:00 jump', async () => {
    const { goGated, gate, settle } = await setup()
    await goGated()
    await settle(0)
    expect(screen.getByRole('radio', { name: /Operator-gated/ })).toBeChecked()
    expect(within(screen.getByLabelText('Speed')).getAllByRole('option').map(option => option.textContent)).toEqual(['1×', '2×', '5×', '10×'])
    expect(screen.getByLabelText<HTMLSelectElement>('Speed').value).toBe('10')
    expect(screen.getByTestId('mode-note')).toHaveTextContent(
      'Operator-gated runs at 10x or slower because the decision window is real time. The program is delayed by the decision window (20 s).')
    expect(screen.getByTestId('mode-note')).toHaveTextContent('the server confirms the real window when a session starts')
    expect(screen.queryByText(/Preview - deterministic rules only/)).not.toBeInTheDocument()
    expect(gate.narration).toHaveBeenCalledOnce()
    expect(screen.getByTestId('narration-status')).toHaveTextContent('AI narration: off - deterministic English only')
    expect(screen.getByRole('button', { name: 'Jump to 66:00' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Start gated run' })).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'Operator desk' })).toBeVisible()
    expect(screen.getByText('Start an operator-gated run to receive cue proposals here.')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'தமிழ்' })).toBeEnabled()
    expect(screen.queryByText('Tamil narration is available in operator-gated mode')).not.toBeInTheDocument()
  })

  it('reports the narration status in words: on with the deployment and budget, paused, unavailable', async () => {
    const on = await setup({ gate: { narration: narrationStatus({ enabled: true, deployment: 'gpt-demo', callsUsed: 3, callLimit: 160 }) } })
    await on.goGated()
    await on.settle(0)
    expect(screen.getByTestId('narration-status')).toHaveTextContent('AI narration: on (gpt-demo) - 3/160 model calls used')
    on.view.unmount()
    vi.useRealTimers()

    const paused = await setup({ gate: { narration: narrationStatus({ enabled: true, deployment: 'gpt-demo', callsUsed: 160, coolingDown: true }) } })
    await paused.goGated()
    await paused.settle(0)
    expect(screen.getByTestId('narration-status')).toHaveTextContent('160/160 model calls used - paused after repeated failures')
    paused.view.unmount()
    vi.useRealTimers()

    const broken = await setup({ gate: { narration: new GateApiError('down', 503, null) } })
    await broken.goGated()
    await broken.settle(0)
    expect(screen.getByTestId('narration-status')).toHaveTextContent('AI narration: status unavailable')
  })

  it('refreshes the narration budget while a run is going, and stops asking when the page goes away', async () => {
    const { goGated, start, gate, settle, view } = await setup({ gate: { narration: narrationStatus({ enabled: true, deployment: 'gpt-demo' }) } })
    await goGated()
    await start()
    const before = gate.narration.mock.calls.length
    await settle(15_000)
    expect(gate.narration.mock.calls.length).toBeGreaterThan(before)
    view.unmount()
    const after = gate.narration.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(gate.narration.mock.calls.length).toBe(after)
  })

  it('says plainly, in gated mode only, who writes the words, who approves them and what is not checked', async () => {
    const { goGated, settle } = await setup()
    await goGated()
    await settle(0)
    const copy = screen.getByTestId('provenance').textContent ?? ''
    expect(copy).toContain('AI narration is off on this server')
    expect(copy).toContain('the Tamil view falls back to English')
    expect(copy).toContain('A person must approve, edit or hold every cue before it airs')
    expect(copy).toContain('never approved automatically')
    expect(copy).toContain('do not prove the text is true')
    expect(copy).toContain('Tamil output has not been reviewed by a native speaker')
    expect(copy).toContain('no operator login')
    expect(copy).toContain('Everything here is synthetic')
    expect(copy).not.toContain('No AI model is called here')
    expect(document.body.textContent).not.toMatch(/\b(verified|official|accurate)\b/i)
  })

  it('says an AI model writes the words, and names the deployment, when narration is on', async () => {
    const { goGated, settle } = await setup({ gate: { narration: narrationStatus({ enabled: true, deployment: 'gpt-demo' }) } })
    await goGated()
    await settle(0)
    const copy = screen.getByTestId('provenance').textContent ?? ''
    expect(copy).toContain('written by an AI model (deployment gpt-demo) in English and Tamil')
    expect(copy).not.toContain('AI narration is off')
    expect(copy).toContain('Tamil output has not been reviewed by a native speaker')
    expect(document.body.textContent).not.toMatch(/\b(verified|official|accurate)\b/i)
  })

  it('does not claim anything about narration until the server has said', async () => {
    const { goGated, settle } = await setup({ gate: { narration: new GateApiError('down', 503, null) } })
    await goGated()
    await settle(0)
    expect(screen.getByTestId('provenance')).toHaveTextContent('The server has not reported which applies yet')
  })

  it('clears the other mode\'s run when the mode changes, so preview cues can never show in a gated run', async () => {
    const { press, deliver, goGated, close, choose } = await setup()
    await press('Kick off')
    await deliver({ type: 'match', payload: metadata }, { type: 'event', payload: event() },
      { type: 'overlay', payload: cue({ headline: 'PREVIEW ONLY CUE' }) })
    expect(screen.getByTestId('moment-card')).toHaveTextContent('PREVIEW ONLY CUE')

    await goGated()
    expect(close).toHaveBeenCalledOnce()
    expect(screen.queryByText(/PREVIEW ONLY CUE/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('moment-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('match-status')).toHaveTextContent('Ready')

    await choose(/Preview/)
    expect(screen.queryByTestId('operator-desk')).not.toBeInTheDocument()
    expect(screen.queryByText(/PREVIEW ONLY CUE/)).not.toBeInTheDocument()
  })
})

describe('starting an operator-gated run', () => {
  it('creates a session first, then opens the program feed and the desk feed for it', async () => {
    const { goGated, press, settle, gate, connect } = await setup()
    await goGated()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start gated run' })) })
    expect(screen.getByTestId('match-status')).toHaveTextContent('Starting an operator-gated session…')
    await settle(0)

    expect(gate.createSession).toHaveBeenCalledWith({ speed: 10, fromSeconds: 0 }, expect.any(AbortSignal))
    expect(connect).toHaveBeenCalledWith({ speed: 10, fromSeconds: 0, sessionId: SESSION_ID }, expect.any(Object))
    expect(gate.client.connectDesk).toHaveBeenCalledWith(SESSION_ID, expect.any(Object))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Start gated run' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Download decision log (JSONL)' })).toHaveAttribute('href', `/api/matches/SYN-MATCH-01/sessions/${SESSION_ID}/decision-log.jsonl`)
    expect(screen.getByTestId('mode-note')).toHaveTextContent('(20 s).')
    expect(screen.getByTestId('mode-note')).not.toHaveTextContent('demo default')
    await press('Stop')
  })

  it('uses the chosen gated speed, and reads the decision window from the session rather than assuming 20 s', async () => {
    const { goGated, start, gate, connect, deliver } = await setup({ gate: { createSession: async request => session({ ...request, leadSeconds: 4, slaSeconds: 4 }) } })
    await goGated()
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '2' } })
    await start()
    expect(gate.createSession).toHaveBeenCalledWith({ speed: 2, fromSeconds: 0 }, expect.any(AbortSignal))
    expect(connect).toHaveBeenCalledWith({ speed: 2, fromSeconds: 0, sessionId: SESSION_ID }, expect.any(Object))
    expect(screen.getByTestId('mode-note')).toHaveTextContent('The program is delayed by the decision window (4 s).')
    await deliver({ type: 'match', payload: metadata })
    expect(screen.getByTestId('match-status')).toHaveTextContent('Operator-gated · playing at 2× · match clock 0:00. The program runs 4 s behind the desk.')
  })

  it('starts a new session from 66:00 or from a key moment, closing the streams of the run before it', async () => {
    const { goGated, start, press, gate, connect, close } = await setup()
    await goGated()
    await start()
    await press('Stop')
    expect(close).toHaveBeenCalledOnce()
    expect(gate.closeDesk).toHaveBeenCalledOnce()

    await press('Jump to 66:00')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(gate.createSession).toHaveBeenLastCalledWith({ speed: 10, fromSeconds: 3960 }, expect.any(AbortSignal))
    expect(connect).toHaveBeenLastCalledWith({ speed: 10, fromSeconds: 3960, sessionId: SESSION_ID }, expect.any(Object))
    await press('Stop')
    await press(/67:21 · AVC goal, ruled out on review/)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(gate.createSession).toHaveBeenLastCalledWith({ speed: 10, fromSeconds: 4011 }, expect.any(AbortSignal))
    expect(gate.createSession).toHaveBeenCalledTimes(3)
  })

  it('closes both streams on Stop and says the session stays on the server until it expires', async () => {
    const { goGated, start, press, gate, close, deliverDesk } = await setup()
    await goGated()
    await start()
    await deliverDesk(deskSession, [...deskProposal('APR-001', 'SYN-MATCH-01-OV-027', 'Pending headline', 1)])
    await press('Stop')
    expect(close).toHaveBeenCalledOnce()
    expect(gate.closeDesk).toHaveBeenCalledOnce()
    expect(screen.getByTestId('match-status')).toHaveTextContent('Stopped at 0:00. Both streams are closed; the session stays on the server until it expires.')
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Desk stopped')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Restart gated run' })).toBeEnabled()
  })

  it('closes both streams and abandons a session that is still being created when the page goes away', async () => {
    let signalSeen: AbortSignal | undefined
    const { goGated, view, close, gate } = await setup({ gate: { createSession: (_request, signal) => {
      signalSeen = signal
      return new Promise<SessionView>(() => undefined)
    } } })
    await goGated()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start gated run' })) })
    expect(signalSeen?.aborted).toBe(false)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    view.unmount()
    expect(signalSeen?.aborted).toBe(true)
    expect(gate.client.connectDesk).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it('closes the program feed and the desk feed when the page unmounts during a run, without touching state afterwards', async () => {
    const { goGated, start, view, close, gate, deliverDesk } = await setup()
    await goGated()
    await start()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    view.unmount()
    expect(close).toHaveBeenCalled()
    expect(gate.closeDesk).toHaveBeenCalled()
    await act(async () => { gate.desk.current?.onMessage(deskSession[0], 0) })
    await deliverDesk()
    expect(errors).not.toHaveBeenCalled()
  })

  it('shows the server message when the session cannot be created and lets the user try again', async () => {
    let attempt = 0
    const { goGated, press, settle, gate, connect } = await setup({ gate: { createSession: async request => {
      attempt += 1
      if (attempt === 1) throw new GateApiError('The demo already has the maximum number of live sessions. Try again shortly. Try again in about 30 s.', 503, 'SESSIONS_FULL', 30)
      return session(request)
    } } })
    await goGated()
    await press('Start gated run')
    await settle(0)
    expect(screen.getByTestId('match-status')).toHaveTextContent('The demo already has the maximum number of live sessions.')
    expect(screen.getByTestId('match-status')).toHaveTextContent('Try again in about 30 s.')
    expect(connect).not.toHaveBeenCalled()
    expect(gate.client.connectDesk).not.toHaveBeenCalled()
    expect(screen.getByText('Start an operator-gated run to receive cue proposals here.')).toBeVisible()

    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry).toBeEnabled()
    await press('Try again')
    await settle(0)
    expect(gate.createSession).toHaveBeenCalledTimes(2)
    expect(connect).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
  })

  it.each([
    ['a rejected request (400)', new GateApiError('speed must be between 1 and 10 so an operator can keep up.', 400, 'INVALID_SPEED')],
    ['an unreachable server', new GateApiError('The server could not be reached. Check that it is running, then try again.', 0, 'NETWORK')],
    ['an unexpected failure', new Error('boom')],
  ])('shows the failure of %s as text and stays usable', async (_, error) => {
    const { goGated, press, settle } = await setup({ gate: { createSession: async () => { throw error } } })
    await goGated()
    await press('Start gated run')
    await settle(0)
    expect(screen.getByTestId('match-status')).toHaveTextContent(error.message)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /Preview/ })).toBeEnabled()
  })

  it('does not let an old, slower session creation replace the run the user started after it', async () => {
    const pending: ((value: SessionView) => void)[] = []
    const { goGated, press, settle, connect, gate } = await setup({ gate: { createSession: () => new Promise<SessionView>(resolve => { pending.push(resolve) }) } })
    await goGated()
    await press('Start gated run')
    await press('Stop')
    await press('Restart gated run')
    expect(pending).toHaveLength(2)
    await act(async () => { pending[0](session({ sessionId: '1'.repeat(32) })) })
    await settle(0)
    expect(connect).not.toHaveBeenCalled()
    await act(async () => { pending[1](session()) })
    await settle(0)
    expect(connect).toHaveBeenCalledOnce()
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ sessionId: SESSION_ID }), expect.any(Object))
    expect(gate.client.connectDesk).toHaveBeenCalledOnce()
  })
})

describe('the operator desk inside the match centre', () => {
  it('shows a compact, collapsible desk to a fan and decides a cue without changing the view', async () => {
    const { goGated, start, deliverDesk, press, gate } = await setup()
    await goGated()
    await start()
    await deliverDesk(deskSession, [...deskProposal('APR-001', 'SYN-MATCH-01-OV-027', 'Goal headline', 1)])

    const desk = screen.getByTestId('operator-desk')
    expect(screen.getByRole('radio', { name: /Fan/ })).toBeChecked()
    expect(desk).toHaveAttribute('data-variant', 'compact')
    expect(within(desk).getByRole('button', { name: 'Collapse' })).toBeVisible()
    expect(within(desk).getByTestId('countdown')).toHaveTextContent('21 s left to decide')

    fireEvent.change(within(desk).getByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'Matches the replay' } })
    await press('Approve')
    expect(gate.decide).toHaveBeenCalledWith(SESSION_ID, { approvalId: 'APR-001', payloadHash: 'a'.repeat(64), action: 'approve', note: 'Matches the replay' })
    expect(screen.getByTestId('desk-proposal')).toHaveAttribute('data-state', 'APPROVED')
    expect(screen.getByTestId('desk-outcome')).toHaveTextContent('APR-001 approved. It airs when its time comes.')
    expect(screen.getByRole('radio', { name: /Fan/ })).toBeChecked()
  })

  it('shows the full desk, with model usage, in the Studio view and the compact one in the other two', async () => {
    const { goGated, start, deliverDesk, choose } = await setup()
    await goGated()
    await start()
    const source = goalCue()
    await deliverDesk(deskSession, [{ type: 'proposal', payload: proposal({ narrations: { en: aiNarration('en', source.overlayId), ta: aiNarration('ta', source.overlayId) } }) }, 1])
    expect(screen.getByTestId('operator-desk')).toHaveAttribute('data-variant', 'compact')
    expect(screen.queryByTestId('model-usage')).not.toBeInTheDocument()

    await choose(/Analyst/)
    expect(screen.getByTestId('operator-desk')).toHaveAttribute('data-variant', 'compact')
    await choose(/Studio/)
    expect(screen.getByTestId('operator-desk')).toHaveAttribute('data-variant', 'full')
    expect(screen.getAllByTestId('model-usage')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument()
    await choose(/Fan/)
    expect(screen.getByTestId('operator-desk')).toHaveAttribute('data-variant', 'compact')
  })

  it('keeps an open override and a typed note when the persona changes', async () => {
    const { goGated, start, deliverDesk, choose, press } = await setup()
    await goGated()
    await start()
    await deliverDesk(deskSession, [...deskProposal('APR-001', 'SYN-MATCH-01-OV-027', 'Goal headline', 1)])
    fireEvent.change(screen.getByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'keep me' } })
    await press('Override')
    fireEvent.change(screen.getByRole('textbox', { name: 'Tamil Headline' }), { target: { value: tamilText.headline } })
    await choose(/Studio/)
    expect(screen.getByRole('textbox', { name: 'Note (optional)' })).toHaveValue('keep me')
    expect(screen.getByRole('textbox', { name: 'Tamil Headline' })).toHaveValue(tamilText.headline)
  })

  it('turns a decision the server rejects as already made into a plain explanation', async () => {
    const { goGated, start, deliverDesk, press } = await setup({ gate: { decide: async () => { throw new GateApiError('The proposal is already APPROVED.', 409, 'ALREADY_DECIDED') } } })
    await goGated()
    await start()
    await deliverDesk(deskSession, [...deskProposal('APR-001', 'SYN-MATCH-01-OV-027', 'Goal headline', 1)])
    await press('Hold')
    expect(screen.getByTestId('decision-error')).toHaveTextContent('This cue was already decided, so nothing was changed.')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('reacts when the session is gone: a decision that finds no session ends the run in a friendly state', async () => {
    const { goGated, start, deliverDesk, press, gate, close } = await setup({ gate: { decide: async () => { throw new GateApiError('The session has ended: it expired or the server restarted.', 404, 'SESSION_ENDED') } } })
    await goGated()
    await start()
    await deliverDesk(deskSession, [...deskProposal('APR-001', 'SYN-MATCH-01-OV-027', 'Goal headline', 1)])
    await press('Approve')
    expect(screen.getByTestId('match-status')).toHaveTextContent('The operator-gated session ended: it expired or the server restarted. Start a new run to continue.')
    expect(close).toHaveBeenCalled()
    expect(gate.closeDesk).toHaveBeenCalled()
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Session ended')
    expect(screen.queryByRole('link', { name: /decision log/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart gated run' })).toBeEnabled()
  })

  it('turns a program feed that closes into a session-ended state only after asking the server whether the session still exists', async () => {
    const answers = { status: 'active' as 'active' | 'ended' }
    const { goGated, start, program, gate, settle } = await setup({ gate: { sessionStatus: async () => answers.status } })
    await goGated()
    await start()
    await act(async () => { program.current?.onError('The match stream closed before full time.') })
    await settle(0)
    expect(gate.sessionStatus).toHaveBeenCalledWith(SESSION_ID, expect.any(AbortSignal))
    expect(screen.getByTestId('match-status')).toHaveTextContent('The match stream closed before full time.')
    expect(screen.getByTestId('desk-connection')).not.toHaveTextContent('Session ended')

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Restart gated run' })) })
    await settle(0)
    answers.status = 'ended'
    await act(async () => { program.current?.onError('The match stream closed before full time.') })
    await settle(0)
    expect(screen.getByTestId('match-status')).toHaveTextContent('The operator-gated session ended')
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Session ended')
  })

  it('turns a desk feed that closes for good into a session-ended state, or offers to reconnect when the session is still there', async () => {
    const answers = { status: 'active' as 'active' | 'ended' }
    const { goGated, start, gate, settle, press, deliverDesk } = await setup({ gate: { sessionStatus: async () => answers.status } })
    await goGated()
    await start()
    await deliverDesk(deskSession)
    await act(async () => { gate.desk.current?.onClosed('The operator desk connection closed.', true) })
    await settle(0)
    expect(screen.getByRole('alert')).toHaveTextContent('The operator desk connection closed.')
    await press('Reconnect desk')
    expect(gate.client.connectDesk).toHaveBeenCalledTimes(2)

    answers.status = 'ended'
    await act(async () => { gate.desk.current?.onClosed('The operator desk connection closed.', true) })
    await settle(0)
    expect(screen.getByTestId('match-status')).toHaveTextContent('The operator-gated session ended')
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Session ended')
  })

  it('shows desk reconnection without losing the proposals already received', async () => {
    const { goGated, start, deliverDesk, gate } = await setup()
    await goGated()
    await start()
    await deliverDesk(deskSession, [...deskProposal('APR-001', 'SYN-MATCH-01-OV-027', 'Goal headline', 1)])
    await act(async () => { gate.desk.current?.onReconnecting() })
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Desk reconnecting…')
    expect(screen.getByTestId('desk-proposal')).toBeVisible()
    await deliverDesk(deskSession, [...deskProposal('APR-001', 'SYN-MATCH-01-OV-027', 'Goal headline', 1)], [...deskProposal('APR-002', 'SYN-MATCH-01-OV-028', 'Next', 2)])
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Desk connected')
    expect(screen.getAllByTestId('desk-proposal')).toHaveLength(2)
  })
})

describe('the program only ever shows what a person approved', () => {
  const heldCue = approvedCue({ overlayId: 'SYN-MATCH-01-OV-028', headline: 'HELD CUE HEADLINE' })

  it.each(['fan', 'analyst', 'studio'] as const)('never renders an unapproved or held cue anywhere in the %s view, including raw JSON', async persona => {
    const { goGated, start, deliverDesk, deliver, choose } = await setup()
    await goGated()
    await choose(new RegExp(persona, 'i'))
    await start()
    await deliverDesk(deskSession, [...deskProposal('APR-002', heldCue.overlayId, 'HELD CUE HEADLINE', 1)],
      [{ type: 'decision', payload: {
        approvalId: 'APR-002', state: 'AUTO_HELD', decidedAtMs: 21_010, payloadHash: 'a'.repeat(64), note: null,
        narrations: { en: fallbackNarration('en', 'DISABLED', heldCue.overlayId), ta: fallbackNarration('ta', 'DISABLED', heldCue.overlayId) },
      } }, 2])
    await deliver(
      { type: 'match', payload: metadata },
      { type: 'event', payload: event({ matchClockMs: 5_290_000 }) },
      // A cue that was never approved, delivered as if the stream had let it through.
      { type: 'overlay', payload: cue({ overlayId: 'SYN-MATCH-01-OV-099', headline: 'UNAPPROVED CUE HEADLINE', priority: 3, inMs: 5_291_000 }) },
      { type: 'overlay', payload: aiCue('SYN-MATCH-01-OV-027', 'Approved cue headline') })

    const page = document.body.textContent ?? ''
    expect(page).not.toContain('UNAPPROVED CUE HEADLINE')
    expect(page).toContain('Approved cue headline')
    expect(screen.queryByTestId('lower-third')).toHaveTextContent('Approved cue headline')
    if (persona === 'studio') {
      expect(screen.getAllByTestId('cue-row')).toHaveLength(1)
      expect(screen.getByTestId('cue-json').textContent).not.toContain('UNAPPROVED')
      expect(screen.getByTestId('cue-json').textContent).toContain('"approval"')
    } else {
      expect(within(moments()).getAllByTestId('moment-card')).toHaveLength(1)
      expect(within(moments()).queryByText(/HELD CUE HEADLINE|UNAPPROVED/)).not.toBeInTheDocument()
    }
    expect(screen.getByTestId('desk-proposal')).toHaveAttribute('data-state', 'AUTO_HELD')
    expect(screen.queryByTestId('lower-third')?.textContent).not.toContain('HELD CUE HEADLINE')
  })

  it('completes at full time even though held cues and cues before the start never aired', async () => {
    const { goGated, start, deliver } = await setup()
    await goGated()
    await start()
    await deliver(
      { type: 'match', payload: metadata }, { type: 'event', payload: event({ matchClockMs: 5_290_000 }) }, { type: 'momentum', payload: momentum() },
      { type: 'overlay', payload: aiCue('SYN-MATCH-01-OV-027', 'Approved cue headline') },
      { type: 'complete', payload: { matchId: 'SYN-MATCH-01', eventCount: 1, momentumCount: 1, overlayCount: 29, finalScore: { home: 1, away: 1 } } })
    expect(screen.getByTestId('match-status')).toHaveTextContent('Full time')
    expect(screen.getByRole('button', { name: 'Restart gated run' })).toBeEnabled()
  })

  it('shows an AI-written cue in the viewer\'s language with its provenance, and the program reacts to the language switch at once', async () => {
    const { goGated, start, deliver, choose, press, storage } = await setup()
    await goGated()
    await start()
    await deliver({ type: 'match', payload: metadata }, { type: 'overlay', payload: aiCue('SYN-MATCH-01-OV-027', 'Approved cue headline') })

    const card = screen.getByTestId('moment-card')
    expect(within(card).getByRole('heading', { name: 'Approved cue headline' })).toHaveAttribute('lang', 'en')
    expect(within(card).getByText(englishText.fan)).toHaveAttribute('lang', 'en')
    expect(within(card).getByTestId('provenance-chip')).toHaveTextContent('AI-written - operator-approved')
    expect(within(card).queryByTestId('language-notice')).not.toBeInTheDocument()
    expect(within(card).queryByText(englishText.why)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('lower-third')).getByTestId('provenance-chip')).toHaveTextContent('AI-written - operator-approved')

    await choose('தமிழ்')
    expect(within(screen.getByTestId('moment-card')).getByRole('heading', { name: 'Approved cue headline (ta)' })).toHaveAttribute('lang', 'ta')
    expect(within(screen.getByTestId('moment-card')).getByText(tamilText.fan)).toHaveAttribute('lang', 'ta')
    expect(within(screen.getByTestId('lower-third')).getByText('Approved cue headline (ta)')).toHaveAttribute('lang', 'ta')
    expect(JSON.parse(storage.values.get(PROFILE_STORAGE_KEY) ?? '{}')).toMatchObject({ language: 'ta' })

    await choose(/Analyst/)
    const analyst = screen.getByTestId('moment-card')
    expect(within(analyst).getByText(tamilText.analyst)).toHaveAttribute('lang', 'ta')
    expect(within(analyst).getByText(tamilText.why)).toHaveAttribute('lang', 'ta')
    expect(within(analyst).getByText('Pass difficulty')).toBeVisible()
    await press('Stop')
  })
})

describe('language, persona and provenance together', () => {
  it('shows each language\'s own provenance, and says when Tamil is only the English fallback', async () => {
    const storage = memoryStorage(JSON.stringify({ persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09', language: 'ta' }))
    const { goGated, start, deliver, choose } = await setup({ storage })
    await goGated()
    await start()
    const fallback = approvedCue({ overlayId: 'SYN-MATCH-01-OV-027', inMs: 5_292_000 }, fallbackNarration('en'), fallbackNarration('ta', 'TIMEOUT'))
    const edited = approvedCue({ overlayId: 'SYN-MATCH-01-OV-028', inMs: 5_293_000, priority: 3 },
      fallbackNarration('en'), operatorNarration('ta', tamilText, 'SYN-MATCH-01-OV-028'), { decision: 'OVERRIDDEN', approvalId: 'APR-002' })
    await deliver({ type: 'match', payload: metadata }, { type: 'overlay', payload: fallback }, { type: 'overlay', payload: edited })

    const [newest, older] = screen.getAllByTestId('moment-card')
    expect(within(newest).getByTestId('provenance-chip')).toHaveTextContent('Operator-edited')
    expect(within(newest).getByRole('heading', { name: tamilText.headline })).toHaveAttribute('lang', 'ta')
    expect(within(older).getByTestId('provenance-chip')).toHaveTextContent('Deterministic text')
    expect(within(older).getByTestId('language-notice')).toHaveTextContent('Tamil unavailable - showing English (reason: the AI model timed out)')
    expect(within(older).getByRole('heading', { name: goalCue().headline })).toHaveAttribute('lang', 'en')

    await choose('English')
    expect(within(screen.getAllByTestId('moment-card')[1]).queryByTestId('language-notice')).not.toBeInTheDocument()
  })

  it('shows the studio everything in the chosen language: on-air narration, the queue and the selected cue', async () => {
    const { goGated, start, deliver, choose } = await setup()
    await goGated()
    await choose(/Studio/)
    await start()
    await deliver({ type: 'match', payload: metadata }, { type: 'overlay', payload: aiCue('SYN-MATCH-01-OV-027', 'Approved cue headline') })
    const onAir = screen.getByTestId('on-air-narration')
    expect(within(onAir).getByText(englishText.fan)).toBeVisible()
    expect(within(onAir).getByText(englishText.analyst)).toBeVisible()
    expect(within(onAir).getByText(englishText.why)).toBeVisible()
    expect(within(onAir).getByTestId('provenance-chip')).toHaveTextContent('AI-written - operator-approved')
    const selected = screen.getByTestId('studio-narration')
    expect(within(selected).getByText('Approved narration · English')).toBeVisible()
    await choose('தமிழ்')
    expect(within(screen.getByTestId('on-air-narration')).getByText(tamilText.analyst)).toHaveAttribute('lang', 'ta')
    expect(within(screen.getByTestId('studio-narration')).getByText('Approved narration · Tamil')).toBeVisible()
    expect(screen.getByText(/lists only cues a person approved/)).toBeVisible()
  })
})
