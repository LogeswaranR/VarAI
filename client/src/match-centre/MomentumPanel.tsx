import { formatClock, teamOf } from './match-model'
import type { MatchEvent, MatchMetadata, MomentumSample } from './match-model'
import type { Persona } from './profile'

const MATCH_MINUTES = 92

function headline(metadata: MatchMetadata, sample: MomentumSample | undefined) {
  if (!sample) return 'Waiting for kick-off'
  if (sample.state === 'CHAOS') return 'Chaos · possession is changing hands quickly'
  if (sample.state === 'CONTROL') return `${teamOf(metadata, sample.controllingTeamId)?.name ?? 'A team'} in control`
  return 'Balanced · neither side has settled'
}

function Chart({ metadata, samples, goals }: {
  readonly metadata: MatchMetadata
  readonly samples: readonly MomentumSample[]
  readonly goals: readonly MatchEvent[]
}) {
  const width = 320
  const height = 120
  const x = (minute: number) => (minute / MATCH_MINUTES) * width
  const y = (index: number) => height / 2 - (index / 100) * (height / 2 - 6)
  const points = samples.map(sample => `${x(sample.minute).toFixed(1)},${y(sample.controlIndex).toFixed(1)}`).join(' ')
  const latest = samples.at(-1)
  return (
    <svg className="mc-chart" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={latest
        ? `Control index by minute, ${metadata.homeTeam.shortName} above the line and ${metadata.awayTeam.shortName} below. Latest minute ${latest.minute}: ${latest.controlIndex}.`
        : 'Control index by minute. No data yet.'}>
      <rect x="0" y="0" width={width} height={height} fill="#0b141f" />
      {samples.map(sample => sample.state === 'CHAOS'
        ? <rect key={`chaos-${sample.minute}`} x={x(sample.minute - 1)} y="0" width={x(1)} height={height} fill="#ffd166" opacity="0.22" />
        : null)}
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#5c6f84" strokeWidth="1" />
      <text x="4" y="12" fill="#c2f970" fontSize="9">{metadata.homeTeam.shortName}</text>
      <text x="4" y={height - 4} fill="#79b8ff" fontSize="9">{metadata.awayTeam.shortName}</text>
      {goals.map(goal => (
        <line key={goal.eventId} x1={x(goal.matchClockMs / 60000)} y1="0" x2={x(goal.matchClockMs / 60000)} y2={height}
          stroke="#ffffff" strokeWidth="1" strokeDasharray="2 3" />
      ))}
      {points && <polyline points={points} fill="none" stroke="#edf4fc" strokeWidth="1.8" strokeLinejoin="round" />}
      {latest && <circle cx={x(latest.minute)} cy={y(latest.controlIndex)} r="3" fill="#c2f970" />}
    </svg>
  )
}

export function MomentumPanel({ metadata, samples, goals, persona }: {
  readonly metadata: MatchMetadata
  readonly samples: readonly MomentumSample[]
  readonly goals: readonly MatchEvent[]
  readonly persona: Persona
}) {
  const latest = samples.at(-1)
  const homeShare = latest?.homeBallActionSharePct ?? 50
  const homeShown = Math.round(homeShare)
  const awayShown = 100 - homeShown
  return (
    <section className="mc-panel mc-momentum" aria-labelledby="mc-momentum-heading">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">Control vs chaos</p>
          <h2 id="mc-momentum-heading">Match rhythm</h2>
        </div>
        {latest && <span className={`mc-tag state-${latest.state.toLowerCase()}`} data-testid="momentum-state">{latest.state}</span>}
      </div>
      <p className="mc-rhythm-headline" data-testid="momentum-headline">{headline(metadata, latest)}</p>
      <div className="mc-share-labels" aria-hidden="true">
        <span>{metadata.homeTeam.shortName} <strong>{latest ? `${homeShown}%` : '—'}</strong></span>
        <span><strong>{latest ? `${awayShown}%` : '—'}</strong> {metadata.awayTeam.shortName}</span>
      </div>
      <div className={`mc-gauge${latest ? '' : ' is-waiting'}`} role="img"
        aria-label={latest ? `Share of ball actions in the last ${Math.round(latest.windowSeconds / 60)} minutes: ${metadata.homeTeam.shortName} ${homeShown} percent, ${metadata.awayTeam.shortName} ${awayShown} percent.` : 'Share of ball actions: waiting for match data.'}>
        <span className="mc-gauge-home" style={{ width: `${homeShare}%` }} />
        <span className="mc-gauge-away" />
      </div>
      {samples.length > 0 && <Chart metadata={metadata} samples={samples} goals={goals} />}
      {persona === 'analyst' && <>
        {latest && <dl className="mc-facts">
          <div><dt>Window</dt><dd>{Math.round(latest.windowSeconds / 60)} min to {formatClock(latest.matchClockMs)}</dd></div>
          <div><dt>Control index</dt><dd>{latest.controlIndex > 0 ? '+' : ''}{latest.controlIndex}</dd></div>
          <div><dt>Turnovers / min</dt><dd>{latest.turnoversPerMinute.toFixed(1)}</dd></div>
          <div><dt>Pressures</dt><dd>{metadata.homeTeam.shortName} {latest.homePressures} · {metadata.awayTeam.shortName} {latest.awayPressures}</dd></div>
        </dl>}
      </>}
      <details className="mc-disclosure">
        <summary>How rhythm is measured</summary>
        <p className="mc-note">
        Share of ball actions (passes, carries, shots) in a 5-minute window, a possession proxy. Chaos means possession is changing hands unusually often; thresholds are listed on the cues.
        </p>
        <p className="mc-note">Chart: home above the centre line, away below. Gold bands mark chaos; dotted lines mark awarded goals, including goals later overturned.</p>
      </details>
    </section>
  )
}
