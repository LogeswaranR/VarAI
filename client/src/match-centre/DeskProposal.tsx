import { useEffect, useId, useRef, useState } from 'react'
import { countdownAnnouncement, countdownSeconds, describeDecisionError, stateLabels, WINDOW_CLOSED_TEXT } from './desk-format'
import { remainingMs } from './desk-state'
import type { ServerClockSync } from './desk-state'
import { NarrationColumn, SourceChips } from './DeskNarration'
import type { DecisionAction, DecisionRequest, DecisionResult, ProposalView } from './gate-model'
import { formatClock } from './match-model'
import { formatMetric, kindLabel } from './match-format'
import { verificationSummary } from './narration-labels'
import { languageNames, NOTE_MAX_CHARS, narrationLanguages } from './narration-model'
import type { NarrationLanguage, NarrationText } from './narration-model'
import { OverrideEditor } from './OverrideEditor'
import { useNow } from './useNow'

function ProposalHeading({ proposal, headingId }: { readonly proposal: ProposalView; readonly headingId: string }) {
  const { cue } = proposal
  return <h3 id={headingId}>{kindLabel(cue.kind)} · {formatClock(cue.inMs)} · Priority {cue.priority}</h3>
}

function RuleFacts({ proposal }: { readonly proposal: ProposalView }) {
  const { cue } = proposal
  return (
    <details className="mc-rule-facts">
      <summary>Rule facts behind this cue</summary>
      <dl className="mc-narration">
        <div><dt>Rule headline</dt><dd>{cue.headline}</dd></div>
        <div><dt>Rule detail</dt><dd>{cue.detail}</dd></div>
        <div><dt>Why it matters</dt><dd>{cue.whyItMatters}</dd></div>
        <div><dt>Lower third</dt><dd>{cue.lowerThird.title} · {cue.lowerThird.subtitle}</dd></div>
        {cue.metrics.length > 0 && <div><dt>Metrics</dt><dd>{cue.metrics.map(metric => `${metric.label} ${formatMetric(metric)}`).join(' · ')}</dd></div>}
        <div><dt>Rule</dt><dd>{cue.rule}</dd></div>
      </dl>
    </details>
  )
}

function Countdown({ remaining, total }: { readonly remaining: number | null; readonly total: number }) {
  const closed = remaining !== null && remaining <= 0
  const fraction = remaining === null ? 1 : Math.min(1, Math.max(0, remaining / total))
  const text = closed ? WINDOW_CLOSED_TEXT : remaining === null ? 'Waiting for the desk clock…' : `${countdownSeconds(remaining)} s left to decide`
  return (
    <div className={`mc-countdown${closed ? ' is-closed' : fraction < 0.25 ? ' is-low' : ''}`} data-testid="countdown">
      <span className="mc-countdown-text">{text}</span>
      <span className="mc-countdown-bar" aria-hidden="true"><span style={{ width: `${fraction * 100}%` }} /></span>
      <span className="mc-sr-only" role="status">{countdownAnnouncement(remaining)}</span>
    </div>
  )
}

export interface PendingProposalProps {
  readonly proposal: ProposalView
  readonly sync: ServerClockSync | null
  readonly clock: () => number
  /** False while the desk feed is closed: nothing may be decided from a stale view. */
  readonly live: boolean
  readonly showUsage: boolean
  readonly onDecide: (request: DecisionRequest) => Promise<DecisionResult>
}

