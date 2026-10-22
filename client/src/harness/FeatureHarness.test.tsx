import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../../../tests/contract-stubs/client'
import type { ExplanationClient, SceneInput } from '../contracts/interfaces'
import type { ScenarioId } from '../contracts/graphql.generated'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { FeatureHarness } from './FeatureHarness'
import type { FeatureHarnessInput } from './FeatureHarness'
import { fixture, frontendPackages, probeSlots, snapshot } from './fixtures'
import type { HarnessStage } from './fixtures'

function inputs(id: ScenarioId = 'S1', stage: HarnessStage = 'review-ready'): FeatureHarnessInput {
  return {
    ...snapshot(fixture(id), stage, 1, null),
    repository: createScenarioRepositoryStub(),
    client: createExplanationClientStub(),
    pair: [fixture('S1'), fixture('S2')],
    inspectSources: vi.fn(), selectScenario: vi.fn(), slots: {},
  }
}

describe('isolated feature harness', () => {
  it('renders placeholders rather than pretending any package is complete', () => {
    render(<FeatureHarness {...inputs()} />)
    for (const id of frontendPackages) expect(screen.getByTestId(`placeholder-${id}`)).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each(frontendPackages)('%s mounts without any other feature implementation', id => {
    render(<FeatureHarness {...inputs()} slots={probeSlots(id)} />)
    expect(screen.getByTestId(`probe-${id}`)).toBeVisible()
    for (const other of frontendPackages.filter(value => value !== id)) {
      expect(screen.getByTestId(`placeholder-${other}`)).toBeVisible()
      expect(screen.queryByTestId(`probe-${other}`)).not.toBeInTheDocument()
    }
  })

  it('VAR-102 receives an independently injected scenario repository', async () => {
    const props = inputs()
    const list = vi.spyOn(props.repository, 'list')
    render(<FeatureHarness {...props} slots={probeSlots('VAR-102')} />)
    expect(list).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Exercise repository stub' }))
    expect(await screen.findByText('3 synthetic summaries received')).toBeVisible()
    expect(list).toHaveBeenCalledOnce()
  })

  it('VAR-103 accepts a caller-provided component and masked pre-pass inputs', () => {
    const props = inputs('S2', 'before-pass')
    function SuppliedScene({ diagram, visibleFacts }: SceneInput) {
      return <p>Injected scene: {diagram.status}, {diagram.markers.length} markers, {visibleFacts.length} facts</p>
    }
    render(<FeatureHarness {...props} slots={{ scene: SuppliedScene }} />)
    expect(screen.getByText('Injected scene: UNAVAILABLE, 0 markers, 0 facts')).toBeVisible()
    expect(screen.queryByTestId('placeholder-VAR-103')).not.toBeInTheDocument()
    expect(screen.getByTestId('placeholder-VAR-106')).toBeVisible()
  })

  it('VAR-103 receives the explicit missing-snapshot fixture', () => {
    render(<FeatureHarness {...inputs('S3')} slots={probeSlots('VAR-103')} />)
    expect(screen.getByTestId(UI_HOOKS.missingSnapshot)).toHaveTextContent('Pass-time snapshot unavailable')
  })

  it('VAR-104 receives only stage-visible context, including explicit unknowns', () => {
    const before = snapshot(fixture('S3'), 'before-pass', 1, null)
    expect(before.evidence.contextEvidence.map(entry => entry.id)).toEqual(['MATCH-SCORE-BEFORE'])
    const goal = snapshot(fixture('S3'), 'goal', 1, null)
    expect(goal.evidence.contextEvidence.map(entry => entry.id)).toEqual(['MATCH-SCORE-BEFORE', 'DECISION-ORIGINAL'])
    const ready = snapshot(fixture('S3'), 'review-ready', 1, { evidenceIds: ['F-POSITION'], ruleIds: [] })
    expect(ready.evidence.contextEvidence.filter(entry => entry.status === 'MISSING').map(entry => entry.value)).toEqual([null, null])
    render(<FeatureHarness {...inputs('S3')} {...ready} slots={probeSlots('VAR-104')} />)
    expect(screen.getByTestId(UI_HOOKS.missingEvidence)).toHaveTextContent('Missing facts: 2')
    expect(screen.getByText('Selected sources: F-POSITION')).toBeVisible()
  })

  it('VAR-106 uses only explicit stub requests and forwards source selections', async () => {
    const props = inputs('S3', 'before-pass')
    const explain = vi.spyOn(props.client, 'explain')
    const { rerender } = render(<FeatureHarness {...props} slots={probeSlots('VAR-106')} />)
    expect(screen.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Probe audience'), { target: { value: 'ANALYST' } })
    fireEvent.change(screen.getByLabelText('Probe source mode'), { target: { value: 'LIVE_AI' } })
    expect(explain).not.toHaveBeenCalled()
    rerender(<FeatureHarness {...props} {...snapshot(fixture('S3'), 'review-ready', 2, null)} slots={probeSlots('VAR-106')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exercise explanation stub' }))
    await waitFor(() => expect(screen.getByTestId(UI_HOOKS.explanationResult)).toHaveTextContent('S3 / ANALYST / LIVE_AI / LIMITED'))
    expect(explain).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Emit source inspection' }))
    expect(props.inspectSources).toHaveBeenCalledWith({ evidenceIds: ['F-PASS', 'F-BALL', 'F-POSITION'], ruleIds: ['R-OFFSIDE'] })
  })

  it('VAR-106 surfaces injected errors without a success-shaped fallback', async () => {
    const props = { ...inputs(), client: createExplanationClientStub('MODEL_NOT_CONFIGURED') }
    render(<FeatureHarness {...props} slots={probeSlots('VAR-106')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exercise explanation stub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('MODEL_NOT_CONFIGURED; retryable: false')
    expect(screen.queryByTestId(UI_HOOKS.explanationResult)).not.toBeInTheDocument()
  })

  it('VAR-107 emits only the supported selection and exposes no S3 variant', () => {
    const props = inputs()
    const { rerender } = render(<FeatureHarness {...props} slots={probeSlots('VAR-107')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Emit selection S2' }))
    expect(props.selectScenario).toHaveBeenCalledExactlyOnceWith('S2')
    rerender(<FeatureHarness {...inputs('S3')} slots={probeSlots('VAR-107')} />)
    expect(screen.getByTestId(UI_HOOKS.comparisonUnavailable)).toHaveTextContent('S3 is not a comparison variant')
    expect(screen.queryByTestId(UI_HOOKS.comparisonToggle)).not.toBeInTheDocument()
  })

  it('reserves the existing 23 stable UI hooks without duplicates', () => {
    expect(Object.values(UI_HOOKS)).toHaveLength(23)
    expect(new Set(Object.values(UI_HOOKS)).size).toBe(23)
  })

  it('VAR-106 can receive an entirely different typed client implementation', async () => {
    const base = createExplanationClientStub()
    const client: ExplanationClient = { explain: vi.fn(request => base.explain(request)) }
    render(<FeatureHarness {...inputs('S2')} client={client} slots={probeSlots('VAR-106')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exercise explanation stub' }))
    await waitFor(() => expect(screen.getByTestId(UI_HOOKS.explanationResult)).toHaveTextContent('S2 / CASUAL / AUTHORED / COMPLETE'))
    expect(client.explain).toHaveBeenCalledOnce()
  })

  it('VAR-106 assigns a fresh request ID even after remounting the probe', async () => {
    const props = inputs()
    const explain = vi.spyOn(props.client, 'explain')
    const { rerender } = render(<FeatureHarness {...props} slots={probeSlots('VAR-106')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exercise explanation stub' }))
    await screen.findByTestId(UI_HOOKS.explanationResult)
    rerender(<FeatureHarness {...props} slots={{}} />)
    rerender(<FeatureHarness {...props} slots={probeSlots('VAR-106')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exercise explanation stub' }))
    await screen.findByTestId(UI_HOOKS.explanationResult)
    expect(explain).toHaveBeenCalledTimes(2)
    expect(explain.mock.calls[0][0].requestId).not.toBe(explain.mock.calls[1][0].requestId)
  })
})
