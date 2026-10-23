import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GateApiError } from './gate-api'
import { deskReducer, initialDeskState } from './desk-state'
import type { DeskAction, DeskState } from './desk-state'
import type { DecisionMessage, DecisionRequest, DecisionResult, DeskMessage, GatePhase, ProposalView } from './gate-model'
import { OperatorDesk } from './OperatorDesk'
import {
  aiNarration, decision, englishText, fallbackNarration, flaggedVerification, goalCue, HASH, operatorNarration, OTHER_HASH, proposal, session, SESSION_ID,
  tamilText, usage,
} from './gate-test-data'

const LOG_URL = `/api/matches/SYN-MATCH-01/sessions/${SESSION_ID}/decision-log.jsonl`
const message = (payload: DeskMessage, seq: number | null, atMs = 0): DeskAction => ({ type: 'message', message: payload, seq, atMs })
const decided = (payload: DecisionMessage): DeskMessage => ({ type: 'decision', payload })

function deskWith(proposals: readonly ProposalView[], decisions: readonly DecisionMessage[] = []): DeskState {
  const actions: DeskAction[] = [
    message({ type: 'session', payload: session({ elapsedMs: 1000 }) }, 0, 50_000),
    ...proposals.map((item, index) => message({ type: 'proposal', payload: item }, index + 1)),
    ...decisions.map((item, index) => message(decided(item), proposals.length + index + 1)),
  ]
  return actions.reduce(deskReducer, { ...initialDeskState, connection: 'connecting' })
}

const resultFor = (request: DecisionRequest): DecisionResult => ({
  approvalId: request.approvalId,
  state: request.action === 'approve' ? 'APPROVED' : request.action === 'hold' ? 'HELD' : 'OVERRIDDEN',
  payloadHash: request.action === 'override' ? OTHER_HASH : request.payloadHash,
  decidedAtMs: 6000,
})

function setup(options: {
  state?: DeskState
  variant?: 'full' | 'compact'
  phase?: GatePhase
  logUrl?: string | null
  onDecide?: (request: DecisionRequest) => Promise<DecisionResult>
} = {}) {
  vi.useFakeTimers()
  const time = { now: 50_000 }
  const clock = () => time.now
  const onDecide = vi.fn(options.onDecide ?? (async (request: DecisionRequest) => resultFor(request)))
  const onReconnect = vi.fn()
  const element = (state: DeskState) => (
    <OperatorDesk variant={options.variant ?? 'full'} desk={state} phase={options.phase ?? 'running'}
      logUrl={options.logUrl === undefined ? LOG_URL : options.logUrl} clock={clock} onDecide={onDecide} onReconnect={onReconnect} />
  )
  const view = render(element(options.state ?? deskWith([proposal()])))
  const rerender = (state: DeskState) => view.rerender(element(state))
  const tick = async (ms: number) => {
    time.now += ms
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  }
  const click = async (name: string | RegExp) => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
  }
  return { ...view, onDecide, onReconnect, rerender, tick, click, time }
}

afterEach(() => { vi.useRealTimers() })

