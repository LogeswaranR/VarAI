import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MatchControls } from './MatchControls'
import type { StreamStatus } from './match-state'
import { metadata } from './match-test-data'
import { narrationStatus, session } from './gate-test-data'
import { speedChoices } from './match-format'
import { GATED_SPEEDS } from './gate-model'

function setup(overrides: Partial<Parameters<typeof MatchControls>[0]> = {}) {
  const handlers = { onMode: vi.fn(), onIncremental: vi.fn(), onSpeed: vi.fn(), onStart: vi.fn(), onStop: vi.fn(), onJump: vi.fn() }
  const props: Parameters<typeof MatchControls>[0] = {
    metadata, status: 'idle', clockMs: 0, speed: 60, speedChoice: 60, speeds: speedChoices, message: null, mode: 'preview',
    gated: { session: null, narration: null, narrationFailed: false }, incremental: false, ...handlers, ...overrides,
  }
  const view = render(<MatchControls {...props} />)
  fireEvent.click(screen.getByText('Playback options & guide'))
  return { ...handlers, view, props }
}

const gatedProps = (status: StreamStatus = 'idle', extra: Partial<Parameters<typeof MatchControls>[0]> = {}) => ({
  mode: 'gated' as const, status, speeds: GATED_SPEEDS, speedChoice: 10, speed: 10, ...extra,
})

describe('MatchControls mode switch', () => {
  it('is a labelled group of two radios and reports the mode the user picks', () => {
    const { onMode } = setup()
    const group = screen.getByRole('group', { name: 'Mode' })
    const [preview, gated] = within(group).getAllByRole('radio')
    expect(preview).toBeChecked()
    expect(preview).toHaveAccessibleName('Preview')
    expect(preview).toHaveAccessibleDescription('Rules only, no approval step')
    expect(gated).toHaveAccessibleName('Operator-gated')
    expect(gated).toHaveAccessibleDescription('A person approves each cue')
    fireEvent.click(gated)
    expect(onMode).toHaveBeenCalledWith('gated')
    fireEvent.click(preview)
    expect(onMode).toHaveBeenCalledTimes(1)
  })

  it('shows which mode is on and keeps the labelled radio keyboard-reachable', () => {
    setup(gatedProps())
    const [, gated] = within(screen.getByRole('group', { name: 'Mode' })).getAllByRole('radio')
    expect(gated).toBeChecked()
    gated.focus()
    expect(gated).toHaveFocus()
  })
})

