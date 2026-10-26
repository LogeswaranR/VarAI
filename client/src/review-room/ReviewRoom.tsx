import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ComponentType } from 'react'
import type {
  ComparisonInput, ContextEvidenceEntry, EvidenceExplorerInput, ExplanationClient,
  ExplanationReaderInput, ScenarioRepository, SceneInput, SourceSelection,
} from '../contracts/interfaces'
import type { EventKind } from '../contracts/graphql.generated'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { createReviewRoomController } from './controller'
import type { LoadFailure, ReviewRoomState } from './controller'
import { projectReplay } from './replay'
import './review-room.css'

export interface ReviewRoomSlots {
  readonly scene: ComponentType<SceneInput>
  readonly evidence: ComponentType<EvidenceExplorerInput>
  readonly explanation: ComponentType<ExplanationReaderInput>
  readonly comparison: ComponentType<ComparisonInput>
}

export interface ReviewRoomProps {
  readonly repository: ScenarioRepository
  readonly client: ExplanationClient
  readonly slots?: Partial<ReviewRoomSlots>
  readonly initialScenarioId?: string | null
}

const stageNames: Record<EventKind, string> = {
  PASS: 'Pass played',
  RECEIVER_TOUCH: 'Receiver touch',
  SHOT: 'Shot',
  GOAL: 'Goal event',
  REVIEW_STARTED: 'Review started',
  REVIEW_READY: 'Review-ready',
}

function statusText(state: ReviewRoomState) {
  if (state.listStatus === 'loading') return 'Loading scenario choices.'
  if (state.listStatus === 'error') return 'Scenario choices could not be loaded. Recovery controls are available.'
  if (state.scenarioStatus === 'loading') return `Loading ${state.selectedId}. Previous replay cleared.`
  if (state.scenarioStatus === 'error') return 'Scenario unavailable. Choose another scenario or use the recovery controls.'
  if (!state.scenario) return 'Choose a scenario to begin. Playback does not start automatically.'
  const event = state.scenario.events[state.replay.eventCount - 1]
  const stage = event ? stageNames[event.kind] : 'Before the pass'
  const status = { ready: 'Ready to play', playing: 'Playing', paused: 'Paused', complete: 'Replay complete' }[state.replay.status]
  return `${state.scenario.id}: ${status}. ${stage}. ${state.replay.eventCount} of ${state.scenario.events.length} events released.`
}

function contextValue(entry: ContextEvidenceEntry) {
  if (entry.value === null) return 'Missing from supplied evidence'
  if (typeof entry.value !== 'string') return `${entry.value.home} – ${entry.value.away}`
  return { GOAL_AWARDED: 'Goal awarded', GOAL_CONFIRMED: 'Goal confirmed', GOAL_DISALLOWED: 'Goal disallowed' }[entry.value]
}

function teamInitials(name: string) {
  return name.trim().split(/\s+/).map(word => word.charAt(0)).slice(0, 3).join('')
}

function ErrorNotice({ error, retry, reload }: {
  error: LoadFailure
  retry?: () => void
  reload?: () => void
}) {
  return (
    <div className="rr-error">
      <p role="alert"><strong>{error.code}</strong>: {error.message}</p>
      <div className="rr-actions">
        {error.retryable && retry && <button type="button" onClick={retry}>Retry scenario</button>}
        {reload && <button type="button" onClick={reload}>Reload scenario choices</button>}
      </div>
    </div>
  )
}

