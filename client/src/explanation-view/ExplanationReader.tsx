import { useEffect, useRef, useState } from 'react'
import type {
  Audience, ClaimFieldsFragment, ErrorFieldsFragment, ExplainMutation, ExplainMutationVariables, SourceMode,
} from '../contracts/graphql.generated'
import type { ExplanationReaderInput, SourceSelection } from '../contracts/interfaces'
import { isExplainMutation } from '../contracts/response-shapes.generated'
import { assertError, ContractResponseError } from '../contracts/validation'
import { rules } from '../contracts/rules.generated'
import { UI_HOOKS } from '../contracts/ui-hooks'
import './explanation-view.css'

type Success = Extract<ExplainMutation['explain'], { __typename: 'ExplanationSuccess' }>
type ReaderError = Pick<ErrorFieldsFragment, 'code' | 'message' | 'retryable'> | {
  code: 'REQUEST_FAILED'
  message: string
  retryable: true
}
type State = { status: 'idle' } | { status: 'loading' } |
  { status: 'error'; error: ReaderError } | { status: 'result'; result: Success }

function checkedResponse(value: unknown, request: ExplainMutationVariables['input']): ExplainMutation['explain'] {
  const envelope = { explain: value }
  if (!isExplainMutation(envelope)) throw new ContractResponseError('Incomplete explanation response.')
  const response = envelope.explain
  if (response.__typename === 'ContractError') {
    assertError(response, request.requestId)
    return response
  }
  const interpretation = request.scenarioId === 'S1' ? 'OFFSIDE_SUPPORTED'
    : request.scenarioId === 'S2' ? 'NO_OFFSIDE_SUPPORTED' : 'INSUFFICIENT_EVIDENCE'
  if (response.schemaVersion !== request.schemaVersion || response.requestId !== request.requestId ||
    response.scenarioId !== request.scenarioId || response.contentVersion !== request.contentVersion ||
    response.audience !== request.audience || response.sourceMode !== request.sourceMode ||
    response.status !== (request.scenarioId === 'S3' ? 'LIMITED' : 'COMPLETE') ||
    response.interpretation !== interpretation) {
    throw new ContractResponseError('Explanation context does not match the current request.')
  }
  return response
}

function ClaimSources({ claim, inspectSources }: {
  claim: ClaimFieldsFragment
  inspectSources: (selection: SourceSelection) => void
}) {
  return <button className="claim-sources" type="button" data-testid={UI_HOOKS.claimSourceLink}
    onClick={() => inspectSources({ evidenceIds: [...claim.evidenceIds], ruleIds: [...claim.ruleIds] })}>
    Inspect sources: {[...claim.evidenceIds, ...claim.ruleIds].join(', ')}
  </button>
}

