import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchRecap } from './MatchRecap'
import { initialMatchState } from './match-state'
import type { MatchState } from './match-state'
import { event, metadata, resetSequence } from './match-test-data'
import type { AudienceProfile } from './profile'
import { downloadJson } from './match-format'

vi.mock('./match-format', () => ({ downloadJson: vi.fn() }))
const profile: AudienceProfile = { persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09', language: 'ta' }
beforeEach(() => { resetSequence(); vi.clearAllMocks() })

function setup(state: MatchState = initialMatchState) {
  const onHighlight = vi.fn()
  const view = render(<MatchRecap metadata={metadata} state={state} profile={profile} onHighlight={onHighlight} />)
  return { onHighlight, ...view }
}

describe('MatchRecap', () => {
  it('explains how to start without inventing a recap, AI provenance or Tamil translation', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Automatic match recap' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download recap JSON' })).toBeDisabled()
    expect(screen.getByTestId('match-recap')).toHaveTextContent('not AI-written or operator-approved')
    expect(screen.getByTestId('match-recap')).toHaveTextContent('Tamil recap is not available; showing English')
    expect(screen.getByTestId('match-recap')).toHaveAttribute('lang', 'en')
  })

  it('exports the exact evidence-backed recap, highlights sources and keeps halftime separate', () => {
    const first = event({ period: 1, matchClockMs: 1000 })
    const half = event({ period: 1, matchClockMs: 2_700_000, eventType: 'PERIOD_END', scoreAfter: { home: 0, away: 0 } })
    const goal = event({ matchClockMs: 4_000_000, eventType: 'GOAL', scoreAfter: { home: 1, away: 0 } })
    const end = event({ matchClockMs: metadata.durationMs, eventType: 'PERIOD_END', scoreAfter: { home: 1, away: 0 } })
    const state: MatchState = { ...initialMatchState, events: [first, half, goal, end], clockMs: metadata.durationMs, status: 'complete',
      complete: { matchId: metadata.matchId, eventCount: 4, momentumCount: 0, overlayCount: 0, finalScore: { home: 1, away: 0 } } }
    const { onHighlight } = setup(state)
    expect(screen.getByRole('heading', { name: 'Full-time recap: AVC 1-0 BRL' })).toBeVisible()
    expect(screen.getByTestId('recap-story')).toHaveTextContent('Alder Vale Comets won.')
    fireEvent.click(screen.getByRole('button', { name: 'Download recap JSON' }))
    expect(downloadJson).toHaveBeenCalledWith('syn-match-01-full_time-recap.json',
      expect.objectContaining({ stage: 'FULL_TIME', source: 'DETERMINISTIC', operatorApproved: false, throughMs: metadata.durationMs }))
    fireEvent.click(screen.getByText('Turning points and recap evidence'))
    fireEvent.click(screen.getByRole('button', { name: /^Show recap evidence: At / }))
    expect(onHighlight).toHaveBeenCalledWith([goal.eventId])
    fireEvent.click(screen.getByRole('button', { name: 'Half-time snapshot' }))
    expect(screen.getByRole('heading', { name: 'Half-time recap: AVC 0-0 BRL' })).toBeVisible()
    expect(within(screen.getByTestId('recap-story')).queryByText(/won/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Latest recap' }))
    expect(screen.getByRole('heading', { name: 'Full-time recap: AVC 1-0 BRL' })).toBeVisible()
  })

  it('labels interrupted results as incomplete, even after a final-period event', () => {
    const end = event({ matchClockMs: metadata.durationMs, eventType: 'PERIOD_END', scoreAfter: { home: 1, away: 1 } })
    setup({ ...initialMatchState, events: [end], clockMs: metadata.durationMs, status: 'error' })
    expect(screen.getByRole('heading', { name: 'Match so far: AVC 1-1 BRL' })).toBeVisible()
    expect(screen.getByTestId('match-recap')).toHaveTextContent('not a final result')
  })
})
