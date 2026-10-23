import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { describeDecisionError, IDENTITY_NOTE, LOG_NOTE, SESSION_ENDED_MESSAGE, stateLabels } from './desk-format'
import { decidedProposals, pendingProposals } from './desk-state'
import type { DeskConnection, DeskState } from './desk-state'
import { DecidedProposal, PendingProposal } from './DeskProposal'
import type { DecisionRequest, DecisionResult, GatePhase } from './gate-model'

const connectionLabels: Readonly<Record<DeskConnection, string>> = {
  idle: 'Desk not started',
  connecting: 'Connecting to the desk…',
  open: 'Desk connected',
  reconnecting: 'Desk reconnecting…',
  closed: 'Desk stopped',
  ended: 'Session ended',
  error: 'Desk disconnected',
}

function outcomeText(request: DecisionRequest, result: DecisionResult) {
  const { approvalId } = request
  switch (result.state) {
    case 'APPROVED': return `${approvalId} approved. It airs when its time comes.`
    case 'HELD': return `${approvalId} held. It will not air.`
    case 'OVERRIDDEN': return `${approvalId} overridden with your edits. It airs when its time comes.`
    default: return `${approvalId}: ${stateLabels[result.state]}.`
  }
}

export interface OperatorDeskProps {
  /** `full` is the Studio view with model usage; `compact` sits above the moment feed for any persona and can be collapsed. */
  readonly variant: 'full' | 'compact'
  readonly desk: DeskState
  readonly phase: GatePhase
  readonly logUrl: string | null
  readonly clock: () => number
  readonly onDecide: (request: DecisionRequest) => Promise<DecisionResult>
  readonly onReconnect: () => void
}

export function OperatorDesk({ variant, desk, phase, logUrl, clock, onDecide, onReconnect }: OperatorDeskProps) {
  const compact = variant === 'compact'
  const headingId = useId()
  const bodyId = useId()
  const [expanded, setExpanded] = useState(true)
  const [outcome, setOutcome] = useState<string | null>(null)
  const outcomeRef = useRef<HTMLParagraphElement>(null)
  const pending = pendingProposals(desk.proposals)
  const decided = decidedProposals(desk.proposals)
  const live = desk.connection === 'open' || desk.connection === 'reconnecting'
  const slaSeconds = desk.session?.slaSeconds

  // The decided card replaces the one that had focus, so focus moves to the plain-words result of the decision.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  const decide = useCallback(async (request: DecisionRequest) => {
    try {
      const result = await onDecide(request)
      setOutcome(outcomeText(request, result))
      return result
    } catch (error) {
      const problem = describeDecisionError(error)
      if (problem.settled) setOutcome(`${request.approvalId}: ${problem.message}`)
      throw error
    }
  }, [onDecide])

  return (
    <section className={`mc-panel mc-desk${compact ? ' is-compact' : ''}`} aria-labelledby={headingId} data-testid="operator-desk" data-variant={variant}>
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">Human approval gate</p>
          <h2 id={headingId}>Operator desk</h2>
        </div>
        <div className="mc-desk-tools">
          <span className="mc-tag" data-testid="desk-connection">{connectionLabels[desk.connection]}</span>
          <span role="status" className={pending.length > 0 ? 'mc-tag is-live' : 'mc-sr-only'} data-testid="desk-pending-count">
            {pending.length > 0 ? `${pending.length} awaiting a decision` : 'No cue awaiting a decision'}
          </span>
          {compact && (
            <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(value => !value)}>
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
      </div>
      <div id={bodyId} hidden={compact && !expanded}>
        <p className="mc-note">
          Each cue is proposed to this desk {slaSeconds === undefined ? 'shortly' : `about ${slaSeconds} s`} before it would air. Nothing airs unless a person approves or
          overrides it. A cue nobody decides in time is held automatically; it is never approved on its own.
        </p>
        <p ref={outcomeRef} tabIndex={-1} role="status" className="mc-outcome" data-testid="desk-outcome">{outcome}</p>
        {phase === 'idle' && <p className="mc-empty">Start an operator-gated run to receive cue proposals here.</p>}
        {phase === 'creating' && <p className="mc-empty" role="status">Creating the session…</p>}
        {phase === 'ended' && <p className="mc-error" role="alert">{desk.message ?? SESSION_ENDED_MESSAGE}</p>}
        {phase === 'running' && desk.connection === 'error' && (
          <div className="mc-error" role="alert">
            <p>{desk.message ?? 'The desk connection closed.'}</p>
            <button type="button" onClick={onReconnect}>Reconnect desk</button>
          </div>
        )}
        {phase === 'running' && desk.connection === 'reconnecting' && <p className="mc-note" role="status">{desk.message}</p>}
        {phase === 'stopped' && <p className="mc-note">{desk.message ?? 'Stopped: the desk no longer receives updates.'} Start a new run to continue.</p>}
        {pending.length > 0 && (
          <ol className="mc-proposals" aria-label="Cues awaiting a decision">
            {pending.map(proposal => (
              <PendingProposal key={proposal.approvalId} proposal={proposal} sync={desk.sync} clock={clock} live={live}
                showUsage={!compact} onDecide={decide} />
            ))}
          </ol>
        )}
        {pending.length === 0 && phase === 'running' && live && (
          <p className="mc-empty">
            No cue is waiting for a decision. The next one appears {slaSeconds === undefined ? 'shortly' : `about ${slaSeconds} s`} before it would air.
          </p>
        )}
        {decided.length > 0 && (
          <details className="mc-decided" open>
            <summary>Decided ({decided.length})</summary>
            <ol className="mc-proposals" aria-label="Decided cues, newest first">
              {decided.map(proposal => <DecidedProposal key={proposal.approvalId} proposal={proposal} showUsage={!compact} />)}
            </ol>
          </details>
        )}
        <div className="mc-desk-footer">
          {logUrl && (
            <>
              <p><a href={logUrl} download data-testid="decision-log-link">Download decision log (JSONL)</a></p>
              <p className="mc-note">{LOG_NOTE}</p>
            </>
          )}
          <p className="mc-note">{IDENTITY_NOTE}</p>
        </div>
      </div>
    </section>
  )
}
