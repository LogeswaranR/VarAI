import type { MatchMetadata } from './match-model'
import { narrationLanguages } from './narration-model'
import type { NarrationLanguage } from './narration-model'

export type Persona = 'fan' | 'analyst' | 'studio'

export interface AudienceProfile {
  readonly persona: Persona
  readonly clubId: string | null
  readonly playerId: string | null
  /** Narration language for operator-gated mode; absent means English. */
  readonly language?: NarrationLanguage
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export const PROFILE_STORAGE_KEY = 'varai.audience-profile.v1'
export const personas: readonly { readonly value: Persona; readonly label: string; readonly hint: string }[] = [
  { value: 'fan', label: 'Fan', hint: 'Stories, your club and your player' },
  { value: 'analyst', label: 'Analyst', hint: 'Metrics, momentum and evidence' },
  { value: 'studio', label: 'Studio', hint: 'On-air cue queue and overlay feed' },
]

export const defaultProfile: AudienceProfile = { persona: 'fan', clubId: null, playerId: null }

function isPersona(value: unknown): value is Persona {
  return value === 'fan' || value === 'analyst' || value === 'studio'
}

function isLanguage(value: unknown): value is NarrationLanguage {
  return typeof value === 'string' && (narrationLanguages as readonly string[]).includes(value)
}

export const languageOf = (profile: AudienceProfile): NarrationLanguage => profile.language ?? 'en'

const idOrNull = (value: unknown) => typeof value === 'string' && /^[A-Z0-9-]{1,40}$/.test(value) ? value : null

/** Stored text is untrusted: anything unexpected falls back to the default instead of being rendered or trusted. */
export function parseProfile(raw: string | null): AudienceProfile {
  if (raw === null) return defaultProfile
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return defaultProfile
    const record = value as Record<string, unknown>
    const stored = Object.prototype.hasOwnProperty.call(record, 'language')
    return {
      persona: isPersona(record.persona) ? record.persona : defaultProfile.persona,
      clubId: idOrNull(record.clubId),
      playerId: idOrNull(record.playerId),
      // Absent stays absent (English); a stored value that is not a known language is repaired to English.
      ...(stored ? { language: isLanguage(record.language) ? record.language : 'en' } : {}),
    }
  } catch {
    return defaultProfile
  }
}

/** Fills in or repairs a stored profile against the announced teams and rosters. */
export function resolveProfile(profile: AudienceProfile, metadata: MatchMetadata): AudienceProfile {
  const teams = [metadata.homeTeam, metadata.awayTeam]
  const club = teams.find(team => team.teamId === profile.clubId) ?? metadata.homeTeam
  const roster = teams.flatMap(team => team.players)
  const player = roster.find(item => item.playerId === profile.playerId) ??
    club.players.find(item => item.role === 'ST') ?? club.players[0]
  return {
    persona: profile.persona, clubId: club.teamId, playerId: player.playerId,
    ...(profile.language ? { language: profile.language } : {}),
  }
}

export function loadProfile(storage: StorageLike | null): AudienceProfile {
  try {
    return parseProfile(storage?.getItem(PROFILE_STORAGE_KEY) ?? null)
  } catch {
    return defaultProfile
  }
}

export function saveProfile(storage: StorageLike | null, profile: AudienceProfile) {
  try {
    storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Storage can be unavailable or full; the choice still applies for this visit.
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