describe('OperatorDesk proposals', () => {
  it('shows what the operator needs to decide: the cue, a countdown, both languages and the controls', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Operator desk', level: 2 })).toBeVisible()
    const card = screen.getByRole('article', { name: 'Goal · 88:11 · Priority 3' })
    expect(within(card).getByTestId('approval-id')).toHaveTextContent('APR-001')
    expect(within(card).getByTestId('proposal-state')).toHaveTextContent('Awaiting decision')
    expect(within(card).getByTestId('countdown')).toHaveTextContent('20 s left to decide')
    expect(within(card).getByRole('region', { name: 'English narration' })).toHaveTextContent('Goal for Alder Vale Comets: Ravi Sorrell')
    expect(within(card).getByRole('region', { name: 'Tamil narration' })).toHaveTextContent('Levels the match')
    for (const name of ['Approve', 'Hold', 'Override']) expect(within(card).getByRole('button', { name })).toBeEnabled()
    expect(within(card).getByRole('textbox', { name: 'Note (optional)' })).toBeEnabled()
    expect(within(card).getByRole('group', { name: 'Decision for APR-001' })).toBeVisible()
    expect(screen.getByText('Operator identity is not authenticated in this demo; sessions live in server memory.')).toBeVisible()
  })

  it('offers the decision log as a download and says what its hash chain does and does not show', () => {
    setup()
    const link = screen.getByRole('link', { name: 'Download decision log (JSONL)' })
    expect(link).toHaveAttribute('href', LOG_URL)
    expect(link).toHaveAttribute('download')
    expect(screen.getByText('Hash-chained: it detects edits to the file. It is not signed and does not identify the operator.')).toBeVisible()
    expect(screen.queryByText(/tamper-proof/i)).not.toBeInTheDocument()
  })

  it('says that the Tamil text is the English fallback, with the reason, and marks the language of each text', () => {
    setup()
    const tamil = screen.getByRole('region', { name: 'Tamil narration' })
    expect(within(tamil).getByTestId('language-notice')).toHaveTextContent('Tamil unavailable - showing English (reason: AI narration is off)')
    expect(within(tamil).getByTestId('source-chip')).toHaveTextContent('Deterministic fallback (reason: AI narration is off)')
    expect(within(tamil).getByText('Goal for Alder Vale Comets: Ravi Sorrell')).toHaveAttribute('lang', 'en')
    const english = screen.getByRole('region', { name: 'English narration' })
    expect(within(english).queryByTestId('language-notice')).not.toBeInTheDocument()
  })

  it('renders Tamil text with a Tamil language attribute and labels AI and operator text', () => {
    setup({ state: deskWith([proposal({ narrations: { en: aiNarration('en'), ta: operatorNarration('ta', tamilText) } })]) })
    const tamil = screen.getByRole('region', { name: 'Tamil narration' })
    expect(within(tamil).getByText(tamilText.headline)).toHaveAttribute('lang', 'ta')
    expect(within(tamil).getByText(tamilText.why)).toHaveAttribute('lang', 'ta')
    expect(within(tamil).getByTestId('source-chip')).toHaveTextContent('Operator-edited')
    expect(within(tamil).queryByTestId('language-notice')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'English narration' })).getByTestId('source-chip')).toHaveTextContent('AI-written')
  })

  it('says that deterministic text had no mechanical checks, and that passed or flagged checks are mechanical only', () => {
    setup({ state: deskWith([proposal({ narrations: {
      en: aiNarration('en'), ta: { ...fallbackNarration('ta', 'VERIFIER_FAILED'), verification: flaggedVerification, usage },
    } })]) })
    const english = screen.getByRole('region', { name: 'English narration' })
    expect(within(english).getByText('Mechanical checks passed')).toBeVisible()
    expect(within(english).getByText(/Mechanical checks only \(numbers, scores, names, event words, script\)\. They do not prove the text is true\./)).toBeVisible()

    const tamil = screen.getByRole('region', { name: 'Tamil narration' })
    expect(within(tamil).getByText('Checks flagged: numbers, names')).toBeVisible()
    expect(within(tamil).getByText(/Mechanical checks only/)).toBeVisible()
    expect(within(tamil).getByText(/describe an AI draft that was rejected/)).toBeVisible()
    expect(within(tamil).getByText('Show the flagged checks (2)')).toBeVisible()
    expect(within(tamil).getByText(/The number 3 is not in the facts\./)).toBeInTheDocument()
    expect(within(tamil).getByText(/The name Kane is not in the facts\./)).toBeInTheDocument()
    expect(within(tamil).getByTestId('source-chip')).toHaveTextContent('Deterministic fallback (reason: the AI text failed the mechanical checks)')

    cleanupDesk()
    setup()
    const blocks = screen.getAllByTestId('verification')
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(within(block).getByText('No mechanical checks ran')).toBeVisible()
      expect(within(block).getByText(/Mechanical checks only \(numbers, scores, names, event words, script\)\. They do not prove the text is true\./)).toBeVisible()
      expect(within(block).getByText(/deterministic wording, not AI output/)).toBeVisible()
    }
  })

  it('shows model usage in the full desk when it exists and leaves it out of the compact one', () => {
    const state = deskWith([proposal({ narrations: { en: aiNarration('en'), ta: aiNarration('ta') } })])
    setup({ state })
    const english = screen.getByRole('region', { name: 'English narration' })
    const facts = within(within(english).getByTestId('model-usage'))
    expect(facts.getByText('Tokens in').nextSibling).toHaveTextContent('1,200')
    expect(facts.getByText('Tokens out').nextSibling).toHaveTextContent('340')
    expect(facts.getByText('Reasoning tokens').nextSibling).toHaveTextContent('120')
    expect(facts.getByText('Latency').nextSibling).toHaveTextContent('1.8 s')
    expect(facts.getByText('Deployment').nextSibling).toHaveTextContent('gpt-demo')

    cleanupDesk()
    setup({ state, variant: 'compact' })
    expect(screen.queryByTestId('model-usage')).not.toBeInTheDocument()
  })

  it('never turns text from the server into markup', () => {
    const hostile = '<img src=x onerror="alert(1)"> <b>bold</b>'
    const { container } = setup({ state: deskWith([proposal({ narrations: {
      en: { ...fallbackNarration('en'), text: { ...fallbackNarration('en').text, headline: hostile } }, ta: fallbackNarration('ta'),
    } })]) })
    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })

  it('lists pending proposals soonest-deadline first and decided ones below with their state', () => {
    const later = proposal({ approvalId: 'APR-002', deadlineMs: 40_000, cue: goalCue({ overlayId: 'SYN-MATCH-01-OV-030', kind: 'CARD', inMs: 5_400_000, priority: 2 }) })
    const sooner = proposal({ approvalId: 'APR-003', deadlineMs: 30_000, cue: goalCue({ overlayId: 'SYN-MATCH-01-OV-031', kind: 'HARD_PASS', inMs: 5_350_000, priority: 2 }) })
    const done = proposal({ approvalId: 'APR-001', cue: goalCue() })
    setup({ state: deskWith([done, later, sooner], [decision({ approvalId: 'APR-001', state: 'OVERRIDDEN', note: 'Tamil text supplied' })]) })

    const pendingList = screen.getByRole('list', { name: 'Cues awaiting a decision' })
    expect(within(pendingList).getAllByTestId('desk-proposal').map(item => item.getAttribute('data-approval-id'))).toEqual(['APR-003', 'APR-002'])
    const decidedList = screen.getByRole('list', { name: 'Decided cues, newest first' })
    const [overridden] = within(decidedList).getAllByTestId('desk-proposal')
    expect(overridden).toHaveAttribute('data-state', 'OVERRIDDEN')
    expect(within(overridden).getByTestId('proposal-state')).toHaveTextContent('Overridden')
    expect(within(overridden).getByText('Note: Tamil text supplied')).toBeVisible()
    expect(within(overridden).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.getByTestId('desk-pending-count')).toHaveTextContent('2 awaiting a decision')
  })

  it.each([
    ['APPROVED', 'Approved'], ['HELD', 'Held'], ['OVERRIDDEN', 'Overridden'], ['AUTO_HELD', 'Held automatically: no decision in time'],
  ] as const)('labels a %s proposal "%s" and shows the checks recorded with it', (state, label) => {
    setup({ state: deskWith([proposal()], [decision({ state, narrations: {
      en: operatorNarration('en', englishText), ta: { ...fallbackNarration('ta', 'TIMEOUT'), verification: flaggedVerification },
    } })]) })
    const card = screen.getByTestId('desk-proposal')
    expect(card).toHaveAttribute('data-state', state)
    expect(within(card).getByTestId('proposal-state')).toHaveTextContent(label)
    const chips = within(card).getAllByTestId('verification-chip').map(chip => chip.textContent)
    expect(chips).toEqual(['Mechanical checks passed', 'Checks flagged: numbers, names'])
    expect(within(card).getAllByTestId('language-notice')[0]).toHaveTextContent('Tamil unavailable - showing English (reason: the AI model timed out)')
  })
})