describe('MatchControls in Preview', () => {
  it('labels causal processing, hides future highlights and requires an explicit start', () => {
    const { onStart, onIncremental } = setup({ incremental: true })
    expect(screen.queryByRole('group', { name: 'Jump to a key moment' })).not.toBeInTheDocument()
    expect(screen.getByTestId('processing-mode')).toHaveTextContent('future goals and review outcomes are unavailable')
    expect(onStart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start live simulation' }))
    expect(onStart).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Incremental live simulation' }))
    expect(onIncremental).toHaveBeenCalledWith(false)
  })

  it('keeps the existing controls and says what the feed is', () => {
    const { onStart, onJump } = setup()
    expect(screen.getByTestId('mode-note')).toHaveTextContent('Preview - deterministic rules only, not operator-approved')
    expect(screen.queryByTestId('narration-status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kick off' }))
    expect(onStart).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: /67:21 · AVC goal, ruled out on review/ }))
    expect(onJump).toHaveBeenCalledWith(4_011_000)
    expect(screen.queryByRole('button', { name: 'Jump to 66:00' })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Speed')).getAllByRole('option')).toHaveLength(5)
    expect(screen.getByTestId('match-status')).toHaveTextContent('Ready · a 92-minute synthetic match. Nothing plays until you start it.')
  })

  it('offers a replay when a run has finished, and disables the jumps while one is active', () => {
    setup({ status: 'complete' })
    expect(screen.getByRole('button', { name: 'Replay from kick-off' })).toBeEnabled()
    document.body.innerHTML = ''
    setup({ status: 'streaming' })
    expect(screen.getByRole('button', { name: 'Kick off' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /67:21/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Full-time recap' })).toBeDisabled()
  })

  it('offers a no-model full-time catch-up only in preview', () => {
    const { onJump, view, props } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Full-time recap' }))
    expect(onJump).toHaveBeenCalledWith(metadata.durationMs)
    view.rerender(<MatchControls {...props} mode="gated" />)
    expect(screen.queryByRole('button', { name: 'Full-time recap' })).not.toBeInTheDocument()
  })
})

describe('MatchControls in operator-gated mode', () => {
  it('offers the gated speeds, the 66:00 jump and the key-moment jumps, each starting a new session', () => {
    const { onSpeed, onStart, onJump } = setup(gatedProps())
    expect(within(screen.getByLabelText('Speed')).getAllByRole('option').map(option => option.textContent)).toEqual(['1×', '2×', '5×', '10×'])
    expect(screen.getByLabelText<HTMLSelectElement>('Speed').value).toBe('10')
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '5' } })
    expect(onSpeed).toHaveBeenCalledWith(5)
    fireEvent.click(screen.getByRole('button', { name: 'Start gated run' }))
    expect(onStart).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: 'Jump to 66:00' }))
    expect(onJump).toHaveBeenCalledWith(3_960_000)
    fireEvent.click(screen.getByRole('button', { name: /88:10 · AVC goal \(1–1\)/ }))
    expect(onJump).toHaveBeenLastCalledWith(5_260_400)
    expect(screen.getByRole('group', { name: 'Jump to a key moment' })).toHaveTextContent('Jump to (starts a new session)')
  })

  it('states the real-time limit and the delay, reading the delay from the session once there is one', () => {
    const { view, props } = setup(gatedProps())
    expect(screen.getByTestId('mode-note')).toHaveTextContent(
      'Operator-gated runs at 10x or slower because the decision window is real time. The program is delayed by the decision window (20 s). That is the demo default')
    view.rerender(<MatchControls {...props} {...gatedProps('streaming', { gated: { session: session({ leadSeconds: 4 }), narration: null, narrationFailed: false } })} />)
    expect(screen.getByTestId('mode-note')).toHaveTextContent('The program is delayed by the decision window (4 s).')
    expect(screen.getByTestId('mode-note')).not.toHaveTextContent('demo default')
  })

  it('reports the narration status honestly in each state', () => {
    const states = [
      [{ narration: narrationStatus(), narrationFailed: false }, 'AI narration: off - deterministic English only'],
      [{ narration: narrationStatus({ enabled: true, deployment: 'gpt-demo', callsUsed: 12, callLimit: 160 }), narrationFailed: false }, 'AI narration: on (gpt-demo) - 12/160 model calls used'],
      [{ narration: narrationStatus({ enabled: true, deployment: null }), narrationFailed: false }, 'AI narration: on (deployment not reported)'],
      [{ narration: null, narrationFailed: false }, 'AI narration: checking status…'],
      [{ narration: null, narrationFailed: true }, 'AI narration: status unavailable'],
    ] as const
    for (const [state, text] of states) {
      const { view } = setup(gatedProps('idle', { gated: { session: null, ...state } }))
      expect(screen.getByTestId('narration-status')).toHaveTextContent(text)
      view.unmount()
    }
  })

  it.each([
    ['idle', null, 'Start gated run'],
    ['complete', session(), 'Restart gated run'],
    ['stopped', session(), 'Restart gated run'],
    ['error', session(), 'Restart gated run'],
    ['error', null, 'Try again'],
  ] as const)('labels the start button for a %s run %s as "%s"', (status, existing, label) => {
    setup(gatedProps(status, { gated: { session: existing, narration: null, narrationFailed: false }, message: 'It failed.' }))
    expect(screen.getByRole('button', { name: label })).toBeEnabled()
  })

  it('disables the start and jump buttons while a session is being created or running, and keeps Stop reachable', () => {
    for (const status of ['connecting', 'streaming', 'reconnecting'] as const) {
      const { view } = setup(gatedProps(status))
      expect(screen.getByRole('button', { name: 'Start gated run' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Jump to 66:00' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
      view.unmount()
    }
  })

  it('describes each stage in words, naming the broadcast delay while it runs', () => {
    const withLead = { gated: { session: session({ leadSeconds: 20 }), narration: null, narrationFailed: false } }
    const text = (status: StreamStatus, extra: Partial<Parameters<typeof MatchControls>[0]> = {}) => {
      const { view } = setup(gatedProps(status, { clockMs: 3_960_000, ...extra }))
      const content = screen.getByTestId('match-status').textContent
      view.unmount()
      return content
    }
    expect(text('idle')).toContain('operator-gated. Nothing runs until you start a session')
    expect(text('connecting')).toBe('Starting an operator-gated session…')
    expect(text('streaming', withLead)).toBe('Operator-gated · playing at 10× · match clock 66:00. The program runs 20 s behind the desk.')
    expect(text('stopped')).toBe('Stopped at 66:00. Both streams are closed; the session stays on the server until it expires.')
    expect(text('error', { message: 'The demo already has the maximum number of live sessions.' })).toBe('The demo already has the maximum number of live sessions.')
    expect(text('complete')).toBe('Full time · 66:00 played.')
  })

  it('keeps the status in a polite live region', () => {
    setup(gatedProps())
    const status = screen.getByTestId('match-status')
    expect(status).toHaveAttribute('role', 'status')
    expect(status).toHaveAttribute('aria-live', 'polite')
  })
})
