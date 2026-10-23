import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProfileBar } from './ProfileBar'
import { metadata } from './match-test-data'
import type { AudienceProfile } from './profile'

function setup(profile: AudienceProfile, languageEnabled: boolean) {
  const handlers = { onPersona: vi.fn(), onClub: vi.fn(), onPlayer: vi.fn(), onLanguage: vi.fn() }
  render(<ProfileBar metadata={metadata} profile={profile} languageEnabled={languageEnabled} {...handlers} />)
  return handlers
}

const base: AudienceProfile = { persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09' }

describe('ProfileBar language switch', () => {
  it('is a labelled pair of radios, English by default, and reports the language the user picks', () => {
    const { onLanguage } = setup(base, true)
    const group = screen.getByRole('group', { name: 'Language' })
    const english = within(group).getByRole('radio', { name: 'English' })
    const tamil = within(group).getByRole('radio', { name: 'தமிழ்' })
    expect(english).toBeChecked()
    expect(tamil).not.toBeChecked()
    expect(english).toBeEnabled()
    fireEvent.click(tamil)
    expect(onLanguage).toHaveBeenCalledWith('ta')
    expect(screen.queryByText('Tamil narration is available in operator-gated mode')).not.toBeInTheDocument()
  })

  it('marks the Tamil label as Tamil text so it is read and rendered in the right script', () => {
    setup(base, true)
    expect(screen.getByText('தமிழ்')).toHaveAttribute('lang', 'ta')
    expect(screen.getByText('English')).toHaveAttribute('lang', 'en')
  })

  it('shows the saved Tamil choice as selected', () => {
    setup({ ...base, language: 'ta' }, true)
    expect(screen.getByRole('radio', { name: 'தமிழ்' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked()
  })

  it('is switched off in Preview, says why, and keeps the saved choice visible', () => {
    setup({ ...base, language: 'ta' }, false)
    const tamil = screen.getByRole('radio', { name: 'தமிழ்' })
    const english = screen.getByRole('radio', { name: 'English' })
    expect(tamil).toBeChecked()
    expect(tamil).toBeDisabled()
    expect(english).toBeDisabled()
    expect(screen.getByText('Tamil narration is available in operator-gated mode')).toBeVisible()
    expect(screen.getByRole('group', { name: 'Language' })).toHaveAccessibleDescription('Tamil narration is available in operator-gated mode')
  })

  it('leaves the persona, club and player controls as they were', () => {
    const { onPersona, onClub, onPlayer } = setup(base, false)
    fireEvent.click(screen.getByRole('radio', { name: /Analyst/ }))
    fireEvent.change(screen.getByLabelText('Favourite club'), { target: { value: 'LANTERNS' } })
    fireEvent.change(screen.getByLabelText('Follow a player'), { target: { value: 'LANTERNS-06' } })
    expect(onPersona).toHaveBeenCalledWith('analyst')
    expect(onClub).toHaveBeenCalledWith('LANTERNS')
    expect(onPlayer).toHaveBeenCalledWith('LANTERNS-06')
  })
})
