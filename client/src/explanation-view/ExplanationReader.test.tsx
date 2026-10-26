import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createExplanationClientStub } from '../../../tests/contract-stubs/client'
import type { ErrorCode, ExplainMutation } from '../contracts/graphql.generated'
import type { ExplanationReaderInput } from '../contracts/interfaces'
import { fixture } from '../harness/fixtures'
import { rules } from '../contracts/rules.generated'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { ExplanationReader } from './ExplanationReader'

function input(id: 'S1' | 'S2' | 'S3' = 'S1', code?: ErrorCode): ExplanationReaderInput {
  return { scenarioId: id, contentVersion: fixture(id).contentVersion, replayRunId: 1, reviewReady: true,
    client: createExplanationClientStub(code), inspectSources: vi.fn() }
}

describe('VAR-106 explanation reader', () => {
  it.each(['S1', 'S2', 'S3'] as const)('renders both authored audiences for %s and emits supplied citations', async id => {
    const props = input(id)
    const spy = vi.spyOn(props.client, 'explain')
    render(<ExplanationReader {...props} />)
    expect(spy).not.toHaveBeenCalled()
    for (const audience of ['CASUAL', 'ANALYST']) {
      fireEvent.change(screen.getByTestId(UI_HOOKS.audienceSelect), { target: { value: audience } })
      fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
      expect(await screen.findByTestId(UI_HOOKS.explanationResult)).toHaveAttribute('data-status', id === 'S3' ? 'LIMITED' : 'COMPLETE')
      expect(screen.getByTestId(UI_HOOKS.recapPanel)).toBeVisible()
      expect(screen.getByTestId(UI_HOOKS.sourceModeBadge)).toHaveTextContent('Authored')
      fireEvent.click(screen.getAllByTestId(UI_HOOKS.claimSourceLink)[0])
      const body = fixture(id).authoredExplanations[audience === 'CASUAL' ? 'casual' : 'analyst']
      expect(props.inspectSources).toHaveBeenLastCalledWith({ evidenceIds: body.headline.evidenceIds, ruleIds: body.headline.ruleIds })
    }
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0][0].requestId).not.toBe(spy.mock.calls[1][0].requestId)
    if (id === 'S3') expect(screen.getByTestId(UI_HOOKS.recapPanel)).toHaveTextContent('No final score is inferred.')
  })

  it('never automatically generates on readiness or selecting live mode', async () => {
    const props = input()
    const spy = vi.spyOn(props.client, 'explain')
    const { rerender } = render(<ExplanationReader {...props} reviewReady={false} />)
    expect(screen.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
    fireEvent.change(screen.getByTestId(UI_HOOKS.sourceModeSelect), { target: { value: 'LIVE_AI' } })
    rerender(<ExplanationReader {...props} />)
    expect(screen.getByTestId(UI_HOOKS.sourceModeSelect)).toHaveValue('LIVE_AI')
    expect(spy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
    await screen.findByTestId(UI_HOOKS.explanationResult)
    expect(screen.getByTestId(UI_HOOKS.sourceModeBadge)).toHaveTextContent('Live AI')
    expect(screen.getByText(/SIMULATED LIVE-AI TEST STUB/)).toBeVisible()
    expect(spy).toHaveBeenCalledOnce()
  })

  it.each(Object.keys(rules.retryable) as ErrorCode[])('keeps %s explicit, obeys retry policy and never falls back', async code => {
    const props = input('S1', code)
    const spy = vi.spyOn(props.client, 'explain')
    render(<ExplanationReader {...props} />)
    fireEvent.change(screen.getByTestId(UI_HOOKS.sourceModeSelect), { target: { value: 'LIVE_AI' } })
    fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
    expect(await screen.findByTestId(UI_HOOKS.explanationError)).toHaveTextContent(code)
    expect(screen.queryByTestId(UI_HOOKS.recapPanel)).not.toBeInTheDocument()
    expect(screen.queryByTestId(UI_HOOKS.explanationResult)).not.toBeInTheDocument()
    expect(screen.getByTestId(UI_HOOKS.sourceModeSelect)).toHaveValue('LIVE_AI')
    expect(spy).toHaveBeenCalledOnce()
    const button = screen.getByTestId(UI_HOOKS.explainButton)
    if (rules.retryable[code]) {
      expect(button).toHaveTextContent('Retry')
      fireEvent.click(button)
      await screen.findByTestId(UI_HOOKS.explanationError)
      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy.mock.calls[0][0].requestId).not.toBe(spy.mock.calls[1][0].requestId)
    } else expect(button).toBeDisabled()
  })

  it.each(['audience', 'mode', 'scenario', 'version', 'run', 'readiness'] as const)(
    'aborts and ignores old failures when %s changes, including a selection round-trip', async change => {
      const props = input()
      let reject!: (reason: Error) => void
      const pending = new Promise<ExplainMutation['explain']>((_, rejectPromise) => { reject = rejectPromise })
      const spy = vi.spyOn(props.client, 'explain').mockReturnValue(pending)
      const { rerender } = render(<ExplanationReader {...props} />)
      fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
      expect(screen.getByTestId(UI_HOOKS.explanationLoading)).toBeVisible()
      if (change === 'audience' || change === 'mode') {
        const select = screen.getByTestId(change === 'audience' ? UI_HOOKS.audienceSelect : UI_HOOKS.sourceModeSelect)
        fireEvent.change(select, { target: { value: change === 'audience' ? 'ANALYST' : 'LIVE_AI' } })
        fireEvent.change(select, { target: { value: change === 'audience' ? 'CASUAL' : 'AUTHORED' } })
      } else {
        rerender(<ExplanationReader {...props} scenarioId={change === 'scenario' ? 'S2' : 'S1'}
          contentVersion={change === 'version' ? 'next-content' : props.contentVersion}
          replayRunId={change === 'run' ? 2 : 1} reviewReady={change !== 'readiness'} />)
      }
      expect(spy.mock.calls[0][1]?.aborted).toBe(true)
      await act(async () => { reject(new Error('Old failure with private diagnostic text')); await pending.catch(() => {}) })
      expect(screen.queryByTestId(UI_HOOKS.explanationError)).not.toBeInTheDocument()
      expect(screen.queryByTestId(UI_HOOKS.explanationLoading)).not.toBeInTheDocument()
      expect(screen.queryByTestId(UI_HOOKS.recapPanel)).not.toBeInTheDocument()
    },
  )

  it('rejects mismatched metadata and renders provider prose as text rather than markup', async () => {
    const props = input()
    const stub = props.client.explain
    const spy = vi.spyOn(props.client, 'explain').mockImplementation(async (request, signal) => {
      const result = await stub(request, signal)
      return { ...result, requestId: 'older-request' }
    })
    render(<ExplanationReader {...props} />)
    fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
    expect(await screen.findByTestId(UI_HOOKS.explanationError)).toHaveTextContent('INVALID_OUTPUT')
    spy.mockImplementation(async (request, signal) => {
      const result = await stub(request, signal)
      return result.__typename === 'ExplanationSuccess'
        ? { ...result, headline: { ...result.headline, text: '<img src=x onerror=alert(1)>' } } : result
    })
    fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
    await screen.findByTestId(UI_HOOKS.explanationResult)
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(document.querySelector('img')).toBeNull()
  })

  it('clears a previous recap immediately on a new attempt and safely reports transport failure', async () => {
    const props = input()
    const spy = vi.spyOn(props.client, 'explain')
    render(<ExplanationReader {...props} />)
    fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
    await screen.findByTestId(UI_HOOKS.recapPanel)
    spy.mockRejectedValue(new Error('sensitive raw transport details'))
    fireEvent.click(screen.getByTestId(UI_HOOKS.explainButton))
    expect(screen.queryByTestId(UI_HOOKS.recapPanel)).not.toBeInTheDocument()
    expect(await screen.findByTestId(UI_HOOKS.explanationError)).toHaveTextContent('REQUEST_FAILED')
    expect(screen.queryByText(/sensitive raw/)).not.toBeInTheDocument()
  })
})
