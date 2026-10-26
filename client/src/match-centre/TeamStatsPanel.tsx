import { formatClock } from './match-model'
import type { MatchEvent, MatchMetadata } from './match-model'
import { teamStats } from './match-selectors'
import { eventLabel, shortEventId } from './match-format'

const dash = '—'
const show = (input: number | null, unit = '') => input === null ? dash : `${input}${unit}`

export function TeamStatsPanel({ metadata, events }: { readonly metadata: MatchMetadata; readonly events: readonly MatchEvent[] }) {
  const home = teamStats(events, metadata.homeTeam.teamId)
  const away = teamStats(events, metadata.awayTeam.teamId)
  const hardest = (stats: typeof home) => stats.hardestPass === null ? dash : `${stats.hardestPass.difficulty}/100`
  const rows: readonly (readonly [string, string, string])[] = [
    ['Ball actions', String(home.ballActions), String(away.ballActions)],
    ['Passes completed', `${home.passesCompleted}/${home.passes} (${show(home.passAccuracyPct, '%')})`, `${away.passesCompleted}/${away.passes} (${show(away.passAccuracyPct, '%')})`],
    ['Avg pass distance', show(home.avgPassDistanceM, ' m'), show(away.avgPassDistanceM, ' m')],
    ['Avg pass difficulty', show(home.avgPassDifficulty, '/100'), show(away.avgPassDifficulty, '/100')],
    ['Hardest completed pass', hardest(home), hardest(away)],
    ['Carries (sprints)', `${home.carries} (${home.sprints})`, `${away.carries} (${away.sprints})`],
    ['Top carry speed', show(home.topCarrySpeedMps, ' m/s'), show(away.topCarrySpeedMps, ' m/s')],
    ['Shots (on target)', `${home.shots} (${home.shotsOnTarget})`, `${away.shots} (${away.shotsOnTarget})`],
    ['Top shot speed', show(home.topShotSpeedKph, ' km/h'), show(away.topShotSpeedKph, ' km/h')],
  ]
  return (
    <section className="mc-panel mc-team-stats" aria-labelledby="mc-stats-heading">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">Derived from declared coordinates and times</p>
          <h2 id="mc-stats-heading">Team metrics</h2>
        </div>
      </div>
      <table className="mc-stats-table" data-testid="team-stats">
        <thead><tr><th scope="col">Metric</th><th scope="col">{metadata.homeTeam.shortName}</th><th scope="col">{metadata.awayTeam.shortName}</th></tr></thead>
        <tbody>{rows.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{a}</td><td>{b}</td></tr>)}</tbody>
      </table>
      <p className="mc-note">
        Pass difficulty is a transparent heuristic (distance, forward progress, pressure, final-third entry), not a trained model. Speeds come from synthetic distance ÷ duration.
      </p>
    </section>
  )
}

export function RawFeed({ metadata, events }: { readonly metadata: MatchMetadata; readonly events: readonly MatchEvent[] }) {
  const latest = [...events].reverse().slice(0, 30)
  return (
    <section className="mc-panel mc-raw" aria-labelledby="mc-raw-heading">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">Ingest · schema 2.0 over Server-Sent Events</p>
          <h2 id="mc-raw-heading">Raw event feed</h2>
        </div>
        <span className="mc-tag">{events.length} events received</span>
      </div>
      {latest.length === 0
        ? <p className="mc-empty">No events received yet.</p>
        : <ol className="mc-raw-list" aria-label="Latest raw events, newest first">
          {latest.map(item => (
            <li key={item.eventId}>
              <span className="mc-time">{formatClock(item.matchClockMs)}</span>
              <span className="mc-raw-id">{shortEventId(item.eventId)}</span>
              <strong>{eventLabel(item.eventType)}</strong>
              <span>{item.teamId === metadata.homeTeam.teamId ? metadata.homeTeam.shortName : metadata.awayTeam.shortName}</span>
              <span>{item.description}</span>
            </li>
          ))}
        </ol>}
    </section>
  )
}
