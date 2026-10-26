import { useState } from 'react'
import { formatClock, MATCH_ID } from './match-model'
import type { MatchMetadata, OverlayCue } from './match-model'
import { downloadJson, kindLabel } from './match-format'
import { CueParagraphs, ProvenanceChips } from './CueNarrationView'
import { selectNarration } from './narration-select'
import { languageNames } from './narration-model'
import type { NarrationLanguage } from './narration-model'

export function StudioPanel({ metadata, cues, onAirId, clockMs, speed, gated, incremental, language }: {
  readonly metadata: MatchMetadata
  readonly cues: readonly OverlayCue[]
  readonly onAirId: string | null
  readonly clockMs: number
  readonly speed: number
  readonly gated: boolean
  readonly incremental: boolean
  readonly language: NarrationLanguage
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const queue = [...cues].reverse()
  const selected = queue.find(cue => cue.overlayId === selectedId) ?? queue[0] ?? null
  const view = gated && selected ? selectNarration(selected, 'studio', language) : null
  return (
    <section className="mc-panel mc-studio" aria-labelledby="mc-studio-heading">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">Machine-readable overlay feed</p>
          <h2 id="mc-studio-heading">Studio cue queue</h2>
        </div>
        <button type="button" disabled={cues.length === 0} onClick={() => downloadJson('syn-match-01-cue-sheet.json', cues)}>
          Download cue sheet
        </button>
      </div>
      {gated
        ? <p className="mc-note">
          In operator-gated mode this queue lists only cues a person approved, each at its delayed air time. A rendering partner would read the session
          program feed (<code>/api/matches/{MATCH_ID}/sessions/{'{sessionId}'}/program</code>, schema 1.0 with an <code>approval</code> object on every cue).
          This prototype is not connected to a graphics system.
        </p>
        : <p className="mc-note">
          A rendering partner would consume <code>/api/matches/{MATCH_ID}/{incremental ? 'live' : 'overlays'}?speed=1</code>
          {incremental ? ' and select the overlay messages from the combined incremental feed' : ''} (overlay schema 1.0, Server-Sent Events). Cues arrive when their match-clock
          in-time is reached; at {speed}× each one is also held on air for a few real seconds so it can be read. This prototype is not connected to a graphics system.
          This is the preview feed: deterministic rules only, not operator-approved.
        </p>}
      {queue.length === 0
        ? <p className="mc-empty">
          {gated
            ? 'The queue is empty. A cue is added only after a person approves it and its delayed air time arrives.'
            : 'The queue is empty. Cues are emitted as match time reaches their in-time.'}
        </p>
        : <div className="mc-studio-grid">
          <table className="mc-queue">
            <caption>Cue queue, newest first</caption>
            <thead><tr><th scope="col">In–out</th><th scope="col">Kind</th><th scope="col">P</th><th scope="col">Status</th><th scope="col">Cue</th></tr></thead>
            <tbody>
              {queue.map(cue => {
                const status = cue.overlayId === onAirId ? 'On air' : clockMs >= cue.outMs ? 'Played' : 'Ready'
                return (
                  <tr key={cue.overlayId} className={cue.overlayId === selected?.overlayId ? 'is-selected' : undefined} data-testid="cue-row">
                    <td>{formatClock(cue.inMs)}–{formatClock(cue.outMs)}</td>
                    <td>{kindLabel(cue.kind)}</td>
                    <td>{cue.priority}</td>
                    <td className={status === 'On air' ? 'is-on-air' : undefined}>{status}</td>
                    <td><button type="button" aria-pressed={cue.overlayId === selected?.overlayId}
                      onClick={() => setSelectedId(cue.overlayId)}>{cue.lowerThird.title}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {selected && <div className="mc-json">
            <h3>{selected.overlayId}</h3>
            {view && (
              <div className="mc-onair-narration" data-testid="studio-narration">
                <p className="mc-kicker">Approved narration · {languageNames[language]}</p>
                <h4 lang={view.lang}>{view.headline}</h4>
                <ProvenanceChips view={view} />
                <CueParagraphs view={view} />
              </div>
            )}
            <pre aria-label={`Overlay JSON for ${selected.overlayId}`} data-testid="cue-json">{JSON.stringify(selected, null, 2)}</pre>
          </div>}
        </div>}
      <p className="mc-note">{metadata.homeTeam.shortName} / {metadata.awayTeam.shortName} cues share one schema; every cue lists the events or window it came from.</p>
    </section>
  )
}
