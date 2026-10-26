import { describe, expect, it } from 'vitest'
import { languageNotice, provenanceLabels, reasonLabel, verificationSummary } from './narration-labels'
import { selectNarration } from './narration-select'
import { fallbackReasons } from './narration-model'
import type { NarrationLanguage } from './narration-model'
import type { Persona } from './profile'
import {
  aiNarration, approvedCue, englishText, fallbackNarration, flaggedVerification, goalCue, operatorNarration, passedVerification, publicOf, tamilText,
} from './gate-test-data'

const personas: readonly Persona[] = ['fan', 'analyst', 'studio']
const languages: readonly NarrationLanguage[] = ['en', 'ta']
const partKeys = (persona: Persona) => persona === 'fan' ? ['fan'] : persona === 'analyst' ? ['analyst', 'why'] : ['fan', 'analyst', 'why']

describe('which words a persona sees in which language', () => {
  const ai = approvedCue({}, aiNarration('en'), aiNarration('ta'))
  const fallback = approvedCue({}, fallbackNarration('en'), fallbackNarration('ta'))
  const mixed = approvedCue({}, aiNarration('en'), fallbackNarration('ta', 'TIMEOUT'))
  const edited = approvedCue({}, fallbackNarration('en'), operatorNarration('ta', tamilText))

  it.each(personas.flatMap(persona => languages.map(language => [persona, language] as const)))(
    'shows approved AI text in the chosen language to %s in %s', (persona, language) => {
      const view = selectNarration(ai, persona, language)
      const source = language === 'ta' ? tamilText : englishText
      expect(view.headline).toBe(source.headline)
      expect(view.parts.map(part => part.key)).toEqual(partKeys(persona))
      expect(view.parts.map(part => part.text)).toEqual(partKeys(persona).map(key => source[key as 'fan' | 'analyst' | 'why']))
      expect(view).toMatchObject({ lang: language, source: 'AI', provenance: 'AI-written - operator-approved', notice: null })
    })

  it('labels the parts a persona reads: none for fan, a why label for the analyst, all three for the studio', () => {
    expect(selectNarration(ai, 'fan', 'en').parts.map(part => part.label)).toEqual([null])
    expect(selectNarration(ai, 'analyst', 'en').parts.map(part => part.label)).toEqual([null, 'Why it matters'])
    expect(selectNarration(ai, 'studio', 'en').parts.map(part => part.label)).toEqual(['Fan', 'Analyst', 'Why it matters'])
  })

  it.each(personas)('says plainly that Tamil fell back to English for %s, and shows the English words in an English-language element', persona => {
    const view = selectNarration(fallback, persona, 'ta')
    expect(view.headline).toBe(goalCue().headline)
    expect(view).toMatchObject({
      lang: 'en', source: 'FALLBACK', provenance: 'Deterministic text',
      notice: 'Tamil unavailable - showing English (reason: AI narration is off)',
    })
  })

  it('has no language notice when English was asked for and the fallback is English anyway', () => {
    expect(selectNarration(fallback, 'fan', 'en')).toMatchObject({ lang: 'en', source: 'FALLBACK', provenance: 'Deterministic text', notice: null })
  })

  it('shows each language with its own provenance when the sources differ', () => {
    expect(selectNarration(mixed, 'fan', 'en')).toMatchObject({ lang: 'en', source: 'AI', notice: null })
    expect(selectNarration(mixed, 'fan', 'ta')).toMatchObject({
      lang: 'en', source: 'FALLBACK', notice: 'Tamil unavailable - showing English (reason: the AI model timed out)',
    })
    expect(selectNarration(edited, 'studio', 'ta')).toMatchObject({ lang: 'ta', source: 'OPERATOR', provenance: 'Operator-edited', notice: null })
    expect(selectNarration(edited, 'studio', 'ta').headline).toBe(tamilText.headline)
    expect(selectNarration(edited, 'studio', 'en')).toMatchObject({ source: 'FALLBACK', provenance: 'Deterministic text' })
  })

  it('still calls AI text that rode along in an overridden approval AI-written and operator-approved', () => {
    const overridden = approvedCue({}, aiNarration('en'), operatorNarration('ta', tamilText), { decision: 'OVERRIDDEN' })
    expect(selectNarration(overridden, 'fan', 'en')).toMatchObject({ source: 'AI', provenance: 'AI-written - operator-approved' })
  })

  it.each(personas)('falls back to the cue\'s own deterministic fields for %s when no approved narration is attached', persona => {
    const bare = goalCue()
    const english = selectNarration(bare, persona, 'en')
    expect(english).toMatchObject({ headline: bare.headline, lang: 'en', source: 'FALLBACK', provenance: 'Deterministic text', notice: null })
    expect(english.parts.map(part => part.text)).toEqual(
      persona === 'fan' ? [bare.whyItMatters] : persona === 'analyst' ? [bare.detail, bare.whyItMatters] : [bare.detail, bare.detail, bare.whyItMatters])
    expect(selectNarration(bare, persona, 'ta')).toMatchObject({
      lang: 'en', notice: 'Tamil unavailable - showing English (reason: no approved narration was attached)',
    })
  })
})

describe('labels shared by the desk and the program', () => {
  it('explains every fallback reason in words and the language gap only when there is one', () => {
    for (const reason of fallbackReasons) expect(reasonLabel(reason)).toMatch(/\S/)
    expect(reasonLabel('DISABLED')).toBe('AI narration is off')
    expect(reasonLabel(null)).toBe('no reason given')
    expect(languageNotice(publicOf(fallbackNarration('ta', 'BUDGET_EXHAUSTED')))).toBe('Tamil unavailable - showing English (reason: the model-call budget is used up)')
    expect(languageNotice(publicOf(fallbackNarration('en')))).toBeNull()
    expect(languageNotice(publicOf(aiNarration('ta')))).toBeNull()
    expect(provenanceLabels).toEqual({ AI: 'AI-written - operator-approved', OPERATOR: 'Operator-edited', FALLBACK: 'Deterministic text' })
  })

  it('summarises the mechanical checks in the words the desk shows', () => {
    expect(verificationSummary(null)).toEqual({ kind: 'none', text: 'No mechanical checks ran' })
    expect(verificationSummary(passedVerification)).toEqual({ kind: 'passed', text: 'Mechanical checks passed' })
    expect(verificationSummary(flaggedVerification)).toEqual({ kind: 'flagged', text: 'Checks flagged: numbers, names', checks: ['numbers', 'names'] })
    const repeated = { ...flaggedVerification, failures: [...flaggedVerification.failures, { check: 'numbers' as const, field: 'why', detail: 'again' }] }
    expect(verificationSummary(repeated).text).toBe('Checks flagged: numbers, names')
  })
})
