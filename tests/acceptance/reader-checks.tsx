import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../contract-stubs/client'
import type { ExplainMutation, ScenarioFieldsFragment } from '../../client/src/contracts/graphql.generated'
import type { ExplanationClient } from '../../client/src/contracts/interfaces'
import { UI_HOOKS } from '../../client/src/contracts/ui-hooks'
import { FeatureHarness } from '../../client/src/harness/FeatureHarness'
import type { FeatureHarnessInput, HarnessSlots } from '../../client/src/harness/FeatureHarness'
import { fixture, snapshot } from '../../client/src/harness/fixtures'

function inputs(scenario: ScenarioFieldsFragment, client: ExplanationClient, run: number, ready = true): FeatureHarnessInput {
  return {
    ...snapshot(scenario, ready ? 'review-ready' : 'before-pass', run, null),
    repository: createScenarioRepositoryStub(), client, slots: {}, pair: [fixture('S1'), fixture('S2')],
    inspectSources: vi.fn(), selectScenario: vi.fn(),
  }
}

export function registerReaderChecks(label: string, slots: Partial<HarnessSlots>) {
  describe(label, () => {
    it('clears a completed response on a same-scenario replay-run reset and uses a new request ID', async () => {
      const client = createExplanationClientStub()
      const explain = vi.spyOn(client, 'explain')
      const scenario = fixture('S1')
      const { rerender } = render(<FeatureHarness {...inputs(scenario, client, 1)} slots={slots} />)
      fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
      await screen.findByTestId(UI_HOOKS.explanationResult)
      const first = explain.mock.calls[0][0].requestId
      rerender(<FeatureHarness {...inputs(scenario, client, 2, false)} slots={slots} />)
      expect(screen.queryByTestId(UI_HOOKS.explanationResult)).not.toBeInTheDocument()
      expect(screen.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
      rerender(<FeatureHarness {...inputs(scenario, client, 2)} slots={slots} />)
      expect(screen.queryByTestId(UI_HOOKS.explanationResult)).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
      await screen.findByTestId(UI_HOOKS.explanationResult)
      expect(explain).toHaveBeenCalledTimes(2)
      expect(explain.mock.calls[1][0].requestId).not.toBe(first)
    })

    it.each(['replay run', 'scenario', 'content version', 'audience', 'mode'] as const)(
      'does not render a deferred old response after changing %s', async change => {
        const stub = createExplanationClientStub()
        let release: (value: ExplainMutation['explain']) => void = () => { throw new Error('No pending request.') }
        const pending = new Promise<ExplainMutation['explain']>(resolve => { release = resolve })
        const request = vi.fn<ExplanationClient['explain']>(() => pending)
        const client = { explain: request }
        const scenario = fixture('S1')
        const { rerender } = render(<FeatureHarness {...inputs(scenario, client, 1)} slots={slots} />)
        fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
        expect(screen.getByTestId(UI_HOOKS.explanationLoading)).toBeVisible()
        expect(request).toHaveBeenCalledOnce()
        if (change === 'audience' || change === 'mode') {
          fireEvent.change(screen.getByTestId(change === 'audience' ? UI_HOOKS.audienceSelect : UI_HOOKS.sourceModeSelect), {
            target: { value: change === 'audience' ? 'ANALYST' : 'LIVE_AI' },
          })
        } else {
          const next = change === 'scenario' ? fixture('S2') : change === 'content version'
            ? { ...scenario, contentVersion: 'explicit-next-fixture-version' } : scenario
          rerender(<FeatureHarness {...inputs(next, client, change === 'replay run' ? 2 : 1)} slots={slots} />)
        }
        expect(request).toHaveBeenCalledOnce()
        const response = await stub.explain(request.mock.calls[0][0])
        await act(async () => { release(response); await pending })
        expect(screen.queryByTestId(UI_HOOKS.explanationResult)).not.toBeInTheDocument()
        expect(screen.queryByTestId(UI_HOOKS.explanationError)).not.toBeInTheDocument()
        expect(screen.queryByTestId(UI_HOOKS.explanationLoading)).not.toBeInTheDocument()
      },
    )
  })
}
