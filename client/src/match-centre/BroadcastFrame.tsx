import { formatClock, playerOf } from './match-model'
import { eventLabel } from './match-format'
import type { MatchEvent, MatchMetadata, OverlayCue, Score } from './match-model'
import type { StreamStatus } from './match-state'
import { ProvenanceChips } from './CueNarrationView'
import { selectNarration } from './narration-select'
import type { NarrationLanguage } from './narration-model'

const LENGTH = 105
const WIDTH = 68
const HOME_COLOR = '#c2f970'
const AWAY_COLOR = '#79b8ff'
const MISS_COLOR = '#ff9b9b'
const SHOT_COLOR = '#ffd166'

export const EVENT_MAP_WINDOW_MS = 25_000

export interface BroadcastFrameProps {
  readonly metadata: MatchMetadata
  readonly recent: readonly MatchEvent[]
  readonly highlighted: readonly MatchEvent[]
  readonly clockMs: number
  readonly score: Score
  readonly cue: OverlayCue | null
  readonly status: StreamStatus
  readonly clubId: string | null
  readonly speed: number
  /** Operator-gated program: the lower-third shows the approved narration in the viewer's language, with where it came from. */
  readonly gated: boolean
  readonly language: NarrationLanguage
}

function PitchLines() {
  return (
    <g fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.35">
      <rect x="0" y="0" width={LENGTH} height={WIDTH} />
      <line x1={LENGTH / 2} y1="0" x2={LENGTH / 2} y2={WIDTH} />
      <circle cx={LENGTH / 2} cy={WIDTH / 2} r="9.15" />
      <rect x="0" y="13.84" width="16.5" height="40.32" />
      <rect x={LENGTH - 16.5} y="13.84" width="16.5" height="40.32" />
      <rect x="0" y="24.84" width="5.5" height="18.32" />
      <rect x={LENGTH - 5.5} y="24.84" width="5.5" height="18.32" />
      <rect x="-2" y="30.34" width="2" height="7.32" />
      <rect x={LENGTH} y="30.34" width="2" height="7.32" />
      <circle cx="11" cy={WIDTH / 2} r="0.3" fill="#ffffff" />
      <circle cx={LENGTH - 11} cy={WIDTH / 2} r="0.3" fill="#ffffff" />
    </g>
  )
}

function Markers() {
  const arrow = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
      <path d="M0 0 6 3 0 6Z" fill={color} />
    </marker>
  )
  return <defs>{arrow('mc-arrow-home', HOME_COLOR)}{arrow('mc-arrow-away', AWAY_COLOR)}{arrow('mc-arrow-miss', MISS_COLOR)}{arrow('mc-arrow-shot', SHOT_COLOR)}</defs>
}

function EventMark({ item, color, opacity }: { readonly item: MatchEvent; readonly color: string; readonly opacity: number }) {
  const home = color === HOME_COLOR
  switch (item.eventType) {
    case 'PASS': {
      if (item.endX === null || item.endY === null) return null
      const missed = item.outcome !== 'COMPLETE'
      return <line x1={item.x} y1={item.y} x2={item.endX} y2={item.endY} stroke={missed ? MISS_COLOR : color}
        strokeWidth="0.5" strokeDasharray={missed ? '1.2 0.9' : undefined} opacity={opacity}
        markerEnd={`url(#${missed ? 'mc-arrow-miss' : home ? 'mc-arrow-home' : 'mc-arrow-away'})`} />
    }
    case 'CARRY':
      if (item.endX === null || item.endY === null) return null
      return <line x1={item.x} y1={item.y} x2={item.endX} y2={item.endY} stroke={color} strokeWidth="1.1"
        strokeDasharray="0.1 1.6" strokeLinecap="round" opacity={opacity} />
    case 'SHOT':
      if (item.endX === null || item.endY === null) return null
      return <line x1={item.x} y1={item.y} x2={item.endX} y2={item.endY} stroke={SHOT_COLOR} strokeWidth="0.8"
        opacity={opacity} markerEnd="url(#mc-arrow-shot)" />
    case 'GOAL':
      return <g opacity={Math.max(opacity, 0.7)}>
        <circle cx={Math.min(item.x, LENGTH - 2.5)} cy={item.y} r="3.2" fill="none" stroke={SHOT_COLOR} strokeWidth="0.6" />
        <circle cx={Math.min(item.x, LENGTH - 2.5)} cy={item.y} r="1.6" fill={SHOT_COLOR} />
      </g>
    case 'PRESSURE':
      return <circle cx={item.x} cy={item.y} r="2" fill="none" stroke={color} strokeWidth="0.45" opacity={opacity} />
    case 'TACKLE':
      return <path d={`M${item.x - 1.3} ${item.y - 1.3}L${item.x + 1.3} ${item.y + 1.3}M${item.x + 1.3} ${item.y - 1.3}L${item.x - 1.3} ${item.y + 1.3}`}
        stroke={color} strokeWidth="0.7" strokeLinecap="round" opacity={opacity} />
    case 'POSSESSION_CHANGE':
      return <rect x={item.x - 0.9} y={item.y - 0.9} width="1.8" height="1.8" fill={color} opacity={opacity}
        transform={`rotate(45 ${item.x} ${item.y})`} />
    case 'FOUL':
      return <path d={`M${item.x} ${item.y - 1.6}L${item.x + 1.5} ${item.y + 1.2}L${item.x - 1.5} ${item.y + 1.2}Z`}
        fill="none" stroke={MISS_COLOR} strokeWidth="0.5" opacity={opacity} />
    case 'CARD':
      return <rect x={item.x - 0.8} y={item.y - 1.2} width="1.6" height="2.4" fill={SHOT_COLOR} opacity={Math.max(opacity, 0.7)} />
    default:
      return null
  }
}

