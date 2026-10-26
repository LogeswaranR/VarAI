import { formatClock, playerOf } from './match-model'
import type { MatchEvent, MatchMetadata, OverlayCue } from './match-model'
import { playerStats, playerTimeline } from './match-selectors'

const dash = '—'
const value = (input: number | null, unit = '') => input === null ? dash : `${input}${unit}`

export function PlayerFocus({ metadata, events, cues, playerId }: {
  readonly metadata: MatchMetadata
  readonly events: readonly MatchEvent[]
  readonly cues: readonly OverlayCue[]
  readonly playerId: string | null
}) {
  const player = playerOf(metadata, playerId)
  if (!player) return null
  const team = [metadata.homeTeam, metadata.awayTeam].find(item => item.players.some(member => member.playerId === player.playerId))
  const stats = playerStats(events, player.playerId)
  const timeline = playerTimeline(events, player.playerId, 6)
  const tagged = cues.filter(cue => cue.playerIds.includes(player.playerId)).length
  return (
    <section className={`mc-panel mc-player${team?.teamId === metadata.awayTeam.teamId ? ' is-away' : ''}`} aria-labelledby="mc-player-heading">
      <div className="mc-panel-heading">
        <svg className="mc-player-shirt" viewBox="0 0 100 105" aria-hidden="true">
          <path d="M30 10 10 24 2 48 22 56 27 43 27 96 73 96 73 43 78 56 98 48 90 24 70 10 60 17 40 17Z" fill="currentColor" />
          <path d="M40 17Q50 34 60 17M32 38V88M68 38V88" fill="none" stroke="#08161f" strokeWidth="3" opacity="0.25" />
          <text x="50" y="68" textAnchor="middle" fill="#08161f" fontSize="32" fontWeight="800">{player.shirtNumber}</text>
        </svg>
        <div>
          <p className="mc-kicker">Player spotlight</p>
          <h2 id="mc-player-heading">#{player.shirtNumber} {player.name}</h2>
          <span className="mc-tag">{team?.shortName} · {player.role}</span>
        </div>
      </div>
      {stats.involvements === 0
        ? <p className="mc-empty">Waiting for {player.name}&apos;s first involvement.</p>
        : <>
          <dl className="mc-player-numbers" data-testid="player-stats">
            <div><dt>Involvements</dt><dd>{stats.involvements}</dd></div>
            <div><dt>Passes</dt><dd>{stats.passesCompleted}/{stats.passes}</dd></div>
            <div><dt>Shots</dt><dd>{stats.shots}</dd></div>
          </dl>
          <details className="mc-disclosure">
            <summary>Player stats &amp; activity</summary>
          <dl className="mc-facts">
            <div><dt>Avg pass difficulty</dt><dd>{value(stats.avgPassDifficulty, '/100')}</dd></div>
            <div><dt>Carries</dt><dd>{stats.carries} · {stats.carryDistanceM} m</dd></div>
            <div><dt>Top carry speed</dt><dd>{value(stats.topCarrySpeedMps, ' m/s')}</dd></div>
            <div><dt>Shots (on target)</dt><dd>{stats.shots} ({stats.shotsOnTarget})</dd></div>
            <div><dt>Top shot speed</dt><dd>{value(stats.topShotSpeedKph, ' km/h')}</dd></div>
            <div><dt>On-screen cues</dt><dd>{tagged}</dd></div>
          </dl>
          <ol className="mc-timeline" aria-label={`Latest involvements for ${player.name}`}>
            {timeline.map(item => (
              <li key={item.eventId}><span className="mc-time">{formatClock(item.matchClockMs)}</span> {item.description}</li>
            ))}
          </ol>
          </details>
        </>}
      <p className="mc-note">Fictional player · tagged events only</p>
    </section>
  )
}
