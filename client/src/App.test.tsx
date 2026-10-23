import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../../tests/contract-stubs/client'
import { fixture } from './harness/fixtures'
import { UI_HOOKS } from './contracts/ui-hooks'
import App from './App'

describe('G01 normal entry with all four real panels', () => {
  beforeEach(() => { window.history.replaceState({}, '', '/?scenario=S1') })
  afterEach(() => { window.history.replaceState({}, '', '/') })

  it('loads through fetch, replays, explicitly explains, focuses sources and resets after comparison', async () => {
    const repository = createScenarioRepositoryStub()
    const client = createExplanationClientStub()
    const operations: string[] = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(options!.body as string)
      operations.push(body.operationName)
      const data = body.operationName === 'Scenarios' ? { scenarios: await repository.list() }
        : body.operationName === 'Scenario' ? { scenario: await repository.get(body.variables.id, body.variables.requestId) }
          : { explain: await client.explain(body.variables.input) }
      return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } })
    }))
    render(<App />)
    await screen.findByTestId(UI_HOOKS.replayPlay)
    expect(screen.getByRole('heading', { name: 'Review room', level: 1 })).toBeVisible()
    expect(screen.getByText(/not an AI referee/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Backend health' })).toHaveAttribute('href', '/health')
    expect(screen.queryByText(/Placeholder/)).not.toBeInTheDocument()
    expect(screen.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
    expect(screen.getByTestId(UI_HOOKS.scenePanel)).toBeVisible()
    expect(screen.getByTestId(UI_HOOKS.evidencePanel)).toBeVisible()
    expect(operations).not.toContain('Explain')
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByTestId(UI_HOOKS.replayPlay))
      await act(async () => { await vi.advanceTimersByTimeAsync(fixture('S1').events.at(-1)!.offsetMs) })
    } finally { vi.useRealTimers() }
    await waitFor(() => expect(screen.getByTestId(UI_HOOKS.explainButton)).toBeEnabled())
    expect(operations).not.toContain('Explain')
    fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
    await screen.findByTestId(UI_HOOKS.recapPanel)
    fireEvent.click(screen.getAllByTestId(UI_HOOKS.claimSourceLink)[0])
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-source-id'))
    fireEvent.click(await screen.findByTestId(UI_HOOKS.comparisonToggle))
    await waitFor(() => expect(screen.getByTestId(UI_HOOKS.scenarioSelect)).toHaveValue('S2'))
    expect(screen.queryByTestId(UI_HOOKS.recapPanel)).not.toBeInTheDocument()
    expect(operations.filter(operation => operation === 'Explain')).toHaveLength(1)
  })

  it('shows a recoverable transport failure rather than falling back to fixtures or a default scene', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('Offline', { status: 503 })))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('LOAD_FAILED')
    expect(screen.getByRole('button', { name: 'Reload scenario choices' })).toBeVisible()
    expect(screen.queryByTestId(UI_HOOKS.scenePanel)).not.toBeInTheDocument()
  })
})
