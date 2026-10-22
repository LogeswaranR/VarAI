import { useMemo, useState } from 'react'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../../../tests/contract-stubs/client'
import { errorCases } from '../../../tests/contract-stubs/responses.generated'
import type { ErrorCode, ScenarioId } from '../contracts/graphql.generated'
import type { SourceSelection } from '../contracts/interfaces'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { FeatureHarness } from './FeatureHarness'
import { fixture, frontendPackages, probeSlots, snapshot, stages } from './fixtures'
import type { FrontendPackage, HarnessStage } from './fixtures'

export function HarnessPage() {
  const [state, setState] = useState<{
    id: ScenarioId; stage: HarnessStage; run: number; probe: FrontendPackage | 'none'; error: ErrorCode | undefined;
  }>({ id: 'S1', stage: 'before-pass', run: 1, probe: 'none', error: undefined })
  const [selection, setSelection] = useState<SourceSelection | null>(null)
  const [emitted, setEmitted] = useState<string>('none')
  const repository = useMemo(() => createScenarioRepositoryStub(), [])
  const client = useMemo(() => createExplanationClientStub(state.error), [state.error])
  const scenario = useMemo(() => fixture(state.id), [state.id])
  const pair = useMemo(() => [fixture('S1'), fixture('S2')] as const, [])
  function chooseScenario(id: ScenarioId) {
    setState(previous => ({ ...previous, id, stage: 'before-pass', run: previous.run + 1 }))
    setSelection(null)
  }
  return (
    <main className="harness">
      <header>
        <p className="harness-warning" data-testid={UI_HOOKS.syntheticBadge}>TEST HARNESS - SYNTHETIC STUBS ONLY</p>
        <h1>VarAI isolated feature harness</h1>
        <p>No football feature implementations are loaded. These controls select test inputs, not a real replay.</p>
      </header>
      <fieldset className="harness-controls">
        <legend>Controlled fixture inputs</legend>
        <label>Fixture scenario
          <select data-testid={UI_HOOKS.scenarioSelect} value={state.id} onChange={event => {
            const id = event.target.value
            if (id !== 'S1' && id !== 'S2' && id !== 'S3') throw new Error('Unknown fixture scenario.')
            chooseScenario(id)
          }}>
            <option value="S1">S1 - complete evidence</option><option value="S2">S2 - changed fact</option><option value="S3">S3 - missing evidence</option>
          </select>
        </label>
        <label>Fixture stage
          <select value={state.stage} onChange={event => {
            const stage = stages.find(item => item === event.target.value)
            if (!stage) throw new Error('Unknown fixture stage.')
            setState(previous => ({ ...previous, stage, run: previous.run + 1 }))
            setSelection(null)
          }}>
            {stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </label>
        <label>Mounted test probe
          <select value={state.probe} onChange={event => {
            const selected = event.target.value === 'none' ? 'none' : frontendPackages.find(item => item === event.target.value)
            if (!selected) throw new Error('Unknown test probe.')
            setState(previous => ({ ...previous, probe: selected }))
          }}>
            <option value="none">None - placeholders only</option>
            {frontendPackages.map(id => <option key={id} value={id}>{id} only</option>)}
          </select>
        </label>
        <label>Injected explanation failure
          <select value={state.error ?? 'none'} onChange={event => {
            const error = errorCases.find(item => item.response.data.explain.code === event.target.value)?.response.data.explain.code
            if (!error && event.target.value !== 'none') throw new Error('Unknown injected failure.')
            setState(previous => ({ ...previous, error, run: previous.run + 1 }))
          }}>
            <option value="none">None</option>
            {errorCases.map(item => <option key={item.response.data.explain.code}>{item.response.data.explain.code}</option>)}
          </select>
        </label>
      </fieldset>
      <p data-testid={UI_HOOKS.reviewReady} role="status">Fixture context: {state.id} / {state.stage} / run {state.run}</p>
      <p>Source event: <output aria-label="Source event">{selection?.evidenceIds.join(', ') ?? 'none'}</output></p>
      <p>Scenario event: <output aria-label="Scenario event">{emitted}</output></p>
      <FeatureHarness {...snapshot(scenario, state.stage, state.run, selection)} repository={repository} client={client}
        slots={probeSlots(state.probe)} pair={pair} inspectSources={setSelection} selectScenario={id => {
          setEmitted(id)
          chooseScenario(id)
        }} />
      <footer><p>VAR-101 and VAR-105 use the backend stub checks. VAR-108 can target this page for isolated browser checks.
        Passing these probes is not feature acceptance, source review or G00 sign-off.</p></footer>
    </main>
  )
}