export function ReviewRoom({ repository, client, slots = {}, initialScenarioId = null }: ReviewRoomProps) {
  const controller = useMemo(
    () => createReviewRoomController(repository, initialScenarioId), [repository, initialScenarioId],
  )
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const evidenceRef = useRef<HTMLElement>(null)
  const { scene: Scene, evidence: Evidence, explanation: Explanation, comparison: Comparison } = slots
  useEffect(() => {
    controller.start()
    return controller.stop
  }, [controller])
  useEffect(() => {
    if (Comparison && state.replay.status === 'complete') void controller.loadComparison()
  }, [Comparison, controller, state.replay.status, state.replay.replayRunId])

  const scenario = state.scenario
  const projection = scenario ? projectReplay(scenario, state.replay, state.selection) : null
  const run = state.replay.replayRunId
  const currentEvent = projection?.events.at(-1)
  const duration = scenario?.events.at(-1)?.offsetMs ?? 0
  const panelKey = `${scenario?.id}/${scenario?.contentVersion}/${run}`
  function inspectSources(selection: SourceSelection) {
    if (controller.inspectSources(selection, run)) evidenceRef.current?.focus()
  }
  const selectedKnown = state.summaries.some(item => item.id === state.selectedId)

  return (
    <section className="review-room" aria-label="Review room">
      <header className="rr-header">
        <div>
          <p className="rr-eyebrow" data-testid={UI_HOOKS.syntheticBadge}>Synthetic replay · supplied content</p>
          <h1>Review room<span className="rr-title-dot" aria-hidden="true">.</span></h1>
          <p className="rr-intro">Replay the moment. Inspect the evidence. Understand the supplied interpretation.</p>
        </div>
        <label className="rr-scenario">Choose scenario
          <select data-testid={UI_HOOKS.scenarioSelect} value={selectedKnown ? state.selectedId ?? '' : ''}
            disabled={state.listStatus !== 'ready'}
            onChange={event => { void controller.selectScenario(event.target.value) }}>
            <option value="" disabled>Select a scenario</option>
            {state.summaries.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </header>

      <p className="rr-status" role="status" aria-live="polite" aria-atomic="true"
        data-testid={UI_HOOKS.reviewReady}>{statusText(state)}</p>
      {state.listError && <ErrorNotice error={state.listError} reload={() => { void controller.reloadChoices() }} />}
      {state.scenarioError && <ErrorNotice error={state.scenarioError}
        retry={() => { void controller.retryScenario() }} reload={() => { void controller.reloadChoices() }} />}
      {!scenario && state.listStatus === 'ready' && state.scenarioStatus === 'idle' &&
        <p className="rr-empty">Select S1, S2 or S3 above, then press Play. Nothing has been played or explained yet.</p>}

      {scenario && projection && <>
        <div className="rr-match" aria-label="Supplied match context">
          <div className="rr-team">
            <span className="rr-team-badge" aria-hidden="true">{teamInitials(scenario.match.homeTeam)}</span>
            <div><span>Home</span><strong>{scenario.match.homeTeam}</strong></div>
          </div>
          <div className="rr-score">
            <strong aria-label="Score before replay">{scenario.match.scoreBefore.home} – {scenario.match.scoreBefore.away}</strong>
            <span>Score before · {scenario.match.incidentMinute}′ incident</span>
          </div>
          <div className="rr-team rr-team-away">
            <span className="rr-team-badge" aria-hidden="true">{teamInitials(scenario.match.awayTeam)}</span>
            <div><span>Away</span><strong>{scenario.match.awayTeam}</strong></div>
          </div>
        </div>

        <div className="rr-workspace">
          <div className="rr-main-column">
            <section className="rr-panel rr-scene" aria-label="Scene slot" data-testid="review-room-scene-slot" key={`scene/${panelKey}`}>
              <div className="rr-panel-heading">
                <span className="rr-panel-index" aria-hidden="true">01</span>
                <div><p className="rr-kicker">The incident</p><h2>Scene</h2></div>
                <span className="rr-tag">Illustration</span>
              </div>
              {Scene ? <Scene {...projection.scene} /> : <div data-testid={UI_HOOKS.scenePanel}>
                <p className="rr-placeholder">Placeholder — scene panel not implemented.</p>
                <p>No pitch rendering or tracking evidence is provided by this shell.</p>
                <p data-testid={projection.illustrationRevealed && projection.scene.diagram.status === 'UNAVAILABLE'
                  ? UI_HOOKS.missingSnapshot : undefined}>
                  {projection.illustrationRevealed && projection.scene.diagram.status === 'ILLUSTRATIVE'
                    ? 'Supplied illustrative input is now available to an injected scene panel.'
                    : projection.scene.diagram.textAlternative}
                </p>
              </div>}
            </section>
          <section className="rr-replay" aria-label="Replay controls and timeline">
            <p className="rr-eyebrow">Run {run} · compressed demonstration timing</p>
            <h2 data-testid="replay-stage">{currentEvent ? stageNames[currentEvent.kind] : 'Before the pass'}</h2>
            <p className="rr-stage-detail">{currentEvent?.label ?? 'Ready when you are. No event evidence has been released.'}</p>
            <div className="rr-actions rr-playback-actions">
              <button type="button" className="rr-primary" data-testid={UI_HOOKS.replayPlay}
                disabled={state.replay.status === 'playing' || state.replay.status === 'complete'} onClick={controller.play}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 10 7-10 7Z" /></svg>
                {state.replay.status === 'paused' ? 'Resume' : 'Play'}
              </button>
              <button type="button" data-testid={UI_HOOKS.replayPause}
                disabled={state.replay.status !== 'playing'} onClick={controller.pause}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3v14H5Zm7 0h3v14h-3Z" /></svg>
                Pause
              </button>
              <button type="button" data-testid={UI_HOOKS.replayReset} onClick={controller.restart}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5v4h4M4.5 8a6 6 0 1 1 0 4" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
                Restart
              </button>
            </div>
            <label className="rr-progress">Replay progress
              <progress value={state.replay.elapsedMs} max={duration || 1}
                aria-valuetext={`${state.replay.eventCount} of ${scenario.events.length} events released`} />
            </label>
            <p className="rr-timing">{(state.replay.elapsedMs / 1000).toFixed(2)}s / {(duration / 1000).toFixed(2)}s
              {' · '}{state.replay.eventCount} of {scenario.events.length} events released</p>
            <h3>Released events</h3>
            {projection.events.length === 0
              ? <p className="rr-empty-events">No events yet. Future event details are withheld.</p>
              : <ol className="rr-events" aria-label="Released replay events">
                {projection.events.map((event, index) => <li key={event.id}
                  aria-current={index === projection.events.length - 1 ? 'step' : undefined}>
                  <span>{(event.offsetMs / 1000).toFixed(2)}s</span>
                  <span><strong>{stageNames[event.kind]}</strong><br />{event.label}</span>
                </li>)}
              </ol>}
          </section>
          </div>
          <div className="rr-aside-column">
            <section className="rr-panel rr-explanation" aria-label="Explanation slot" data-testid="review-room-explanation-slot"
              key={`explanation/${panelKey}`}>
              <div className="rr-panel-heading">
                <span className="rr-panel-index" aria-hidden="true">02</span>
                <div><p className="rr-kicker">Make sense of the moment</p><h2>Explanation &amp; recap</h2></div>
              </div>
              {Explanation ? <Explanation scenarioId={scenario.id} contentVersion={scenario.contentVersion} replayRunId={run}
                reviewReady={projection.reviewReady} client={client} inspectSources={inspectSources} /> : <>
                <p className="rr-placeholder">Placeholder — explanation reader and recap not implemented.</p>
                <p>No explanation has been requested. Playback never calls an explanation service automatically.</p>
              </>}
            </section>
          <section className="rr-context" aria-label="Staged decision context">
            <p className="rr-kicker">The supplied call</p>
            <h2>Supplied context</h2>
            <p>Not yet revealed is different from missing evidence.</p>
            <dl>
              {([
                ['DECISION-ORIGINAL', 'Original decision'],
                ['DECISION-REVIEW', 'Supplied review outcome'],
                ['MATCH-SCORE-AFTER', 'Score after review'],
              ] as const).map(([id, label]) => {
                const entry = projection.evidence.contextEvidence.find(item => item.id === id)
                return <div key={id}>
                  <dt>{label}</dt>
                  <dd data-testid={`context-${id}`}>{entry ? contextValue(entry) : 'Not yet revealed'}</dd>
                </div>
              })}
            </dl>
            <p className="rr-note">{projection.reviewReady
              ? 'Review-ready means the prototype evidence pack is available. This is not an official referee verdict.'
              : 'The original decision appears at the goal event. The supplied outcome and after-score wait until review-ready.'}</p>
          </section>
          </div>
        </div>

        <div className="rr-panels" key={panelKey}>
          <section className="rr-panel rr-evidence" aria-label="Evidence slot" tabIndex={-1} ref={evidenceRef} id="evidence"
            data-testid="review-room-evidence-slot">
            <div className="rr-panel-heading">
              <span className="rr-panel-index" aria-hidden="true">03</span>
              <div><p className="rr-kicker">Behind the interpretation</p><h2>Evidence</h2></div>
            </div>
            {state.selectionError && <p role="alert">{state.selectionError}</p>}
            {Evidence ? <Evidence {...projection.evidence} /> : <div data-testid={UI_HOOKS.evidencePanel}>
              <p className="rr-placeholder">Placeholder — evidence navigator not implemented.</p>
              <p>{projection.evidence.visibleFacts.length} fact records released;
                {' '}{projection.evidence.contextEvidence.length} context records released.</p>
              {projection.evidence.visibleFacts.some(fact => fact.status === 'MISSING') &&
                <p data-testid={UI_HOOKS.missingEvidence}>Released records explicitly mark missing evidence. No values have been guessed.</p>}
            </div>}
          </section>
          <section className="rr-panel rr-comparison" aria-label="Comparison slot" data-testid="review-room-comparison-slot">
            <div className="rr-panel-heading">
              <span className="rr-panel-index" aria-hidden="true">04</span>
              <div><p className="rr-kicker">Change one thing</p><h2>Controlled comparison</h2></div>
            </div>
            {!Comparison
              ? <div data-testid={UI_HOOKS.comparisonPanel}>
                <p className="rr-placeholder">Placeholder — comparison panel not implemented.</p>
                <p>No comparison feature is loaded. The host can pass a checked pair to an injected panel after review-ready.</p>
              </div>
              : scenario.comparison === null
                ? <div data-testid={UI_HOOKS.comparisonPanel}>
                  <p data-testid={UI_HOOKS.comparisonUnavailable}>No comparison is supplied for S3:
                    missing position evidence cannot support the offered S1/S2 comparison.</p>
                </div>
                : !projection.reviewReady
                  ? <p>Comparison input is not yet revealed. Complete the replay first.</p>
                  : state.comparison.pair
                    ? <Comparison scenarioId={scenario.id} reviewReady={true} pair={state.comparison.pair}
                      selectScenario={id => { void controller.selectComparison(id, run) }} />
                    : state.comparison.error
                      ? <div className="rr-error">
                        <p role="alert">{state.comparison.error.code}: {state.comparison.error.message}</p>
                        {state.comparison.error.retryable && <button type="button"
                          onClick={() => { void controller.loadComparison(true) }}>Retry comparison</button>}
                        <button type="button" onClick={() => { void controller.reloadChoices() }}>Reload scenario choices</button>
                      </div>
                      : <p role="status">Loading the supplied comparison pair.</p>}
          </section>
        </div>
      </>}
      <footer className="rr-footer">Synthetic learning prototype, not an AI referee. Supplied interpretations are not official
        decisions. Source checking does not establish expert review, semantic accuracy or learning impact.</footer>
    </section>
  )
}
