import { useId } from 'react'
import { JUMP_66_SECONDS } from './gate-model'
import type { PlaybackMode, SessionView } from './gate-model'
import { narrationChipText, PREVIEW_LABEL, speedNote, statusText } from './match-copy'
import type { MatchMetadata } from './match-model'
import type { StreamStatus } from './match-state'
import type { NarrationStatus } from './narration-model'

const modes: readonly { readonly value: PlaybackMode; readonly label: string; readonly hint: string }[] = [
  { value: 'preview', label: 'Preview', hint: 'Rules only, no approval step' },
  { value: 'gated', label: 'Operator-gated', hint: 'A person approves each cue' },
]

export interface GatedControls {
  readonly session: SessionView | null
  readonly narration: NarrationStatus | null
  readonly narrationFailed: boolean
}

export function MatchControls({
  metadata, status, clockMs, speed, speedChoice, speeds, message, mode, gated, incremental, onIncremental, onMode, onSpeed, onStart, onStop, onJump,
}: {
  readonly metadata: MatchMetadata | null
  readonly status: StreamStatus
  readonly clockMs: number
  readonly speed: number
  readonly speedChoice: number
  readonly speeds: readonly number[]
  readonly message: string | null
  readonly mode: PlaybackMode
  readonly gated: GatedControls
  readonly incremental: boolean
  readonly onIncremental: (enabled: boolean) => void
  readonly onMode: (mode: PlaybackMode) => void
  readonly onSpeed: (speed: number) => void
  readonly onStart: (fromSeconds: number) => void
  readonly onStop: () => void
  readonly onJump: (matchClockMs: number) => void
}) {
  const active = status === 'connecting' || status === 'streaming' || status === 'reconnecting'
  const finished = status === 'complete' || status === 'stopped' || status === 'error'
  const baseId = useId()
  const gatedMode = mode === 'gated'
  const leadSeconds = gated.session?.leadSeconds ?? null
  const startLabel = gatedMode
    ? status === 'error' && gated.session === null ? 'Try again' : finished ? 'Restart gated run' : 'Start gated run'
    : finished ? 'Replay from kick-off' : incremental ? 'Start live simulation' : 'Kick off'
  return (
    <section className="mc-controls" aria-label="Match playback">
      <div className="mc-playbar">
      <div className="mc-actions">
        <button type="button" className="mc-primary" disabled={!metadata || active} onClick={() => onStart(0)}>{startLabel}</button>
        <button type="button" disabled={!active} onClick={onStop}>Stop</button>
        {!gatedMode && <button type="button" disabled={!metadata || active}
          onClick={() => { if (metadata) onJump(metadata.durationMs) }}>Full-time recap</button>}
        <label className="mc-speed"><span className="mc-speed-label">Speed</span>
          <select value={speedChoice} onChange={event => onSpeed(Number(event.target.value))}>
            {speeds.map(choice => <option key={choice} value={choice}>{choice}×</option>)}
          </select>
        </label>
      </div>
      </div>
      <div className="mc-playback-context">
        <p className="mc-context-label">{gatedMode ? 'Human approval required · delayed program' : incremental ? 'Live simulation · rules only · no approval' : 'Curated replay · rules only · no approval'}</p>
        <details className="mc-playback-options">
          <summary>Playback options &amp; guide</summary>
          <fieldset className="mc-mode">
            <legend>Mode</legend>
            {modes.map(item => (
              <label key={item.value} className={mode === item.value ? 'is-selected' : undefined}>
                <input type="radio" name="mc-mode" value={item.value} checked={mode === item.value} onChange={() => onMode(item.value)}
                  aria-labelledby={`${baseId}-${item.value}-label`} aria-describedby={`${baseId}-${item.value}-hint`} />
                <span>
                  <strong id={`${baseId}-${item.value}-label`}>{item.label}</strong>
                  <small id={`${baseId}-${item.value}-hint`}>{item.hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {gatedMode
            ? <p className="mc-mode-note" data-testid="mode-note">{speedNote(leadSeconds)}</p>
            : <>
              <p className="mc-mode-note is-preview" data-testid="mode-note">{PREVIEW_LABEL}</p>
              <label className="mc-live-choice">
                <input type="checkbox" checked={incremental} onChange={event => onIncremental(event.target.checked)} />
                Incremental live simulation
              </label>
              <p className="mc-note" data-testid="processing-mode">{incremental
                ? 'Live processing: rules consume events one at a time; future goals and review outcomes are unavailable. No AI or operator approval. Source events are still a seeded synthetic simulation, not a live match connection.'
                : 'Curated replay: match insights and jump points were computed before playback.'}</p>
              <p className="mc-note">Jump to a goal for a short demo, or start at kick-off. For AI-written English/Tamil cues, use Operator-gated mode.</p>
            </>}
        </details>
      </div>
      {gatedMode && <p className="mc-chips"><span className="mc-chip" data-testid="narration-status">{narrationChipText(gated.narration, gated.narrationFailed)}</span></p>}
      {metadata && !incremental && (metadata.highlights.length > 0 || gatedMode) && (
        <div className="mc-highlights mc-jump-points" role="group" aria-label="Jump to a key moment">
          <span>{gatedMode ? 'Jump to (starts a new session)' : 'Jump to'}</span>
          {gatedMode && <button type="button" disabled={active} onClick={() => onJump(JUMP_66_SECONDS * 1000)}>Jump to 66:00</button>}
          {metadata.highlights.map(item => (
            <button key={item.highlightId} type="button" disabled={active} onClick={() => onJump(item.matchClockMs)} aria-label={`▶ ${item.label}`}>
              <span className="mc-jump-time">{item.label.split(' · ')[0]}</span>
              <span>{item.label.split(' · ').slice(1).join(' · ') || 'Key moment'}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mc-status" role="status" aria-live="polite" aria-atomic="true" data-testid="match-status">
        {statusText(status, clockMs, speed, message, metadata, gatedMode ? { leadSeconds } : null)}
      </p>
    </section>
  )
}
