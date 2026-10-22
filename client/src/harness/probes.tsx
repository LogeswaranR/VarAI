import { useState } from 'react'
import type { Audience, ExplainMutation, SourceMode } from '../contracts/graphql.generated'
import type { ComparisonInput, EvidenceExplorerInput, ExplanationReaderInput, SceneInput } from '../contracts/interfaces'
import { rules } from '../contracts/rules.generated'
import { UI_HOOKS } from '../contracts/ui-hooks'
import type { ReviewRoomHarnessInput } from './FeatureHarness'

export function ReviewRoomProbe({ repository, context, children }: ReviewRoomHarnessInput) {
  const [count, setCount] = useState<number | null>(null)
  return (
    <div data-testid="probe-VAR-102">
      <p>Repository probe only, not replay controls. Fixture: {context.scenario.id}.</p>
      <button type="button" onClick={async () => setCount((await repository.list()).length)}>Exercise repository stub</button>
      <output aria-live="polite">{count === null ? 'Repository not requested' : `${count} synthetic summaries received`}</output>
      {children}
    </div>
  )
}

export function SceneProbe({ diagram, visibleFacts }: SceneInput) {
  return (
    <div data-testid="probe-VAR-103">
      <div data-testid={UI_HOOKS.scenePanel}>
        <p>Scene input probe only, not a pitch rendering.</p>
        <p>Diagram status: {diagram.status}; markers: {diagram.markers.length}; visible facts: {visibleFacts.length}.</p>
        {diagram.status === 'UNAVAILABLE' && <p data-testid={UI_HOOKS.missingSnapshot}>{diagram.textAlternative}</p>}
      </div>
    </div>
  )
}

export function EvidenceProbe({ visibleFacts, contextEvidence, selection }: EvidenceExplorerInput) {
  return (
    <div data-testid="probe-VAR-104">
      <div data-testid={UI_HOOKS.evidencePanel}>
        <p>Evidence input probe only, not source navigation.</p>
        <p data-testid={UI_HOOKS.missingEvidence}>Missing facts: {visibleFacts.filter(fact => fact.status === 'MISSING').length}</p>
        <p>Context IDs: {contextEvidence.map(entry => entry.id).join(', ')}</p>
        <p>Missing context values: {contextEvidence.filter(entry => entry.value === null).length}</p>
        <p>Selected sources: {selection?.evidenceIds.join(', ') ?? 'none'}</p>
      </div>
    </div>
  )
}

export function ExplanationProbe(props: ExplanationReaderInput) {
  const [audience, setAudience] = useState<Audience>('CASUAL')
  const [mode, setMode] = useState<SourceMode>('AUTHORED')
  const [response, setResponse] = useState<{ context: string; value: ExplainMutation['explain'] } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const context = `${props.scenarioId}/${props.contentVersion}/${props.replayRunId}/${audience}/${mode}`
  const current = response?.context === context ? response.value : null
  async function request() {
    setPending(context)
    try {
      const value = await props.client.explain({
        schemaVersion: rules.schemaVersion,
        requestId: crypto.randomUUID(),
        scenarioId: props.scenarioId, contentVersion: props.contentVersion, audience, sourceMode: mode,
      })
      setResponse({ context, value })
    } finally {
      setPending(null)
    }
  }
  return (
    <div data-testid="probe-VAR-106">
      <p>Client contract probe only. No explanation reader or recap feature is implemented.</p>
      <label>Probe audience
        <select data-testid={UI_HOOKS.audienceSelect} value={audience} onChange={event => {
          const value = event.target.value
          if (value !== 'CASUAL' && value !== 'ANALYST') throw new Error('Unknown probe audience.')
          setAudience(value)
        }}>
          <option value="CASUAL">Casual</option><option value="ANALYST">Analyst</option>
        </select>
      </label>
      <label>Probe source mode
        <select data-testid={UI_HOOKS.sourceModeSelect} value={mode} onChange={event => {
          const value = event.target.value
          if (value !== 'AUTHORED' && value !== 'LIVE_AI') throw new Error('Unknown probe mode.')
          setMode(value)
        }}>
          <option value="AUTHORED">Authored stub</option><option value="LIVE_AI">Simulated live stub - no model call</option>
        </select>
      </label>
      <p data-testid={UI_HOOKS.sourceModeBadge}>TEST STUB MODE: {mode}. No model is called.</p>
      <button type="button" data-testid={UI_HOOKS.explainButton} disabled={!props.reviewReady || pending !== null}
        onClick={() => void request()}>Exercise explanation stub</button>
      {pending === context && <p role="status" data-testid={UI_HOOKS.explanationLoading}>Waiting for the injected stub.</p>}
      {current?.__typename === 'ContractError' && <p role="alert" data-testid={UI_HOOKS.explanationError}>
        STUB ERROR: {current.code}; retryable: {String(current.retryable)}
      </p>}
      {current?.__typename === 'ExplanationSuccess' && <div>
        <p role="status" data-testid={UI_HOOKS.explanationResult}>
          STUB RESPONSE: {current.scenarioId} / {current.audience} / {current.sourceMode} / {current.status}
        </p>
        <button type="button" data-testid={UI_HOOKS.claimSourceLink}
          onClick={() => props.inspectSources({ evidenceIds: current.headline.evidenceIds, ruleIds: current.headline.ruleIds })}>
          Emit source inspection
        </button>
      </div>}
    </div>
  )
}

export function ComparisonProbe({ scenarioId, pair, reviewReady, selectScenario }: ComparisonInput) {
  const other = pair.find(item => item.id !== scenarioId)?.id
  return (
    <div data-testid="probe-VAR-107">
      <div data-testid={UI_HOOKS.comparisonPanel}>
        <p>Selection callback probe only, not a comparison feature.</p>
        {scenarioId === 'S3'
          ? <p data-testid={UI_HOOKS.comparisonUnavailable}>S3 is not a comparison variant.</p>
          : <button type="button" data-testid={UI_HOOKS.comparisonToggle} disabled={!reviewReady} onClick={() => {
            if (other !== 'S1' && other !== 'S2') throw new Error('Invalid comparison fixture pair.')
            selectScenario(other)
          }}>Emit selection {other}</button>}
      </div>
    </div>
  )
}
