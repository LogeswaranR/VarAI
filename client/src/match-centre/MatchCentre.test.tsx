import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MatchMetadata, MatchStreamMessage } from './match-model'
import type { MatchStreamHandlers, MatchStreamOptions } from './match-stream'
import { MatchCentre } from './MatchCentre'
import { cue, event, metadata, momentum, resetSequence } from './match-test-data'
import { PROFILE_STORAGE_KEY } from './profile'

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

async function setup(options: { storage?: ReturnType<typeof memoryStorage>; loadMetadata?: () => Promise<MatchMetadata> } = {}) {
  resetSequence()
  const handlers: { current?: MatchStreamHandlers } = {}
  const close = vi.fn()
  const connect = vi.fn((_options: MatchStreamOptions, callbacks: MatchStreamHandlers) => {
    handlers.current = callbacks
    return close
  })
  const storage = options.storage ?? memoryStorage()
  const view = render(<MatchCentre streamClient={{ connect }} storage={storage.api}
    loadMetadata={options.loadMetadata ?? (async () => metadata)} />)
  if (!options.loadMetadata) await screen.findByTestId('scorebug')
  vi.useFakeTimers()
  const deliver = async (...messages: MatchStreamMessage[]) => {
    await act(async () => {
      for (const message of messages) handlers.current?.onMessage(message)
      await vi.advanceTimersByTimeAsync(60)
    })
  }
  return { connect, close, deliver, handlers, storage, view }
}

const play = () => fireEvent.click(screen.getByRole('button', { name: 'Kick off' }))

afterEach(() => { vi.useRealTimers() })

