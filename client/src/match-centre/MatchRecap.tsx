import { useMemo, useState } from 'react'
import { downloadJson } from './match-format'
import { formatClock } from './match-model'
import type { MatchMetadata } from './match-model'
import { buildMatchRecap, hasHalfTime } from './match-recap'
import type { RecapCheckpoint } from './match-recap'
import type { MatchState } from './match-state'
import type { AudienceProfile } from './profile'

export function MatchRecap({ metadata, state, profile, onHighlight }: {
  readonly metadata: MatchMetadata
  readonly state: MatchState
  readonly profile: AudienceProfile
  readonly onHighlight: (ids: readonly string[]) => void
}) {
  const [checkpoint, setCheckpoint] = useState<RecapCheckpoint>('latest')
  const { events, clockMs, status, complete } = state
  const recap = useMemo(() => buildMatchRecap(metadata, { events, clockMs, status, complete }, profile, checkpoint),
    [metadata, events, clockMs, status, complete, profile, checkpoint])
  return (
    <section className="mc-panel mc-recap" aria-labelledby="mc-recap-heading" lang="en" data-testid="match-recap">
      <div className="mc-panel-heading">
        <div>
          <p className="mc-kicker">The story, not just the score</p>
          <h2 id="mc-recap-heading">{recap?.headline ?? 'Automatic match recap'}</h2>
        </div>
        <button type="button" disabled={!recap} onClick={() => {
          if (recap) downloadJson(`${metadata.matchId.toLowerCase()}-${recap.stage.toLowerCase()}-recap.json`, recap)
        }}>Download recap JSON</button>
      </div>
      <p className="mc-note">Automatically assembled from received synthetic events. Deterministic English, not AI-written or operator-approved.
        This viewer summary never enters the on-air feed.{profile.language === 'ta' && ' Tamil recap is not available; showing English.'}</p>
      {hasHalfTime(events) && <div className="mc-highlights" role="group" aria-label="Recap checkpoint">
        <button type="button" aria-pressed={checkpoint === 'latest'} onClick={() => setCheckpoint('latest')}>Latest recap</button>
        <button type="button" aria-pressed={checkpoint === 'half-time'} onClick={() => setCheckpoint('half-time')}>Half-time snapshot</button>
      </div>}
      {recap
        ? <>
          {(status === 'error' || status === 'stopped' || status === 'reconnecting') &&
            <p className="mc-note">Incomplete or interrupted stream: this is only a snapshot of events received through {formatClock(recap.throughMs)}, not a final result.</p>}
          {status === 'complete' && recap.stage === 'LIVE' &&
            <p className="mc-error" role="alert">The completion marker does not match the received final-period event, event count or score. A full-time recap cannot be confirmed.</p>}
          <div data-testid="recap-story" className="mc-recap-story">
            <p className="mc-recap-lead">{recap.story[0]?.text}</p>
            <details className="mc-disclosure" open={profile.persona === 'analyst'}>
              <summary>Full story ({Math.max(0, recap.story.length - 1)} more)</summary>
              {recap.story.slice(1).map(claim => <p key={claim.id} className="mc-detail">{claim.text}</p>)}
            </details>
          </div>
          <details>
            <summary>Turning points and recap evidence</summary>
            {recap.turningPoints.length > 0
              ? <ol>{recap.turningPoints.map(claim => <li key={claim.id}>{claim.text}</li>)}</ol>
              : <p className="mc-note">No goal or overturned-goal event received at this checkpoint.</p>}
            <p className="mc-note">All source IDs are included in the download. Buttons show up to the last 8 source events for each statement on the pitch.</p>
            <div className="mc-sources">
              {[...recap.story, ...recap.turningPoints].filter(claim => claim.sourceEventIds.length > 0).map(claim =>
                <button key={claim.id} type="button" onClick={() => onHighlight(claim.sourceEventIds.slice(-8))}
                  aria-label={`Show recap evidence: ${claim.text}`}>{claim.id} · {claim.sourceEventIds.length} sources</button>)}
            </div>
          </details>
        </>
        : <p className="mc-empty">Kick off for a live summary, or use Full-time recap in Preview to catch up through the entire match.
          Halftime is saved as a separate snapshot; changing your audience, club or player reshapes the story.</p>}
    </section>
  )
}
