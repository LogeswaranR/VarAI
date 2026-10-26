import { describe, expect, it } from 'vitest'
import { draftsOf, fieldProblem, planOverride } from './override-edits'
import { EDIT_LIMITS } from './narration-model'
import { englishText, fallbackNarration, tamilText } from './gate-test-data'
import { proposal } from './gate-test-data'

const originals = draftsOf(proposal().narrations)

describe('override planning', () => {
  it('copies the current text of both languages and leaves an untouched proposal with nothing to send', () => {
    expect(originals.en.headline).toBe(fallbackNarration('en').text.headline)
    const plan = planOverride(originals, originals)
    expect(plan).toEqual({ edits: {}, changed: [], problems: [] })
  })

  it('sends only the language that changed, with every field trimmed the way the server trims', () => {
    const plan = planOverride({ ...originals, ta: { ...tamilText, headline: `  ${tamilText.headline}  ` } }, originals)
    expect(plan.changed).toEqual(['ta'])
    expect(plan.edits).toEqual({ ta: tamilText })
    expect(plan.problems).toEqual([])
  })

  it('sends both languages when both changed', () => {
    const plan = planOverride({ en: englishText, ta: tamilText }, originals)
    expect(plan.changed).toEqual(['en', 'ta'])
    expect(Object.keys(plan.edits)).toEqual(['en', 'ta'])
  })

  it('does not count whitespace as a change', () => {
    const padded = { en: { ...originals.en, fan: `${originals.en.fan}   ` }, ta: originals.ta }
    expect(planOverride(padded, originals).changed).toEqual([])
  })

  it('applies the server limits per language: 100/260/420/300 characters for English and 170/440/700/500 for Tamil', () => {
    expect(EDIT_LIMITS.en).toEqual({ headline: 100, fan: 260, analyst: 420, why: 300 })
    expect(EDIT_LIMITS.ta).toEqual({ headline: 170, fan: 440, analyst: 700, why: 500 })
    expect(fieldProblem('en', 'headline', 'x'.repeat(100))).toBeNull()
    expect(fieldProblem('en', 'headline', 'x'.repeat(101))).toBe('1 over the limit of 100')
    expect(fieldProblem('ta', 'headline', 'x'.repeat(170))).toBeNull()
    expect(fieldProblem('ta', 'why', 'x'.repeat(520))).toBe('20 over the limit of 500')
    expect(fieldProblem('en', 'analyst', `${'x'.repeat(420)}   `)).toBeNull()
  })

  it('counts length in UTF-16 units like the server, so Tamil text near the limit is judged the same way', () => {
    const tamilHeadline = 'த'.repeat(170)
    expect(tamilHeadline.length).toBe(170)
    expect(fieldProblem('ta', 'headline', tamilHeadline)).toBeNull()
    expect(fieldProblem('ta', 'headline', `${tamilHeadline}த`)).toBe('1 over the limit of 170')
  })

  it('reports empty and over-long fields only for the languages that would be sent', () => {
    const plan = planOverride({ en: { ...originals.en, headline: ' ', why: 'x'.repeat(301) }, ta: { ...originals.ta, fan: '' } }, originals)
    expect(plan.problems).toEqual([
      { language: 'en', field: 'headline', message: 'cannot be empty' },
      { language: 'en', field: 'why', message: '1 over the limit of 300' },
      { language: 'ta', field: 'fan', message: 'cannot be empty' },
    ])
    const untouchedLongOriginal = { en: { ...originals.en, fan: 'y'.repeat(400) }, ta: originals.ta }
    expect(planOverride(untouchedLongOriginal, untouchedLongOriginal).problems).toEqual([])
  })
})
