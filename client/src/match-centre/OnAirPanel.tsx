import { formatClock } from './match-model'
import type { OverlayCue } from './match-model'
import { kindLabel } from './match-format'
import { CueParagraphs, ProvenanceChips } from './CueNarrationView'
import { selectNarration } from './narration-select'
import type { NarrationLanguage } from './narration-model'

export function OnAirPanel({ cue, gated, language }: {
  readonly cue: OverlayCue | null
  readonly gated: boolean
  readonly language: NarrationLanguage
}) {
  const view = gated && cue ? selectNarration(cue, 'studio', language) : null
  return (
    <section className="mc-panel mc-onair" aria-labelledby="mc-onair-heading">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">Program monitor</p>
          <h2 id="mc-onair-heading">On air</h2>
        </div>
        <span className={`mc-tag${cue ? ' is-live' : ''}`} data-testid="on-air-state">{cue ? 'ON AIR' : 'IDLE'}</span>
      </div>
      {cue
        ? <>
          <p className="mc-onair-title" data-testid="on-air-title">{cue.lowerThird.title}</p>
          {view
            ? <div className="mc-onair-narration" data-testid="on-air-narration">
              <h3 lang={view.lang}>{view.headline}</h3>
              <ProvenanceChips view={view} />
              <CueParagraphs view={view} />
            </div>
            : <p className="mc-onair-subtitle">{cue.lowerThird.subtitle}</p>}
          <dl className="mc-facts">
            <div><dt>Kind</dt><dd>{kindLabel(cue.kind)}</dd></div>
            <div><dt>Priority</dt><dd>{cue.priority}</dd></div>
            <div><dt>In–out</dt><dd>{formatClock(cue.inMs)}–{formatClock(cue.outMs)}</dd></div>
            <div><dt>Sources</dt><dd>{cue.sourceEventIds.length} events</dd></div>
          </dl>
          <p className="mc-rule">{cue.rule}</p>
        </>
        : <p className="mc-empty">
          {gated
            ? 'Nothing is on air. A cue goes live only after a person approves it and its delayed air time arrives.'
            : 'Nothing is on air. The next cue goes live when its in-time is reached.'}
        </p>}
    </section>
  )
}
