import type { OverlayCue } from './match-model'
import type { NarrationLanguage, NarrationSource } from './narration-model'
import { languageNames } from './narration-model'
import { languageNotice, provenanceLabels } from './narration-labels'
import type { Persona } from './profile'

export interface CuePart {
  readonly key: 'fan' | 'analyst' | 'why'
  readonly label: string | null
  readonly text: string
}

/** The words of a cue as one persona should see them in one language, with where those words came from. */
export interface CueView {
  readonly headline: string
  readonly parts: readonly CuePart[]
  /** The language of the text actually shown; English when a Tamil request fell back. */
  readonly lang: NarrationLanguage
  readonly provenance: string
  readonly source: NarrationSource
  readonly notice: string | null
}

const WHY = 'Why it matters'

/**
 * Fan: headline and fan text. Analyst: headline, analyst text and why. Studio: everything. A cue without an approved
 * narration for the language falls back to the cue's own deterministic fields and says so.
 */
export function selectNarration(cue: OverlayCue, persona: Persona, language: NarrationLanguage): CueView {
  const narration = cue.approval?.narrations[language]
  if (!narration) {
    const parts: readonly CuePart[] = persona === 'fan'
      ? [{ key: 'why', label: WHY, text: cue.whyItMatters }]
      : persona === 'analyst'
        ? [{ key: 'analyst', label: null, text: cue.detail }, { key: 'why', label: WHY, text: cue.whyItMatters }]
        : [{ key: 'fan', label: 'Fan', text: cue.detail }, { key: 'analyst', label: 'Analyst', text: cue.detail }, { key: 'why', label: WHY, text: cue.whyItMatters }]
    return {
      headline: cue.headline, parts, lang: 'en', provenance: provenanceLabels.FALLBACK, source: 'FALLBACK',
      notice: language === 'en' ? null : `${languageNames[language]} unavailable - showing English (reason: no approved narration was attached)`,
    }
  }
  const { text } = narration
  const parts: readonly CuePart[] = persona === 'fan'
    ? [{ key: 'fan', label: null, text: text.fan }]
    : persona === 'analyst'
      ? [{ key: 'analyst', label: null, text: text.analyst }, { key: 'why', label: WHY, text: text.why }]
      : [{ key: 'fan', label: 'Fan', text: text.fan }, { key: 'analyst', label: 'Analyst', text: text.analyst }, { key: 'why', label: WHY, text: text.why }]
  return {
    headline: text.headline, parts, lang: narration.language, provenance: provenanceLabels[narration.source],
    source: narration.source, notice: languageNotice(narration),
  }
}