function cleanupDesk() {
  document.body.innerHTML = ''
}

describe('OperatorDesk decisions', () => {
  it('approves with the hash of the proposal on screen and the typed note, then switches every control off and moves focus to the result', async () => {
    const { onDecide, click } = setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'Note (optional)' }), { target: { value: '  Checked against the replay  ' } })
    await click('Approve')

    expect(onDecide).toHaveBeenCalledOnce()
    expect(onDecide).toHaveBeenCalledWith({ approvalId: 'APR-001', payloadHash: HASH, action: 'approve', note: 'Checked against the replay' })
    for (const name of ['Approve', 'Hold', 'Override']) expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Note (optional)' })).toBeDisabled()
    const outcome = screen.getByTestId('desk-outcome')
    expect(outcome).toHaveTextContent('APR-001 approved. It airs when its time comes.')
    expect(outcome).toHaveFocus()
  })

  it('holds without a note when none was typed', async () => {
    const { onDecide, click } = setup()
    await click('Hold')
    expect(onDecide).toHaveBeenCalledWith({ approvalId: 'APR-001', payloadHash: HASH, action: 'hold' })
    expect(screen.getByTestId('desk-outcome')).toHaveTextContent('APR-001 held. It will not air.')
  })

  it('sends one decision only, even if the button is pressed again while the request is in flight', async () => {
    let finish: (result: DecisionResult) => void = () => undefined
    const { onDecide, click } = setup({ onDecide: () => new Promise(resolve => { finish = resolve }) })
    await click('Approve')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    await click('Approve')
    expect(onDecide).toHaveBeenCalledOnce()
    await act(async () => { finish({ approvalId: 'APR-001', state: 'APPROVED', payloadHash: HASH, decidedAtMs: 1 }) })
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('opens an editor with both languages prefilled and nothing to save until something changes', async () => {
    const { click } = setup()
    await click('Override')
    const editor = screen.getByRole('form', { name: 'Override APR-001' })
    expect(screen.getByRole('button', { name: 'Override' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(editor).getByRole('textbox', { name: 'English Headline' })).toHaveValue('Goal for Alder Vale Comets: Ravi Sorrell')
    expect(within(editor).getByRole('textbox', { name: 'Tamil Headline' })).toHaveValue('Goal for Alder Vale Comets: Ravi Sorrell')
    expect(within(editor).getByRole('textbox', { name: 'Tamil Headline' })).toHaveAttribute('lang', 'ta')
    expect(within(editor).getByText(/current Tamil text is the English fallback/)).toBeVisible()
    expect(within(editor).getByRole('button', { name: 'Save override' })).toBeDisabled()
    expect(within(editor).getByText('Change at least one field to override.')).toBeVisible()
    expect(within(editor).getByText('40/100')).toBeVisible()
  })

  it('sends only the language that was changed, trimmed, with the note', async () => {
    const { onDecide, click } = setup()
    await click('Override')
    const editor = screen.getByRole('form', { name: 'Override APR-001' })
    for (const [label, value] of [['Headline', tamilText.headline], ['Fan', `${tamilText.fan} `], ['Analyst', tamilText.analyst], ['Why it matters', tamilText.why]] as const) {
      fireEvent.change(within(editor).getByRole('textbox', { name: `Tamil ${label}` }), { target: { value } })
    }
    fireEvent.change(screen.getByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'Tamil supplied by the desk' } })
    const save = within(editor).getByRole('button', { name: 'Save override' })
    expect(save).toBeEnabled()
    await act(async () => { fireEvent.click(save) })

    expect(onDecide).toHaveBeenCalledWith({
      approvalId: 'APR-001', payloadHash: HASH, action: 'override', edits: { ta: tamilText }, note: 'Tamil supplied by the desk',
    })
    expect(onDecide.mock.calls[0][0].edits).not.toHaveProperty('en')
    expect(screen.getByTestId('desk-outcome')).toHaveTextContent('APR-001 overridden with your edits.')
  })

  it('sends both languages when both were changed', async () => {
    const { onDecide, click } = setup()
    await click('Override')
    fireEvent.change(screen.getByRole('textbox', { name: 'English Why it matters' }), { target: { value: englishText.why } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Tamil Why it matters' }), { target: { value: tamilText.why } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save override' })) })
    const edits = onDecide.mock.calls[0][0].edits
    expect(Object.keys(edits ?? {})).toEqual(['en', 'ta'])
    expect(edits?.en?.why).toBe(englishText.why)
    expect(edits?.en?.headline).toBe('Goal for Alder Vale Comets: Ravi Sorrell')
  })

  it('stops an edit that breaks the server limits before it is sent, and says by how much', async () => {
    const { onDecide, click } = setup()
    await click('Override')
    const headline = screen.getByRole('textbox', { name: 'English Headline' })
    fireEvent.change(headline, { target: { value: 'x'.repeat(100) } })
    expect(screen.getByText('100/100')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save override' })).toBeEnabled()
    fireEvent.change(headline, { target: { value: 'x'.repeat(101) } })
    expect(screen.getByText('101/100 · 1 over the limit of 100')).toBeVisible()
    expect(headline).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Save override' })).toBeDisabled()
    expect(screen.getByText('Fix the marked fields before saving.')).toBeVisible()
    fireEvent.change(headline, { target: { value: '   ' } })
    expect(screen.getByText('0/100 · cannot be empty')).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: 'Tamil Headline' }), { target: { value: 'த'.repeat(171) } })
    expect(screen.getByText('171/170 · 1 over the limit of 170')).toBeVisible()
    await act(async () => { fireEvent.submit(screen.getByRole('form', { name: 'Override APR-001' })) })
    expect(onDecide).not.toHaveBeenCalled()
  })

  it('closes the editor on cancel without sending anything', async () => {
    const { onDecide, click } = setup()
    await click('Override')
    await click('Cancel')
    expect(screen.queryByRole('form', { name: 'Override APR-001' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Override' })).toHaveAttribute('aria-expanded', 'false')
    expect(onDecide).not.toHaveBeenCalled()
  })

  const rejectWith = (status: number, code: string | null, text: string) => async () => { throw new GateApiError(text, status, code) }

  it('shows the server text for a rejected edit and keeps the editor open so it can be fixed', async () => {
    const { click } = setup({ onDecide: rejectWith(400, 'INVALID_DECISION', 'The edited text is not acceptable: en/fan: The text contains markup, a link, a control character or hidden direction text.') })
    await click('Override')
    fireEvent.change(screen.getByRole('textbox', { name: 'English Fan' }), { target: { value: 'See https://example.invalid' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save override' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('The edited text is not acceptable: en/fan: The text contains markup')
    expect(screen.getByRole('form', { name: 'Override APR-001' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save override' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it.each([
    ['ALREADY_DECIDED', 409, 'This cue was already decided, so nothing was changed.', true],
    ['SLA_EXPIRED', 409, 'The decision window closed first, so the cue was held automatically.', true],
    ['UNKNOWN_PROPOSAL', 404, 'The desk does not know this proposal. It may belong to an earlier session.', true],
    ['STALE_PAYLOAD', 409, 'The proposal changed after it was shown, so the decision was not applied.', false],
    ['SESSION_ENDED', 404, 'The session has ended: it expired or the server restarted.', true],
    ['NETWORK', 0, 'The server could not be reached, so the decision was not recorded.', false],
  ])('explains a %s failure in plain words and %s the controls off', async (code, status, text, settled) => {
    const { click } = setup({ onDecide: rejectWith(status, code, 'raw server text') })
    await click('Hold')
    expect(screen.getByTestId('decision-error')).toHaveTextContent(text)
    expect(screen.getByTestId('decision-error')).not.toHaveTextContent('raw server text')
    expect(screen.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(settled)
    if (settled && code !== 'SESSION_ENDED') expect(screen.getByTestId('desk-outcome')).toHaveTextContent(text)
  })

  it('does not hide a failure it cannot explain: any other server message is shown as it is', async () => {
    const { click } = setup({ onDecide: rejectWith(413, 'BODY_TOO_LARGE', 'The request body is too large.') })
    await click('Approve')
    expect(screen.getByTestId('decision-error')).toHaveTextContent('The request body is too large.')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })
})

describe('OperatorDesk countdown and window', () => {
  it('counts down against the server clock, announcing only a few coarse steps', async () => {
    const { tick } = setup()
    const live = () => screen.getByTestId('countdown').querySelector('[role="status"]')!.textContent
    expect(screen.getByTestId('countdown')).toHaveTextContent('20 s left to decide')
    expect(live()).toBe('')
    await tick(5000)
    expect(screen.getByTestId('countdown')).toHaveTextContent('15 s left to decide')
    expect(live()).toBe('')
    await tick(6000)
    expect(screen.getByTestId('countdown')).toHaveTextContent('9 s left to decide')
    expect(live()).toBe('Under 10 seconds left to decide')
    await tick(5000)
    expect(screen.getByTestId('countdown')).toHaveTextContent('4 s left to decide')
    expect(live()).toBe('Under 5 seconds left to decide')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('switches the controls off and says the window closed as soon as the deadline passes, before the server says so', async () => {
    const { tick } = setup()
    await tick(19_900)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
    await tick(200)
    expect(screen.getByTestId('countdown')).toHaveTextContent('Window closed - held automatically')
    expect(screen.getByTestId('proposal-state')).toHaveTextContent('Window closed - held automatically')
    expect(screen.getByTestId('window-closed')).toHaveTextContent('This cue will not air.')
    for (const name of ['Approve', 'Hold', 'Override']) expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.getByTestId('countdown').querySelector('[role="status"]')).toHaveTextContent('Window closed - held automatically')
    expect(screen.getByTestId('desk-proposal')).toHaveAttribute('data-state', 'PENDING')
  })

  it('also locks an open override editor when the window closes', async () => {
    const { click, tick } = setup()
    await click('Override')
    fireEvent.change(screen.getByRole('textbox', { name: 'English Headline' }), { target: { value: 'Edited' } })
    expect(screen.getByRole('button', { name: 'Save override' })).toBeEnabled()
    await tick(21_000)
    expect(screen.getByRole('button', { name: 'Save override' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'English Headline' })).toBeDisabled()
  })

  it('moves a proposal to the decided list when the server confirms the automatic hold', async () => {
    const state = deskWith([proposal()])
    const { tick, rerender } = setup({ state })
    await tick(21_000)
    rerender(deskReducer(state, message({ type: 'decision', payload: decision({ state: 'AUTO_HELD', decidedAtMs: 21_010 }) }, 2)))
    const card = screen.getByTestId('desk-proposal')
    expect(card).toHaveAttribute('data-state', 'AUTO_HELD')
    expect(within(card).getByTestId('proposal-state')).toHaveTextContent('Held automatically: no decision in time')
    expect(screen.queryByRole('list', { name: 'Cues awaiting a decision' })).not.toBeInTheDocument()
  })

  it('re-syncs from a heartbeat: a late tab with a drifting local clock still shows the real time left', async () => {
    const state = deskWith([proposal()])
    const { tick, rerender } = setup({ state })
    await tick(2000)
    expect(screen.getByTestId('countdown')).toHaveTextContent('18 s left to decide')
    rerender(deskReducer(state, message({ type: 'heartbeat', payload: { elapsedMs: 13_000 } }, 1, 52_000)))
    await tick(0)
    expect(screen.getByTestId('countdown')).toHaveTextContent('8 s left to decide')
  })

  it('switches decisions off when the desk stream is not live, and offers to reconnect after an error', async () => {
    const base = deskWith([proposal()])
    const closed = deskReducer(base, { type: 'status', connection: 'error', message: 'The operator desk connection closed.' })
    const { onReconnect, click } = setup({ state: closed })
    for (const name of ['Approve', 'Hold', 'Override']) expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.getByText('The desk is not receiving updates, so decisions are switched off.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('The operator desk connection closed.')
    await click('Reconnect desk')
    expect(onReconnect).toHaveBeenCalledOnce()
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Desk disconnected')
  })

  it('keeps decisions available while the desk reconnects', () => {
    const reconnecting = deskReducer(deskWith([proposal()]), { type: 'status', connection: 'reconnecting', message: 'The desk connection was interrupted; reconnecting…' })
    setup({ state: reconnecting })
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
    expect(screen.getByTestId('desk-connection')).toHaveTextContent('Desk reconnecting…')
  })
})

describe('OperatorDesk states', () => {
  it('explains each stage of a run that has no proposals to decide', () => {
    const first = setup({ state: initialDeskState, phase: 'idle', logUrl: null })
    expect(screen.getByText('Start an operator-gated run to receive cue proposals here.')).toBeVisible()
    expect(screen.queryByRole('link', { name: /decision log/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Operator identity is not authenticated/)).toBeVisible()
    first.unmount()
    vi.useRealTimers()

    const creating = setup({ state: initialDeskState, phase: 'creating', logUrl: null })
    expect(screen.getByText('Creating the session…')).toBeVisible()
    creating.unmount()
    vi.useRealTimers()

    const quiet = setup({ state: deskWith([]) })
    expect(screen.getByText(/No cue is waiting for a decision\. The next one appears about 20 s before it would air\./)).toBeVisible()
    expect(screen.getByTestId('desk-pending-count')).toHaveTextContent('No cue awaiting a decision')
    expect(screen.getByTestId('desk-pending-count')).toHaveAttribute('role', 'status')
    quiet.unmount()
    vi.useRealTimers()

    const ended = setup({ state: deskReducer(deskWith([proposal()]), { type: 'status', connection: 'ended', message: 'The operator-gated session ended: it expired or the server restarted. Start a new run to continue.' }), phase: 'ended', logUrl: null })
    expect(screen.getByRole('alert')).toHaveTextContent('The operator-gated session ended')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    ended.unmount()
    vi.useRealTimers()

    setup({ state: deskReducer(deskWith([proposal()]), { type: 'stopped', message: 'Stopped: the desk no longer receives updates.' }), phase: 'stopped' })
    expect(screen.getByText(/Stopped: the desk no longer receives updates\. Start a new run to continue\./)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('can be collapsed in its compact form while still showing how many cues wait', async () => {
    const { click } = setup({ variant: 'compact' })
    const toggle = screen.getByRole('button', { name: 'Collapse' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible()
    await click('Collapse')
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.getByTestId('desk-pending-count')).toHaveTextContent('1 awaiting a decision')
    await click('Expand')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible()
  })

  it('has no collapse control in its full form', () => {
    setup({ variant: 'full' })
    expect(screen.queryByRole('button', { name: /Collapse|Expand/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('operator-desk')).toHaveAttribute('data-variant', 'full')
  })
})
