import { EDIT_LIMITS, narrationFields, narrationLanguages } from './narration-model'
import type { CueNarration, NarrationField, NarrationLanguage, NarrationText, PerLanguage } from './narration-model'

export type Drafts = PerLanguage<NarrationText>

export interface FieldProblem {
  readonly language: NarrationLanguage
  readonly field: NarrationField
  readonly message: string
}

export interface OverridePlan {
  /** Only the languages whose text actually changed, trimmed the way the server will trim them. */
  readonly edits: Readonly<Partial<Record<NarrationLanguage, NarrationText>>>
  readonly changed: readonly NarrationLanguage[]
  readonly problems: readonly FieldProblem[]
}

export const draftsOf = (narrations: PerLanguage<CueNarration>): Drafts => ({
  en: { ...narrations.en.text },
  ta: { ...narrations.ta.text },
})

export function fieldProblem(language: NarrationLanguage, field: NarrationField, value: string): string | null {
  const length = value.trim().length
  const limit = EDIT_LIMITS[language][field]
  if (length === 0) return 'cannot be empty'
  if (length > limit) return `${length - limit} over the limit of ${limit}`
  return null
}

const trimmed = (text: NarrationText): NarrationText => ({
  headline: text.headline.trim(), fan: text.fan.trim(), analyst: text.analyst.trim(), why: text.why.trim(),
})

/** Works out what an override would send: untouched languages are left out so the server keeps their approved text. */
export function planOverride(drafts: Drafts, originals: Drafts): OverridePlan {
  const edits: Partial<Record<NarrationLanguage, NarrationText>> = {}
  const changed: NarrationLanguage[] = []
  const problems: FieldProblem[] = []
  for (const language of narrationLanguages) {
    const draft = trimmed(drafts[language])
    const original = trimmed(originals[language])
    if (narrationFields.every(field => draft[field] === original[field])) continue
    changed.push(language)
    edits[language] = draft
    for (const field of narrationFields) {
      const message = fieldProblem(language, field, draft[field])
      if (message) problems.push({ language, field, message })
    }
  }
  return { edits, changed, problems }
}
