import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BroadcastFrame } from './BroadcastFrame'
import { MomentFeed } from './MomentFeed'
import { MomentumPanel } from './MomentumPanel'
import { PlayerFocus } from './PlayerFocus'
import { ProfileBar } from './ProfileBar'
import { cue, event, metadata, momentum } from './match-test-data'

describe('visual-first match presentation', () => {
  it('keeps personalisation collapsed without hiding the audience switch', () => {
    const onLanguage = vi.fn()
    render(<ProfileBar metadata={metadata} profile={{ persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09' }}
      languageEnabled onPersona={vi.fn()} onClub={vi.fn()} onPlayer={vi.fn()} onLanguage={onLanguage} />)
    expect(screen.getByRole('radio', { name: /Fan/ })).toBeVisible()
    expect(screen.getByLabelText('Favourite club')).not.toBeVisible()
    fireEvent.click(screen.getByText('Personalise'))
    expect(screen.getByLabelText('Favourite club')).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: 'தமிழ்' }))
    expect(onLanguage).toHaveBeenCalledWith('ta')
  })

  it('shows six recent fan cards, one explanation, and keeps older evidence reachable', () => {
    const onHighlight = vi.fn()
    const cues = Array.from({ length: 9 }, (_, index) => cue({ overlayId: `OV-${index}`, headline: `Moment ${index}` }))
    render(<MomentFeed metadata={metadata} cues={cues} persona="fan" clubId="COMETS" playerId="COMETS-09"
      gated={false} language="en" onHighlight={onHighlight} />)
    const cards = screen.getAllByTestId('moment-card')
    expect(cards).toHaveLength(9)
    cards.slice(0, 6).forEach(card => expect(card).toBeVisible())
    cards.slice(6).forEach(card => expect(card).not.toBeVisible())
    expect(within(cards[0]).getByText('Why it matters')).toBeVisible()
    expect(within(cards[1]).getByText('Why it matters')).not.toBeVisible()
    fireEvent.click(screen.getByText('Earlier moments (3)'))
    expect(cards[8]).toBeVisible()
    fireEvent.click(within(cards[8]).getByText('How we know'))
    expect(within(cards[8]).getByText('Why it matters')).toBeVisible()
    fireEvent.click(within(cards[8]).getByRole('button', { name: /Show source event/ }))
    expect(onHighlight).toHaveBeenCalledWith(cues[0].sourceEventIds)
  })

  it('keeps every analyst cue and its evidence expanded', () => {
    render(<MomentFeed metadata={metadata} cues={Array.from({ length: 9 }, (_, index) => cue({ overlayId: `OV-${index}` }))}
      persona="analyst" clubId="COMETS" playerId={null} gated={false} language="en" onHighlight={vi.fn()} />)
    screen.getAllByTestId('moment-card').forEach(card => {
      expect(card).toBeVisible()
      expect(within(card).getByRole('group', { name: 'Source events' })).toBeVisible()
    })
    expect(screen.queryByText(/Earlier moments/)).not.toBeInTheDocument()
  })

  it('uses actual last-action coordinates and actor, not period-end metadata, for pitch markers', () => {
    const pass = event({ x: 60, y: 30, endX: 80, endY: 22, matchClockMs: 5_510_000 })
    const end = event({ eventType: 'PERIOD_END', playerId: null, x: 52.5, y: 34, endX: null, endY: null,
      matchClockMs: metadata.durationMs })
    render(<BroadcastFrame metadata={metadata} recent={[pass, end]} highlighted={[]} clockMs={metadata.durationMs}
      score={{ home: 1, away: 1 }} cue={null} status="complete" clubId="COMETS" speed={60} gated={false} language="en" />)
    expect(screen.getByTestId('last-action')).toHaveTextContent('pass#9 Ravi Sorrell')
    const dot = screen.getByTestId('last-action-marker').querySelector('circle')
    expect(dot).toHaveAttribute('cx', '80')
    expect(dot).toHaveAttribute('cy', '22')
    expect(screen.getByRole('progressbar', { name: 'Match progress' })).toHaveAttribute('aria-valuetext', '92:00')
    expect(screen.getByTestId('scoreline')).toHaveTextContent('1 – 1')
  })

  it('does not invent a player or a tracked ball before events arrive', () => {
    render(<BroadcastFrame metadata={metadata} recent={[]} highlighted={[]} clockMs={0} score={{ home: 0, away: 0 }}
      cue={null} status="idle" clubId="COMETS" speed={60} gated={false} language="en" />)
    expect(screen.getByText('Your match. Your perspective.')).toBeVisible()
    expect(screen.queryByTestId('last-action-marker')).not.toBeInTheDocument()
    expect(screen.getByText('Synthetic coordinates · not live tracking or video')).toBeVisible()
  })

  it('shows unknown rhythm before a sample, and an accurate 100/0 bar without a minimum-width distortion', () => {
    const props = { metadata, samples: [], goals: [], persona: 'fan' as const }
    const view = render(<MomentumPanel {...props} />)
    expect(screen.getByRole('img', { name: 'Share of ball actions: waiting for match data.' })).toBeVisible()
    expect(screen.queryByText(/50%/)).not.toBeInTheDocument()
    view.rerender(<MomentumPanel {...props} samples={[momentum({ homeBallActionSharePct: 100 })]} />)
    const bar = screen.getByRole('img', { name: /AVC 100 percent, BRL 0 percent/ })
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' })
    expect(screen.getByRole('img', { name: /Control index by minute/ })).toBeVisible()
  })

  it('keeps the player summary short and expands the detailed event history on demand', () => {
    render(<PlayerFocus metadata={metadata} events={[event()]} cues={[]} playerId="COMETS-09" />)
    expect(within(screen.getByTestId('player-stats')).getAllByRole('definition')).toHaveLength(3)
    expect(screen.getByText('Top carry speed')).not.toBeVisible()
    fireEvent.click(screen.getByText('Player stats & activity'))
    expect(screen.getByText('Top carry speed')).toBeVisible()
    expect(screen.getByRole('list', { name: 'Latest involvements for Ravi Sorrell' })).toBeVisible()
  })
})
