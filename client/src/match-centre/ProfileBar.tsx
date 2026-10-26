import { useId } from 'react'
import { languageOf, personas } from './profile'
import type { AudienceProfile, Persona } from './profile'
import { playerOf, teamOf } from './match-model'
import type { MatchMetadata } from './match-model'
import { languageNativeNames, narrationLanguages } from './narration-model'
import type { NarrationLanguage } from './narration-model'

export function ProfileBar({ metadata, profile, languageEnabled, onPersona, onClub, onPlayer, onLanguage }: {
  readonly metadata: MatchMetadata | null
  readonly profile: AudienceProfile
  /** Tamil narration exists only in operator-gated mode, so the language choice is switched off in Preview. */
  readonly languageEnabled: boolean
  readonly onPersona: (persona: Persona) => void
  readonly onClub: (clubId: string) => void
  readonly onPlayer: (playerId: string) => void
  readonly onLanguage: (language: NarrationLanguage) => void
}) {
  const teams = metadata ? [metadata.homeTeam, metadata.awayTeam] : []
  const language = languageOf(profile)
  const hintId = useId()
  const club = metadata ? teamOf(metadata, profile.clubId) : null
  const player = metadata ? playerOf(metadata, profile.playerId) : null
  return (
    <section className="mc-profile" aria-label="Make it yours">
        <fieldset className="mc-persona">
          <legend className="mc-sr-only">View</legend>
          {personas.map(item => (
            <label key={item.value} className={profile.persona === item.value ? 'is-selected' : undefined}>
              <input type="radio" name="mc-persona" value={item.value} checked={profile.persona === item.value}
                onChange={() => onPersona(item.value)} />
              <span><strong>{item.label}</strong><small className="mc-sr-only">{item.hint}</small></span>
            </label>
          ))}
        </fieldset>
      <details className="mc-preferences">
        <summary>Personalise <span>{club?.shortName}{player ? ` · #${player.shirtNumber} ${player.name}` : ''}</span></summary>
        <div className="mc-profile-grid">
        <label className="mc-field">Favourite club
          <select value={profile.clubId ?? ''} disabled={!metadata} onChange={event => onClub(event.target.value)}>
            {!metadata && <option value="">Loading match…</option>}
            {teams.map(team => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
          </select>
        </label>
        <label className="mc-field">Follow a player
          <select value={profile.playerId ?? ''} disabled={!metadata} onChange={event => onPlayer(event.target.value)}>
            {!metadata && <option value="">Loading match…</option>}
            {teams.map(team => (
              <optgroup key={team.teamId} label={team.name}>
                {team.players.map(player => (
                  <option key={player.playerId} value={player.playerId}>#{player.shirtNumber} {player.name} · {player.role}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      <fieldset className="mc-language" aria-describedby={languageEnabled ? undefined : hintId}>
        <legend>Language</legend>
        <div className="mc-segments">
          {narrationLanguages.map(code => (
            <label key={code} className={language === code ? 'is-selected' : undefined}>
              <input type="radio" name="mc-language" value={code} checked={language === code} disabled={!languageEnabled}
                onChange={() => onLanguage(code)} />
              <span lang={code}>{languageNativeNames[code]}</span>
            </label>
          ))}
        </div>
        {!languageEnabled && <small id={hintId} className="mc-hint">Tamil narration is available in operator-gated mode</small>}
      </fieldset>
        </div>
        <p className="mc-note">Saved on this device only.</p>
      </details>
    </section>
  )
}
