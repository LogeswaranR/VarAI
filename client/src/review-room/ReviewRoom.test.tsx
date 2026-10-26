import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../../../tests/contract-stubs/client'
import type { ScenarioQuery } from '../contracts/graphql.generated'
import type { ComparisonInput, EvidenceExplorerInput, ExplanationReaderInput, SceneInput } from '../contracts/interfaces'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { ReviewRoom } from './ReviewRoom'
import type { ReviewRoomProps } from './ReviewRoom'
import { deferred, scenarioFixture, settle } from './test-support'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }))
afterEach(() => vi.useRealTimers())

async function mount(overrides: Partial<ReviewRoomProps> = {}) {
  const props: ReviewRoomProps = {
    repository: createScenarioRepositoryStub(), client: createExplanationClientStub(), initialScenarioId: 'S1', ...overrides,
  }
  const result = render(<ReviewRoom {...props} />)
  await act(settle)
  return { ...result, props }
}

function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds))
}

async function choose(id: string) {
  fireEvent.change(screen.getByLabelText('Choose scenario'), { target: { value: id } })
  await act(settle)
}

describe('VAR-102 shell composition and controls', () => {
  it('starts without a hidden selection when no initial ID was explicitly supplied', async () => {
    const repository = createScenarioRepositoryStub()
    const get = vi.spyOn(repository, 'get')
    await mount({ repository, initialScenarioId: null })
    expect(screen.getByRole('status')).toHaveTextContent('Choose a scenario to begin')
    expect(screen.queryByTestId(UI_HOOKS.replayPlay)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Choose scenario')).toHaveValue('')
    expect(get).not.toHaveBeenCalled()
    await choose('S2')
    expect(screen.getByRole('status')).toHaveTextContent('S2: Ready to play')
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
  })

  it('provides a real timed replay and honest child placeholders without requesting explanations', async () => {
    const client = createExplanationClientStub()
    const explain = vi.spyOn(client, 'explain')
    await mount({ client })
    expect(screen.getByRole('heading', { name: 'Review room' })).toBeVisible()
    expect(screen.getByTestId(UI_HOOKS.syntheticBadge)).toHaveTextContent('Synthetic replay')
    expect(screen.getByLabelText('Score before replay')).toHaveTextContent('0 – 0')
    expect(screen.getAllByText(/Placeholder —/)).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(screen.queryByRole('list', { name: 'Released replay events' })).not.toBeInTheDocument()
    expect(screen.getByTestId('context-DECISION-ORIGINAL')).toHaveTextContent('Not yet revealed')
    expect(screen.getByTestId('context-DECISION-REVIEW')).toHaveTextContent('Not yet revealed')
    expect(screen.getByTestId('context-MATCH-SCORE-AFTER')).toHaveTextContent('Not yet revealed')
    expect(screen.queryByText('Goal disallowed')).not.toBeInTheDocument()
    expect(screen.queryByTestId(UI_HOOKS.missingSnapshot)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByTestId('replay-stage')).toHaveTextContent('Pass played')
    advance(999)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('status')).toHaveTextContent('Paused. Pass played')
    advance(9000)
    expect(within(screen.getByRole('list', { name: 'Released replay events' })).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    advance(1)
    expect(screen.getByTestId('replay-stage')).toHaveTextContent('Receiver touch')
    advance(1999)
    expect(screen.getByTestId('context-DECISION-ORIGINAL')).toHaveTextContent('Not yet revealed')
    advance(1)
    expect(screen.getByTestId('context-DECISION-ORIGINAL')).toHaveTextContent('Goal awarded')
    expect(screen.getByTestId('context-DECISION-REVIEW')).toHaveTextContent('Not yet revealed')
    advance(1999)
    expect(screen.queryByText('Goal disallowed')).not.toBeInTheDocument()
    advance(1)
    expect(screen.getByRole('status')).toHaveTextContent('Replay complete. Review-ready')
    expect(screen.getByTestId('context-DECISION-REVIEW')).toHaveTextContent('Goal disallowed')
    expect(screen.getByTestId('context-MATCH-SCORE-AFTER')).toHaveTextContent('0 – 0')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByTestId('replay-stage')).toHaveTextContent('Before the pass')
    expect(screen.queryByText('Goal disallowed')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true')
    expect(explain).not.toHaveBeenCalled()
  })

  it.each([
    ['S1', 'Goal disallowed', '0 – 0'],
    ['S2', 'Goal confirmed', '1 – 0'],
    ['S3', 'Missing from supplied evidence', 'Missing from supplied evidence'],
  ])('selects and completes %s with supplied outcomes only', async (id, outcome, score) => {
    await mount()
    await choose(id)
    expect(screen.getByTestId('context-DECISION-REVIEW')).toHaveTextContent('Not yet revealed')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    if (id === 'S3') {
      expect(screen.getByTestId(UI_HOOKS.missingSnapshot)).toHaveTextContent('Pass-time snapshot unavailable')
      expect(screen.getByTestId(UI_HOOKS.missingEvidence)).toHaveTextContent('explicitly mark missing evidence')
    } else {
      expect(screen.queryByTestId(UI_HOOKS.missingSnapshot)).not.toBeInTheDocument()
    }
    advance(5000)
    expect(screen.getByTestId('context-DECISION-REVIEW')).toHaveTextContent(outcome)
    expect(screen.getByTestId('context-MATCH-SCORE-AFTER')).toHaveTextContent(score)
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByTestId('context-DECISION-REVIEW')).toHaveTextContent('Not yet revealed')
    expect(screen.queryByTestId(UI_HOOKS.missingEvidence)).not.toBeInTheDocument()
  })

  it('passes exactly the typed stage-safe scene/evidence inputs and gates the full comparison pair', async () => {
    const sceneInputs: SceneInput[] = []
    const evidenceInputs: EvidenceExplorerInput[] = []
    const explanationInputs: ExplanationReaderInput[] = []
    const comparisonInputs: ComparisonInput[] = []
    const repository = createScenarioRepositoryStub()
    const get = vi.spyOn(repository, 'get')
    const client = createExplanationClientStub()
    const explain = vi.spyOn(client, 'explain')
    function Scene(props: SceneInput) { sceneInputs.push(props); return <p>TEST scene slot</p> }
    function Evidence(props: EvidenceExplorerInput) { evidenceInputs.push(props); return <p>TEST evidence slot</p> }
    function Explanation(props: ExplanationReaderInput) { explanationInputs.push(props); return <p>TEST explanation slot</p> }
    function Comparison(props: ComparisonInput) {
      comparisonInputs.push(props)
      return <button type="button" onClick={() => props.selectScenario('S2')}>TEST select S2</button>
    }
    await mount({ repository, client, slots: { scene: Scene, evidence: Evidence, explanation: Explanation, comparison: Comparison } })
    expect(screen.getByText('TEST scene slot')).toBeVisible()
    expect(screen.getByText('TEST evidence slot')).toBeVisible()
    expect(screen.getByText('TEST explanation slot')).toBeVisible()
    expect(comparisonInputs).toHaveLength(0)
    expect(Object.keys(sceneInputs.at(-1) ?? {}).sort()).toEqual(['diagram', 'reviewReady', 'visibleFacts'])
    expect(sceneInputs.at(-1)?.diagram.markers).toEqual([])
    expect(sceneInputs.at(-1)?.diagram.secondLastReferenceX).toBeNull()
    expect(sceneInputs.at(-1)?.diagram.textAlternative).toContain('Not yet revealed')
    expect(evidenceInputs.at(-1)?.visibleFacts).toEqual([])
    expect(evidenceInputs.at(-1)?.contextEvidence.map(item => item.id)).toEqual(['MATCH-SCORE-BEFORE'])
    expect(explanationInputs.at(-1)).toMatchObject({
      scenarioId: 'S1', contentVersion: 'stub-0.2.0', reviewReady: false, client,
    })
    expect(get).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(sceneInputs.at(-1)?.visibleFacts).toHaveLength(6)
    expect(sceneInputs.at(-1)?.diagram.markers.length).toBeGreaterThan(0)
    advance(4999)
    expect(comparisonInputs).toHaveLength(0)
    expect(evidenceInputs.at(-1)?.contextEvidence).toHaveLength(2)
    advance(1)
    await act(settle)
    expect(comparisonInputs.at(-1)?.pair.map(item => item.id)).toEqual(['S1', 'S2'])
    expect(comparisonInputs.at(-1)?.reviewReady).toBe(true)
    expect(explanationInputs.at(-1)?.reviewReady).toBe(true)
    expect(evidenceInputs.at(-1)?.contextEvidence).toHaveLength(4)
    const oldSelect = comparisonInputs.at(-1)?.selectScenario
    fireEvent.click(screen.getByRole('button', { name: 'TEST select S2' }))
    await act(settle)
    expect(screen.getByLabelText('Choose scenario')).toHaveValue('S2')
    expect(screen.getByTestId('replay-stage')).toHaveTextContent('Before the pass')
    act(() => oldSelect?.('S1'))
    await act(settle)
    expect(screen.getByLabelText('Choose scenario')).toHaveValue('S2')
    expect(explain).not.toHaveBeenCalled()
  })

  it('routes source inspection to the evidence panel and remounts reader/recap on restart and scenario change', async () => {
    const readerInputs: ExplanationReaderInput[] = []
    const evidenceInputs: EvidenceExplorerInput[] = []
    function Reader(props: ExplanationReaderInput) {
      const [shown, setShown] = useState(false)
      readerInputs.push(props)
      return <div>
        <p>TEST-ONLY child state probe, not an explanation implementation.</p>
        <button type="button" disabled={!props.reviewReady} onClick={() => setShown(true)}>Set test reader state</button>
        {shown && <>
          <p>TEST reader response</p><p>TEST recap</p>
          <button type="button" onClick={() => props.inspectSources({
            evidenceIds: ['DECISION-REVIEW'], ruleIds: ['R-OFFSIDE'],
          })}>Inspect test sources</button>
        </>}
      </div>
    }
    function Evidence(props: EvidenceExplorerInput) {
      evidenceInputs.push(props)
      return <p>TEST selection: {props.selection?.evidenceIds.join(', ') ?? 'none'}</p>
    }
    const client = createExplanationClientStub()
    const explain = vi.spyOn(client, 'explain')
    await mount({ client, slots: { evidence: Evidence, explanation: Reader } })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    advance(5000)
    fireEvent.click(screen.getByRole('button', { name: 'Set test reader state' }))
    expect(screen.getByText('TEST recap')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect test sources' }))
    expect(screen.getByTestId('review-room-evidence-slot')).toHaveFocus()
    expect(evidenceInputs.at(-1)?.selection).toEqual({ evidenceIds: ['DECISION-REVIEW'], ruleIds: ['R-OFFSIDE'] })
    const old = readerInputs.at(-1)!
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(readerInputs.at(-1)?.replayRunId).toBeGreaterThan(old.replayRunId)
    expect(screen.queryByText('TEST reader response')).not.toBeInTheDocument()
    expect(screen.queryByText('TEST recap')).not.toBeInTheDocument()
    expect(evidenceInputs.at(-1)?.selection).toBeNull()
    act(() => old.inspectSources({ evidenceIds: ['MATCH-SCORE-BEFORE'], ruleIds: [] }))
    expect(evidenceInputs.at(-1)?.selection).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    advance(5000)
    fireEvent.click(screen.getByRole('button', { name: 'Set test reader state' }))
    await choose('S3')
    expect(screen.queryByText('TEST recap')).not.toBeInTheDocument()
    expect(evidenceInputs.at(-1)?.selection).toBeNull()
    expect(readerInputs.at(-1)).toMatchObject({ scenarioId: 'S3', reviewReady: false, client })
    expect(explain).not.toHaveBeenCalled()
  })

  it('shows recoverable source errors without forwarding unreleased or unknown IDs', async () => {
    const selections: EvidenceExplorerInput[] = []
    function Evidence(props: EvidenceExplorerInput) { selections.push(props); return <p>TEST evidence</p> }
    function Reader(props: ExplanationReaderInput) {
      return <button type="button" onClick={() => props.inspectSources({
        evidenceIds: ['DECISION-REVIEW'], ruleIds: [],
      })}>TEST future source</button>
    }
    await mount({ slots: { evidence: Evidence, explanation: Reader } })
    fireEvent.click(screen.getByRole('button', { name: 'TEST future source' }))
    expect(screen.getByRole('alert')).toHaveTextContent('currently released evidence')
    expect(selections.at(-1)?.selection).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps S3 comparison unavailable without mounting or fetching a pair', async () => {
    const repository = createScenarioRepositoryStub()
    const get = vi.spyOn(repository, 'get')
    const comparison = vi.fn(() => <p>Unexpected comparison</p>)
    await mount({ repository, initialScenarioId: 'S3', slots: { comparison } })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    advance(5000)
    await act(settle)
    expect(screen.getByTestId(UI_HOOKS.comparisonUnavailable)).toHaveTextContent('No comparison is supplied')
    expect(comparison).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('VAR-102 loading, recovery and component freshness', () => {
  it('shows loading and retryable errors, preserving fresh request IDs on explicit retry', async () => {
    const base = createScenarioRepositoryStub()
    const pending = deferred<ScenarioQuery['scenario']>()
    const get = vi.fn(base.get).mockReturnValueOnce(pending.promise)
    await mount({ repository: { ...base, get } })
    expect(screen.getByRole('status')).toHaveTextContent('Loading S1')
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
    await act(async () => { pending.reject(new Error('Private internal diagnostic')); await settle() })
    expect(screen.getByRole('alert')).toHaveTextContent('LOAD_FAILED')
    expect(screen.queryByText(/Private internal/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry scenario' }))
    await act(settle)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(get.mock.calls[0][1]).not.toBe(get.mock.calls[1][1])
  })

  it('recovers a failed list without using invented scenario choices', async () => {
    const base = createScenarioRepositoryStub()
    const list = vi.fn(base.list).mockRejectedValueOnce(new Error('Unavailable'))
    await mount({ repository: { ...base, list } })
    expect(screen.getByRole('alert')).toHaveTextContent('LOAD_FAILED')
    expect(screen.getByLabelText('Choose scenario')).toBeDisabled()
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reload scenario choices' }))
    await act(settle)
    expect(screen.getByLabelText('Choose scenario')).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('S1: Ready to play')
  })

  it('shows an invalid initial ID explicitly and recovers only through a valid selection', async () => {
    const base = createScenarioRepositoryStub()
    const get = vi.spyOn(base, 'get')
    await mount({ repository: base, initialScenarioId: 'S99' })
    expect(screen.getByRole('alert')).toHaveTextContent('INVALID_REQUEST')
    expect(screen.queryByRole('button', { name: 'Retry scenario' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Choose scenario')).toHaveValue('')
    expect(get).not.toHaveBeenCalled()
    await choose('S2')
    expect(screen.getByRole('status')).toHaveTextContent('S2: Ready to play')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hides old content while switching and ignores an out-of-order response', async () => {
    const base = createScenarioRepositoryStub()
    const old = deferred<ScenarioQuery['scenario']>()
    const get = vi.fn(base.get).mockImplementation((id, requestId, signal) =>
      id === 'S2' ? old.promise : base.get(id, requestId, signal))
    await mount({ repository: { ...base, get } })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    advance(5000)
    expect(screen.getByText('Goal disallowed')).toBeVisible()
    await choose('S2')
    expect(screen.getByRole('status')).toHaveTextContent('Loading S2')
    expect(screen.queryByText('Goal disallowed')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Score before replay')).not.toBeInTheDocument()
    await choose('S3')
    await act(async () => { old.resolve(scenarioFixture('S2')); await settle() })
    expect(screen.getByRole('status')).toHaveTextContent('S3: Ready to play')
    expect(screen.getByLabelText('Choose scenario')).toHaveValue('S3')
    expect(get.mock.calls.find(call => call[0] === 'S2')?.[2]?.aborted).toBe(true)
  })

  it('surfaces malformed and mismatched responses as errors instead of rendering them', async () => {
    const base = createScenarioRepositoryStub()
    await mount({ repository: { ...base, get: async () => scenarioFixture('S2') } })
    expect(screen.getByRole('alert')).toHaveTextContent('INVALID_OUTPUT')
    expect(screen.queryByLabelText('Score before replay')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry scenario' })).toBeEnabled()
  })

  it('handles comparison failure separately, with a successful explicit retry', async () => {
    const base = createScenarioRepositoryStub()
    const get = vi.fn(base.get).mockImplementationOnce(base.get).mockRejectedValueOnce(new Error('Pair failed'))
    function Comparison(props: ComparisonInput) { return <p>TEST checked pair: {props.pair.map(item => item.id).join(', ')}</p> }
    await mount({ repository: { ...base, get }, slots: { comparison: Comparison } })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    advance(5000)
    await act(settle)
    expect(screen.getByRole('alert')).toHaveTextContent('LOAD_FAILED')
    expect(screen.getByTestId('context-DECISION-REVIEW')).toHaveTextContent('Goal disallowed')
    fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }))
    await act(settle)
    expect(screen.getByText('TEST checked pair: S1, S2')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('replaces repository context cleanly and tolerates StrictMode setup/cleanup without duplicate timers', async () => {
    const repository = createScenarioRepositoryStub()
    const client = createExplanationClientStub()
    const result = render(<StrictMode><ReviewRoom repository={repository} client={client} initialScenarioId="S1" /></StrictMode>)
    await act(settle)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(vi.getTimerCount()).toBe(1)
    const next = createScenarioRepositoryStub()
    result.rerender(<StrictMode><ReviewRoom repository={next} client={client} initialScenarioId="S2" /></StrictMode>)
    await act(settle)
    expect(screen.getByRole('status')).toHaveTextContent('S2: Ready to play')
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    result.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