export function PendingProposal({ proposal, sync, clock, live, showUsage, onDecide }: PendingProposalProps) {
  const headingId = useId()
  const noteId = useId()
  const editorId = useId()
  const now = useNow(clock)
  const remaining = remainingMs(proposal, sync, now)
  const open = remaining === null || remaining > 0
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const canAct = open && live && !busy && !settled

  async function submit(action: DecisionAction, edits?: Readonly<Partial<Record<NarrationLanguage, NarrationText>>>) {
    setBusy(true)
    setError(null)
    const text = note.trim()
    try {
      await onDecide({
        approvalId: proposal.approvalId, payloadHash: proposal.payloadHash, action,
        ...(edits ? { edits } : {}), ...(text ? { note: text } : {}),
      })
      if (alive.current) {
        setSettled(true)
        setEditing(false)
      }
    } catch (cause) {
      const problem = describeDecisionError(cause)
      if (alive.current) {
        setError(problem.message)
        if (problem.settled) setSettled(true)
      }
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return (
    <li className="mc-proposal is-pending" data-testid="desk-proposal" data-approval-id={proposal.approvalId} data-state="PENDING">
      <article aria-labelledby={headingId}>
        <div className="mc-proposal-head">
          <ProposalHeading proposal={proposal} headingId={headingId} />
          <span className="mc-chip" data-testid="approval-id">{proposal.approvalId}</span>
          <span className={`mc-chip mc-state ${open ? 'state-pending' : 'state-expired'}`} data-testid="proposal-state">
            {open ? stateLabels.PENDING : WINDOW_CLOSED_TEXT}
          </span>
        </div>
        <Countdown remaining={remaining} total={Math.max(1, proposal.deadlineMs - proposal.proposedAtMs)} />
        <div className="mc-proposal-langs">
          {narrationLanguages.map(language => (
            <NarrationColumn key={language} language={language} narration={proposal.narrations[language]} showUsage={showUsage} />
          ))}
        </div>
        <RuleFacts proposal={proposal} />
        <div className="mc-decide" role="group" aria-label={`Decision for ${proposal.approvalId}`}>
          <div className="mc-field mc-note-field">
            <label htmlFor={noteId}>Note (optional)</label>
            <input id={noteId} type="text" maxLength={NOTE_MAX_CHARS} value={note} disabled={!canAct}
              placeholder="Plain text, kept in the decision log" onChange={event => setNote(event.target.value)} />
          </div>
          <button type="button" className="mc-primary" disabled={!canAct} onClick={() => void submit('approve')}>Approve</button>
          <button type="button" disabled={!canAct} onClick={() => void submit('hold')}>Hold</button>
          <button type="button" disabled={!canAct} aria-expanded={editing} aria-controls={editing ? editorId : undefined}
            onClick={() => setEditing(value => !value)}>Override</button>
        </div>
        {!live && !settled && <p className="mc-note">The desk is not receiving updates, so decisions are switched off.</p>}
        {live && !open && <p className="mc-note" data-testid="window-closed">{WINDOW_CLOSED_TEXT}. This cue will not air.</p>}
        {editing && (
          <OverrideEditor id={editorId} proposal={proposal} disabled={!canAct}
            onSave={edits => void submit('override', edits)} onCancel={() => setEditing(false)} />
        )}
        {error && <p className="mc-error" role="alert" data-testid="decision-error">{error}</p>}
      </article>
    </li>
  )
}

export function DecidedProposal({ proposal, showUsage }: { readonly proposal: ProposalView; readonly showUsage: boolean }) {
  const headingId = useId()
  return (
    <li className="mc-proposal is-decided" data-testid="desk-proposal" data-approval-id={proposal.approvalId} data-state={proposal.state}>
      <article aria-labelledby={headingId}>
        <div className="mc-proposal-head">
          <ProposalHeading proposal={proposal} headingId={headingId} />
          <span className="mc-chip" data-testid="approval-id">{proposal.approvalId}</span>
          <span className={`mc-chip mc-state state-${proposal.state.toLowerCase().replace('_', '-')}`} data-testid="proposal-state">
            {stateLabels[proposal.state]}
          </span>
        </div>
        {proposal.note && <p className="mc-note">Note: {proposal.note}</p>}
        <ul className="mc-decided-summary" aria-label="Narration sources and checks">
          {narrationLanguages.map(language => {
            const narration = proposal.narrations[language]
            const summary = verificationSummary(narration.verification)
            return (
              <li key={language}>
                <strong>{languageNames[language]}</strong>
                <SourceChips narration={narration} />
                <span className={`mc-chip is-${summary.kind}`} data-testid="verification-chip">{summary.text}</span>
              </li>
            )
          })}
        </ul>
        <details>
          <summary>Narration, checks and rule facts</summary>
          <div className="mc-proposal-langs">
            {narrationLanguages.map(language => (
              <NarrationColumn key={language} language={language} narration={proposal.narrations[language]} showUsage={showUsage} />
            ))}
          </div>
          <RuleFacts proposal={proposal} />
        </details>
      </article>
    </li>
  )
}