function RequestPanel({ audience, sourceMode, ...input }: ExplanationReaderInput & {
  audience: Audience
  sourceMode: SourceMode
}) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => { active.current?.abort(); active.current = null }, [input.client])

  async function generate() {
    if (!input.reviewReady || active.current ||
      (state.status === 'error' && !state.error.retryable)) return
    const attempt = new AbortController()
    active.current = attempt
    const request: ExplainMutationVariables['input'] = {
      schemaVersion: rules.schemaVersion, requestId: crypto.randomUUID(),
      scenarioId: input.scenarioId, contentVersion: input.contentVersion, audience, sourceMode,
    }
    setState({ status: 'loading' })
    try {
      const response = checkedResponse(await input.client.explain(request, attempt.signal), request)
      if (active.current !== attempt || attempt.signal.aborted) return
      setState(response.__typename === 'ContractError'
        ? { status: 'error', error: response } : { status: 'result', result: response })
    } catch (error) {
      if (active.current !== attempt || attempt.signal.aborted) return
      setState({ status: 'error', error: error instanceof ContractResponseError
        ? { code: 'INVALID_OUTPUT', message: 'The response could not be validated for this review. No explanation is shown.', retryable: true }
        : { code: 'REQUEST_FAILED', message: 'The explanation request could not be completed. Check the local server and retry explicitly.', retryable: true } })
    } finally {
      if (active.current === attempt) active.current = null
    }
  }

  return <>
    <button type="button" className="rr-primary" data-testid={UI_HOOKS.explainButton}
      disabled={!input.reviewReady || state.status === 'loading' || (state.status === 'error' && !state.error.retryable)}
      onClick={() => { void generate() }}>
      {state.status === 'error' && state.error.retryable ? 'Retry explanation' : 'Generate explanation'}
    </button>
    {!input.reviewReady && <p>Complete the replay to make the evidence pack review-ready.</p>}
    {state.status === 'idle' && input.reviewReady && <p>No explanation requested. Choose an audience and source, then generate explicitly.</p>}
    {state.status === 'loading' && <p role="status" data-testid={UI_HOOKS.explanationLoading}>
      Loading {sourceMode === 'AUTHORED' ? 'authored explanation' : 'Live AI explanation'}… No automatic retries.
    </p>}
    {state.status === 'error' && <div className="rr-error" data-testid={UI_HOOKS.explanationError}>
      <p role="alert"><strong>{state.error.code}</strong>: {state.error.message}</p>
      <p>{state.error.retryable ? 'Retry only when you choose. Each attempt has a new request ID.'
        : 'Retry is not permitted for this error. Reload the scenario or explicitly choose another source mode.'}</p>
      <p>No authored fallback or recap has been substituted.</p>
    </div>}
    {state.status === 'result' && <article className="explanation-result" data-testid={UI_HOOKS.explanationResult}
      data-status={state.result.status}>
      <p className="explanation-status" role="status">{state.result.status === 'LIMITED'
        ? 'Limited explanation · insufficient evidence' : 'Complete explanation · supplied evidence'}</p>
      <h3>{state.result.headline.text}</h3>
      <ClaimSources claim={state.result.headline} inspectSources={input.inspectSources} />
      <ol>
        {state.result.points.map(point => <li key={point.id}>
          <p>{point.text}</p><ClaimSources claim={point} inspectSources={input.inspectSources} />
        </li>)}
      </ol>
      <h3>Limitations</h3>
      <ul>{state.result.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>
      <section className="explanation-recap" aria-label="Supplied match consequence" data-testid={UI_HOOKS.recapPanel}>
        <h3>Match recap</h3>
        <p>{state.result.recap.text}</p>
        {input.scenarioId === 'S3' && <p>Supplied review outcome and after-review score are unavailable. No final score is inferred.</p>}
        <ClaimSources claim={state.result.recap} inspectSources={input.inspectSources} />
      </section>
      <small>{state.result.scenarioId} · {state.result.contentVersion} · {state.result.audience === 'CASUAL' ? 'Casual' : 'Analyst'}</small>
    </article>}
  </>
}

function ReaderSession(input: ExplanationReaderInput) {
  const [audience, setAudience] = useState<Audience>('CASUAL')
  const [sourceMode, setSourceMode] = useState<SourceMode>('AUTHORED')
  return <div className="explanation-reader">
    <div className="reader-controls">
      <label>Audience
        <select data-testid={UI_HOOKS.audienceSelect} value={audience}
          onChange={event => setAudience(event.target.value as Audience)}>
          <option value="CASUAL">Casual · plain language</option><option value="ANALYST">Analyst · more detail</option>
        </select>
      </label>
      <label>Explanation source
        <select data-testid={UI_HOOKS.sourceModeSelect} value={sourceMode}
          onChange={event => setSourceMode(event.target.value as SourceMode)}>
          <option value="AUTHORED">Authored · no model call</option><option value="LIVE_AI">Live AI · requires configuration</option>
        </select>
      </label>
    </div>
    <p className="source-mode-badge" data-testid={UI_HOOKS.sourceModeBadge}>{sourceMode === 'AUTHORED'
      ? 'Authored · supplied writing, not a model response'
      : 'Live AI · only an explicit Generate sends a request; no authored fallback'}</p>
    <RequestPanel key={`${audience}/${sourceMode}/${input.reviewReady}`} {...input} audience={audience} sourceMode={sourceMode} />
  </div>
}

export function ExplanationReader(input: ExplanationReaderInput) {
  return <ReaderSession key={JSON.stringify([input.scenarioId, input.contentVersion, input.replayRunId])} {...input} />
}
