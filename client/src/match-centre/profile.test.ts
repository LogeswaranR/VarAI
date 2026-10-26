import { describe, expect, it } from 'vitest'
import { defaultProfile, languageOf, loadProfile, parseProfile, PROFILE_STORAGE_KEY, resolveProfile, saveProfile } from './profile'
import { metadata } from './match-test-data'

describe('audience profile language', () => {
  it('treats a missing language as English without inventing a field', () => {
    expect(languageOf(parseProfile(null))).toBe('en')
    expect(parseProfile(JSON.stringify({ persona: 'fan', clubId: null, playerId: null }))).toEqual(defaultProfile)
    expect(languageOf(parseProfile(JSON.stringify({ persona: 'fan', clubId: null, playerId: null })))).toBe('en')
  })

  it('repairs a stored language that is not a known one to English', () => {
    for (const hostile of ['fr', 'EN', 'ta ', '', 7, null, true, ['ta'], { value: 'ta' }, '<script>']) {
      const profile = parseProfile(JSON.stringify({ persona: 'studio', clubId: 'COMETS', playerId: 'COMETS-07', language: hostile }))
      expect(profile).toEqual({ persona: 'studio', clubId: 'COMETS', playerId: 'COMETS-07', language: 'en' })
      expect(languageOf(profile)).toBe('en')
    }
  })

  it('keeps a valid language choice, including an explicit English one', () => {
    expect(parseProfile(JSON.stringify({ persona: 'fan', clubId: null, playerId: null, language: 'ta' }))).toEqual({ ...defaultProfile, language: 'ta' })
    expect(parseProfile(JSON.stringify({ language: 'en' }))).toEqual({ ...defaultProfile, language: 'en' })
    expect(languageOf({ ...defaultProfile, language: 'ta' })).toBe('ta')
  })

  it('stays hostile-input safe: garbage, wrong shapes and prototype tricks never produce a language', () => {
    expect(parseProfile('{"language":"ta"')).toEqual(defaultProfile)
    expect(parseProfile('["ta"]')).toEqual(defaultProfile)
    expect(parseProfile('"ta"')).toEqual(defaultProfile)
    expect(parseProfile('{"__proto__":{"language":"ta"}}')).toEqual(defaultProfile)
    expect(parseProfile('{"constructor":{"language":"ta"}}')).toEqual(defaultProfile)
    expect(({} as { language?: string }).language).toBeUndefined()
  })

  it('carries the language through repair against the rosters, and adds nothing when there is none', () => {
    expect(resolveProfile({ ...defaultProfile, language: 'ta' }, metadata)).toEqual({ persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09', language: 'ta' })
    expect(resolveProfile(defaultProfile, metadata)).toEqual({ persona: 'fan', clubId: 'COMETS', playerId: 'COMETS-09' })
  })

  it('round-trips through the unchanged storage key and survives unavailable storage', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    expect(PROFILE_STORAGE_KEY).toBe('varai.audience-profile.v1')
    saveProfile(storage, { persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06', language: 'ta' })
    expect(JSON.parse(values.get(PROFILE_STORAGE_KEY)!)).toEqual({ persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06', language: 'ta' })
    expect(loadProfile(storage)).toEqual({ persona: 'analyst', clubId: 'LANTERNS', playerId: 'LANTERNS-06', language: 'ta' })
    expect(languageOf(loadProfile(null))).toBe('en')
  })

  it('reads a profile saved before the language existed', () => {
    const legacy = JSON.stringify({ persona: 'studio', clubId: 'COMETS', playerId: 'COMETS-07' })
    expect(parseProfile(legacy)).toEqual({ persona: 'studio', clubId: 'COMETS', playerId: 'COMETS-07' })
  })
})