function periodLabel(metadata: MatchMetadata, clockMs: number, status: StreamStatus) {
  if (status === 'complete') return 'FT'
  if (status === 'idle' || (clockMs === 0 && status === 'connecting')) return 'KO'
  const second = metadata.periods.find(period => period.period === 2)
  return second && clockMs >= second.startMs ? '2H' : '1H'
}

export function BroadcastFrame({ metadata, recent, highlighted, clockMs, score, cue, status, clubId, speed, gated, language }: BroadcastFrameProps) {
  const colorOf = (teamId: string) => teamId === metadata.homeTeam.teamId ? HOME_COLOR : AWAY_COLOR
  const last = recent.findLast(item => item.eventType !== 'PERIOD_START' && item.eventType !== 'PERIOD_END' && item.eventType !== 'REVIEW')
  const actor = playerOf(metadata, last?.playerId ?? null)
  const playing = status === 'streaming' || status === 'reconnecting' || status === 'connecting'
  const view = gated && cue ? selectNarration(cue, 'fan', language) : null
  return (
    <figure className="mc-frame" aria-label="Broadcast frame with synthetic event map">
      <div className="mc-matchup" data-testid="scorebug">
        <div className={`mc-club mc-home${clubId === metadata.homeTeam.teamId ? ' is-followed' : ''}`}>
          <span className="mc-crest" aria-hidden="true">{metadata.homeTeam.shortName}</span>
          <span><strong>{metadata.homeTeam.name}</strong><small>HOME</small></span>
        </div>
        <div className="mc-score-centre">
          <strong data-testid="scoreline" aria-label={`Score ${score.home} to ${score.away}`}>{score.home} – {score.away}</strong>
          <span><span data-testid="match-clock">{formatClock(clockMs)}</span> <span>{periodLabel(metadata, clockMs, status)}</span></span>
        </div>
        <div className={`mc-club mc-away${clubId === metadata.awayTeam.teamId ? ' is-followed' : ''}`}>
          <span className="mc-crest" aria-hidden="true">{metadata.awayTeam.shortName}</span>
          <span><strong>{metadata.awayTeam.name}</strong><small>AWAY</small></span>
        </div>
      </div>
      <div className="mc-frame-stage">
        <svg viewBox="-4 -4 113 76" preserveAspectRatio="xMidYMid meet" role="img"
          aria-label={`Event map of the last ${EVENT_MAP_WINDOW_MS / 1000} seconds of match time: ${recent.length} synthetic events.`}>
          <Markers />
          <rect x="-4" y="-4" width="113" height="76" fill="#0e2a1c" />
          {[0, 1, 2, 3, 4, 5, 6].map(stripe => (
            <rect key={stripe} x={(stripe * LENGTH) / 7} y="0" width={LENGTH / 7} height={WIDTH}
              fill={stripe % 2 === 0 ? '#12331f' : '#0f2c1b'} />
          ))}
          <PitchLines />
          {recent.map(item => (
            <g key={item.eventId} className={playing && item === last ? 'mc-new-action' : undefined}>
              <EventMark item={item} color={colorOf(item.teamId)}
                opacity={Math.max(0.18, 1 - (clockMs - item.matchClockMs) / EVENT_MAP_WINDOW_MS)} />
            </g>
          ))}
          {highlighted.map(item => (
            <circle key={`highlight-${item.eventId}`} cx={item.x} cy={item.y} r="3.4" fill="none" stroke="#ffffff"
              strokeWidth="0.6" strokeDasharray="1 0.8" data-testid="highlighted-event" />
          ))}
          {last && <g key={`ball-${last.eventId}`} data-testid="last-action-marker">
            <circle className={playing ? 'mc-ball-pulse' : undefined} cx={last.endX ?? last.x} cy={last.endY ?? last.y} r="3" fill="none"
              stroke="#ffffff" strokeWidth="0.35" opacity="0.5" />
            <circle cx={last.endX ?? last.x} cy={last.endY ?? last.y} r="1.2" fill="#ffffff" stroke="#0e2a1c" strokeWidth="0.3" />
            {actor && <g>
              <circle cx={last.x} cy={last.y} r="2.5" fill={colorOf(last.teamId)} stroke="#071b19" strokeWidth="0.4" />
              <text x={last.x} y={last.y + 0.9} fill="#071b19" textAnchor="middle" fontSize="2.6" fontWeight="800">{actor.shirtNumber}</text>
            </g>}
          </g>}
        </svg>
        <span className="mc-map-label">EVENT MAP · LAST 25s</span>
        <span className={`mc-badge${gated ? ' is-gated' : ''}`}>
          {playing ? `SYNTHETIC · ${speed}×` : 'SYNTHETIC'}
          {gated && <small>OPERATOR-GATED</small>}
        </span>
        {status === 'idle' && <div className="mc-pitch-welcome">
          <span className="mc-play-symbol" aria-hidden="true">▶</span>
          <strong>Your match. Your perspective.</strong>
          <span>Kick off or jump to a key moment.</span>
        </div>}
        {cue && (
          <div className={`mc-lower-third p${cue.priority}`} data-testid="lower-third" data-overlay-id={cue.overlayId} key={cue.overlayId}>
            <span className="mc-lt-title">{cue.lowerThird.title}</span>
            {view
              ? <strong className="mc-lt-subtitle" lang={view.lang}>{view.headline}</strong>
              : <strong className="mc-lt-subtitle">{cue.lowerThird.subtitle}</strong>}
            {view && <ProvenanceChips view={view} />}
          </div>
        )}
      </div>
      <div className="mc-action-strip" data-testid="last-action">
        <span className={`mc-action-dot${playing ? ' is-playing' : ''}`} aria-hidden="true" />
        <span className="mc-kicker">{last ? eventLabel(last.eventType) : 'Ready for kick-off'}</span>
        <strong>{actor ? `#${actor.shirtNumber} ${actor.name}` : last ? 'Match event' : 'Synthetic event map'}</strong>
        {last && <span className="mc-time">{formatClock(last.matchClockMs)}</span>}
      </div>
      <div className="mc-match-progress" role="progressbar" aria-label="Match progress" aria-valuemin={0}
        aria-valuemax={metadata.durationMs} aria-valuenow={Math.min(clockMs, metadata.durationMs)} aria-valuetext={formatClock(clockMs)}>
        <span style={{ width: `${Math.min(100, clockMs / metadata.durationMs * 100)}%` }} />
      </div>
      <div className="mc-progress-labels" aria-hidden="true"><span>KO</span><span>45′</span><span>{Math.round(metadata.durationMs / 60000)}′</span></div>
      <p className="mc-sr-only" role="status" aria-live="polite">
        {cue ? (view ? `${cue.lowerThird.title}. ${view.headline}. ${view.provenance}.` : `${cue.lowerThird.title}. ${cue.lowerThird.subtitle}`) : ''}
      </p>
      <figcaption>
        <span>Synthetic coordinates · not live tracking or video</span>
        <details className="mc-map-guide">
          <summary>Map key</summary>
          <div className="mc-map-key"><span>→ Pass</span><span>··· Carry</span><span>○ Pressure</span><span>✕ Tackle</span><span>◎ Goal</span></div>
          <p>Gold arrows are shots. The number marks the last event&apos;s player at its start; the white dot marks its end, not a tracked ball. Fading = older.</p>
          <p>Lower-thirds are held for a few real seconds at demo speeds. At 1× they follow the cue&apos;s match-clock window.</p>
        </details>
      </figcaption>
    </figure>
  )
}
