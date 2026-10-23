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
    <section className="mc-panel mc-player" aria-labelledby="mc-player-heading">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">Following · synthetic player</p>
          <h2 id="mc-player-heading">#{player.shirtNumber} {player.name}</h2>
        </div>
        <span className="mc-tag">{team?.shortName} · {player.role}</span>
      </div>
      {stats.involvements === 0
        ? <p className="mc-empty">No involvement yet. This panel fills in as {player.name} appears in the match events.</p>
        : <>
          <dl className="mc-facts" data-testid="player-stats">
            <div><dt>Involvements</dt><dd>{stats.involvements}</dd></div>
            <div><dt>Passes</dt><dd>{stats.passesCompleted}/{stats.passes}</dd></div>
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
        </>}
      <p className="mc-note">Counts include only events tagged to this player ID. Player names and IDs are fictional.</p>
    </section>
  )
}
