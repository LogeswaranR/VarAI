import { useMemo, useState } from 'react'
import { appPanels } from '../../src/app-panels'
import { fixture, snapshot } from '../../src/harness/fixtures'
import type { ErrorCode, ScenarioId } from '../../src/contracts/graphql.generated'
import type { SourceSelection } from '../../src/contracts/interfaces'
import { createExplanationClientStub } from '../../../tests/contract-stubs/client'
import '../../src/index.css'
import '../../src/review-room/review-room.css'

export function ComponentFixtures() {
  const query = new URLSearchParams(location.search)
  const panel = query.get('panel')
  const [id, setId] = useState<ScenarioId>(() => (query.get('scenario') ?? 'S1') as ScenarioId)
  const [selection, setSelection] = useState<SourceSelection | null>(() => query.has('reference')
    ? { evidenceIds: [query.get('reference')!], ruleIds: [] } : null)
  const ready = query.get('stage') !== 'before-pass'
  const scenario = fixture(id)
  const state = snapshot(scenario, ready ? 'review-ready' : 'before-pass', 1, selection)
  const error = query.get('error') as ErrorCode | null
  const client = useMemo(() => createExplanationClientStub(error ?? undefined), [error])
  const { scene: Scene, evidence: Evidence, explanation: Explanation, comparison: Comparison } = appPanels
  return <main className="review-room">
    <h1>Test-only real component fixtures</h1>
    <p>Explicitly staged synthetic fixtures; not the production app, replay or a live provider.</p>
    {panel === 'scene' && <Scene {...state.scene} />}
    {panel === 'evidence' && <Evidence {...state.evidence} />}
    {panel === 'explanation' && <Explanation scenarioId={id} contentVersion={scenario.contentVersion}
      replayRunId={1} reviewReady={ready} client={client} inspectSources={setSelection} />}
    {panel === 'comparison' && <Comparison scenarioId={id} reviewReady={ready}
      pair={[fixture('S1'), fixture('S2')]} selectScenario={setId} />}
    <output aria-label="Component callback">{id} · {[...(selection?.evidenceIds ?? []), ...(selection?.ruleIds ?? [])].join(', ')}</output>
  </main>
}
