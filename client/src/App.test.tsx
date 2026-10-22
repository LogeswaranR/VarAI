import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('VarAI scaffold', () => {
  it('identifies the prototype without claiming to be an AI referee', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'VarAI', level: 1 })).toBeVisible()
    expect(screen.getByText('Synthetic prototype - scaffold only')).toBeVisible()
    expect(screen.getByText(/not an AI referee/)).toBeVisible()
  })

  it('states that review and explanation features are not implemented', () => {
    render(<App />)

    expect(screen.getByText(/Review features are not implemented/)).toBeVisible()
    expect(
      screen.getByText('Authored and live-model explanations are not available.'),
    ).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('makes no startup fetch and provides an explicit backend health link', () => {
    const fetch = vi.fn(() => {
      throw new Error('The scaffold must not make automatic network requests.')
    })
    vi.stubGlobal('fetch', fetch)

    render(<App />)

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Check backend health' })).toHaveAttribute(
      'href',
      '/health',
    )
  })
})