describe('MatchCentre', () => {
  it('describes the match first and starts nothing until the viewer asks', async () => {
    const { connect } = await setup()

    expect(screen.getByRole('heading', { name: 'Match centre', level: 1 })).toBeVisible()
    expect(screen.getByTestId('synthetic-badge')).toHaveTextContent('generated, not real data')
    expect(screen.getByTestId('match-status')).toHaveTextContent('Nothing plays until you start it')
    expect(within(screen.getByLabelText('Favourite club')).getAllByRole('option')).toHaveLength(2)
    expect(within(screen.getByLabelText('Follow a player')).getAllByRole('option')).toHaveLength(22)
    expect(screen.getByTestId('scoreline')).toHaveTextContent('0 – 0')
    expect(screen.getByRole('button', { name: 'Kick off' })).toBeEnabled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('kicks off at the chosen speed, follows the clock and score, and holds then clears the on-air cue', async () => {
    const { connect, deliver } = await setup()
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '120' } })
    play()
    expect(connect).toHaveBeenCalledWith({ speed: 120, fromSeconds: 0 }, expect.any(Object))
    expect(screen.getByTestId('match-status')).toHaveTextContent('Connecting')

    const goal = event({ eventType: 'GOAL', matchClockMs: 4_041_000, scoreAfter: { home: 1, away: 0 } })
    await deliver(
      { type: 'match', payload: metadata }, { type: 'event', payload: goal },
      { type: 'overlay', payload: cue({ overlayId: 'OV-GOAL', kind: 'GOAL', priority: 3, durationMs: 9000, inMs: 4_041_800, outMs: 4_050_800,
        headline: 'Goal for Alder Vale Comets: Ravi Sorrell', lowerThird: { title: 'GOAL · AVC', subtitle: 'Ravi Sorrell · 67:21 · AVC 1–0 BRL' } }) },
      { type: 'momentum', payload: momentum() })

    expect(screen.getByTestId('scoreline')).toHaveTextContent('1 – 0')
    expect(screen.getByTestId('match-clock')).toHaveTextContent('67:21')
    expect(screen.getByTestId('match-status')).toHaveTextContent('Playing at 120×')
    expect(screen.getByTestId('lower-third')).toHaveTextContent('GOAL · AVC')
    expect(screen.getByTestId('moment-card')).toHaveTextContent('Goal for Alder Vale Comets: Ravi Sorrell')
    expect(screen.getByTestId('momentum-headline')).toHaveTextContent('Alder Vale Comets in control')

    await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
    expect(screen.queryByTestId('lower-third')).not.toBeInTheDocument()
    expect(screen.getByTestId('moment-card')).toBeVisible()
  })

  it('gives fans, analysts and studio staff genuinely different experiences of the same stream', async () => {
    const { deliver } = await setup()
    play()
    const first = event()
    await deliver(
      { type: 'match', payload: metadata }, { type: 'event', payload: first },
      { type: 'overlay', payload: cue({ sourceEventIds: [first.eventId] }) }, { type: 'momentum', payload: momentum() })

    expect(screen.getByRole('heading', { name: '#9 Ravi Sorrell' })).toBeVisible()
    expect(screen.getByTestId('player-stats')).toHaveTextContent('Involvements1')
    expect(screen.getByText('Why it matters')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Team metrics' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Control index by minute/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Analyst/ }))
    expect(screen.getByRole('heading', { name: 'Team metrics' })).toBeVisible()
    expect(screen.getByTestId('team-stats')).toHaveTextContent('Passes completed1/1 (100%)')
    expect(screen.getByRole('img', { name: /Control index by minute/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Raw event feed' })).toBeVisible()
    expect(screen.getByText('Pass difficulty')).toBeVisible()
    expect(screen.getByText('92/100')).toBeVisible()

    fireEvent.click(screen.getByRole('radio', { name: /Studio/ }))
    expect(screen.getByRole('heading', { name: 'Studio cue queue' })).toBeVisible()
    expect(screen.getAllByTestId('cue-row')).toHaveLength(1)
    expect(screen.getByTestId('cue-json')).toHaveTextContent('"schemaVersion": "1.0"')
    expect(screen.getByRole('heading', { name: 'On air' })).toBeVisible()
    expect(screen.getByTestId('on-air-state')).toHaveTextContent('ON AIR')
    expect(screen.getByTestId('on-air-title')).toHaveTextContent('JASPER QUILL · #7')
    expect(screen.queryByRole('img', { name: /Control index by minute/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('player-stats')).not.toBeInTheDocument()
    expect(screen.queryByTestId('moment-card')).not.toBeInTheDocument()
  })

  it('remembers persona, club and player on this device and repairs nothing it did not store', async () => {
    const storage = memoryStorage()
    const { view } = await setup({ storage })
    fireEvent.click(screen.getByRole('radio', { name: /Analyst/ }))
    fireEvent.change(screen.getByLabelText('Favourite club'), { target: { value: 'LANTERNS' } })
    expect(screen.getByLabelText<HTMLSelectElement>('Follow a player').value).toBe('LANTERNS-09')
    fireEvent.change(screen.getByLabelText('Follow a player'), { target: { value: 'LANTERNS-06' } })
    expect(JSON.parse(storage.values.get(PROFILE_STORAGE_KEY)!)).toEqual({ persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06' })

    view.unmount()
    vi.useRealTimers()
    await setup({ storage })
    expect(screen.getByRole('radio', { name: /Analyst/ })).toBeChecked()
    expect(screen.getByLabelText<HTMLSelectElement>('Favourite club').value).toBe('LANTERNS')
    expect(screen.getByLabelText<HTMLSelectElement>('Follow a player').value).toBe('LANTERNS-06')
  })

  it('jumps to a key moment by restarting a few seconds before it', async () => {
    const { connect } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /67:21 · AVC goal, ruled out on review/ }))
    expect(connect).toHaveBeenCalledWith({ speed: 60, fromSeconds: 4011 }, expect.any(Object))
  })

  it('links a reviewed moment to the evidence scenario and highlights cited events on the pitch', async () => {
    const { deliver } = await setup()
    play()
    const source = event({ x: 88.5, y: 30.2 })
    await deliver(
      { type: 'match', payload: metadata }, { type: 'event', payload: source },
      { type: 'overlay', payload: cue({ kind: 'GOAL_DISALLOWED', scenarioId: 'S1', sourceEventIds: [source.eventId] }) })

    expect(screen.getByRole('link', { name: /Open the evidence review/ })).toHaveAttribute('href', '/?scenario=S1')
    expect(screen.queryByTestId('highlighted-event')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Show source event ${source.eventId} on the pitch` }))
    expect(screen.getByTestId('highlighted-event')).toHaveAttribute('cx', '88.5')
  })

  it('reports a failed stream rather than pretending to play and offers a replay', async () => {
    const { deliver, handlers } = await setup()
    play()
    await deliver({ type: 'match', payload: metadata })
    await act(async () => { handlers.current?.onError('The match stream skipped an event.') })

    expect(screen.getByTestId('match-status')).toHaveTextContent('The match stream skipped an event.')
    expect(screen.getByRole('button', { name: 'Replay from kick-off' })).toBeEnabled()
  })

  it('shows a recoverable error and keeps playback disabled when the match cannot be loaded', async () => {
    resetSequence()
    render(<MatchCentre streamClient={{ connect: vi.fn() }} storage={memoryStorage().api}
      loadMetadata={async () => { throw new Error('The match description could not be loaded (HTTP 503).') }} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503')
    expect(screen.getByRole('button', { name: 'Kick off' })).toBeDisabled()
    expect(screen.queryByTestId('scorebug')).not.toBeInTheDocument()
  })
})
