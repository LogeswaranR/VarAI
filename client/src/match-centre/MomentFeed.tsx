import { formatClock, teamOf } from './match-model'
import type { MatchMetadata, OverlayCue } from './match-model'
import { cuesForFan } from './match-selectors'
import { cueIncludesTeamOrPlayer, formatMetric, kindLabel, shortEventId } from './match-format'
import { CueParagraphs, ProvenanceChips } from './CueNarrationView'
import { selectNarration } from './narration-select'
import type { NarrationLanguage } from './narration-model'
import type { Persona } from './profile'

function MomentSymbol({ kind }: { readonly kind: string }) {
  const path = kind === 'GOAL' ? 'M8 12h8M12 8v8'
    : kind === 'GOAL_DISALLOWED' ? 'M8 8l8 8M16 8l-8 8'
      : kind === 'REVIEW_STARTED' ? 'M10 7v6h5'
        : kind === 'CHAOS_SPIKE' || kind === 'MOMENTUM_SWING' ? 'M4 12h4l2-6 4 12 2-6h4'
          : 'M5 16 18 7M10 7h8v8'
  return <svg className="mc-moment-symbol" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.12" />
    <path d={path} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function Card({ cue, metadata, persona, mine, gated, language, featured, onHighlight }: {
  readonly cue: OverlayCue
  readonly metadata: MatchMetadata
  readonly persona: Persona
  readonly mine: boolean
  readonly gated: boolean
  readonly language: NarrationLanguage
  readonly featured: boolean
  readonly onHighlight: (eventIds: readonly string[]) => void
}) {
  const analyst = persona === 'analyst'
  const team = teamOf(metadata, cue.teamId)
  const view = gated ? selectNarration(cue, persona, language) : null
  return (
    <li className={`mc-card p${cue.priority}${mine ? ' is-mine' : ''}`} data-testid="moment-card" data-kind={cue.kind}>
      <div className="mc-card-meta">
        <span className="mc-time">{formatClock(cue.inMs)}</span>
        <span className="mc-kind">{kindLabel(cue.kind)}</span>
        {team && <span className="mc-team-chip">{team.shortName}</span>}
        {mine && <span className="mc-mine">{persona === 'fan' ? 'Your club' : 'Selected club'}</span>}
      </div>
      <div className="mc-moment-title">
        <MomentSymbol kind={cue.kind} />
        <h3 lang={view?.lang}>{view?.headline ?? cue.headline}</h3>
        {!analyst && cue.metrics[0] && <div className="mc-moment-number">
          <strong>{formatMetric(cue.metrics[0])}</strong><small>{cue.metrics[0].label}</small>
        </div>}
      </div>
      {view && <ProvenanceChips view={view} />}
      {(analyst || featured) && (view
        ? <CueParagraphs view={view} />
        : <>
          {analyst
            ? <p className="mc-detail">{cue.detail}</p>
            : <p className="mc-why"><strong>Why it matters</strong> {cue.whyItMatters}</p>}
          {analyst && <p className="mc-why"><strong>Why it matters</strong> {cue.whyItMatters}</p>}
        </>)}
      {analyst && cue.metrics.length > 0 && (
        <dl className="mc-metrics">
          {cue.metrics.map(metric => <div key={metric.key}><dt>{metric.label}</dt><dd>{formatMetric(metric)}</dd></div>)}
        </dl>
      )}
      <details open={analyst}>
        <summary>How we know</summary>
        {!analyst && !featured && (view ? <CueParagraphs view={view} /> : <p className="mc-why"><strong>Why it matters</strong> {cue.whyItMatters}</p>)}
        <p className="mc-rule">{cue.rule}</p>
        {cue.sourceWindow && <p className="mc-rule">Window: {formatClock(cue.sourceWindow.startMs)}–{formatClock(cue.sourceWindow.endMs)} of match time.</p>}
        <div className="mc-sources" role="group" aria-label="Source events">
          {cue.sourceEventIds.map(id => (
            <button key={id} type="button" title={`Show ${id} on the pitch`} aria-label={`Show source event ${id} on the pitch`}
              onClick={() => onHighlight([id])}>{shortEventId(id)}</button>
          ))}
        </div>
      </details>
      {cue.scenarioId && (
        <a className="mc-review-link" href={`/?scenario=${encodeURIComponent(cue.scenarioId)}`}>
          Open the evidence review for this moment →
        </a>
      )}
    </li>
  )
}

export function MomentFeed({ metadata, cues, persona, clubId, playerId, gated, language, onHighlight }: {
  readonly metadata: MatchMetadata
  readonly cues: readonly OverlayCue[]
  readonly persona: Persona
  readonly clubId: string | null
  readonly playerId: string | null
  readonly gated: boolean
  readonly language: NarrationLanguage
  readonly onHighlight: (eventIds: readonly string[]) => void
}) {
  const analyst = persona === 'analyst'
  const visible = analyst ? cues : cuesForFan(cues, clubId, playerId)
  const shown = [...visible].reverse().slice(0, analyst ? 80 : 40)
  const current = analyst ? shown : shown.slice(0, 6)
  const earlier = analyst ? [] : shown.slice(6)
  const card = (cue: OverlayCue, featured = false) => (
    <Card key={cue.overlayId} cue={cue} metadata={metadata} persona={persona} gated={gated} language={language}
      mine={cueIncludesTeamOrPlayer(cue, clubId, playerId)} featured={featured} onHighlight={onHighlight} />
  )
  return (
    <section className="mc-panel mc-feed" aria-labelledby="mc-feed-heading">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">{analyst ? (gated ? 'Every cue a person approved' : 'Every cue the rules produced') : 'The moments that matter'}</p>
          <h2 id="mc-feed-heading">{analyst ? 'Insight feed' : 'Moments'}</h2>
        </div>
        <span className="mc-tag">{visible.length} {visible.length === 1 ? 'cue' : 'cues'}</span>
      </div>
      {shown.length === 0
        ? <p className="mc-empty">
          {gated
            ? 'No approved moments yet. A cue appears here only after a person approves it at the operator desk and its delayed air time arrives.'
            : 'Kick off to discover the moments that change the match.'}
        </p>
        : <ol className="mc-cards" aria-label={analyst ? 'Insight cues, newest first' : 'Match moments, newest first'}>
          {current.map((cue, index) => card(cue, index === 0))}
        </ol>}
      {earlier.length > 0 && <details className="mc-disclosure mc-earlier">
        <summary>Earlier moments ({earlier.length})</summary>
        <ol className="mc-cards" aria-label="Earlier match moments, newest first">{earlier.map(cue => card(cue))}</ol>
      </details>}
    </section>
  )
}
