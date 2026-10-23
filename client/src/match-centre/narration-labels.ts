import type { FallbackReason, NarrationField, NarrationSource, PublicNarration, Verification, VerifierCheck } from './narration-model'
import { languageNames } from './narration-model'

export const MECHANICAL_CHECKS_NOTE =
  'Mechanical checks only (numbers, scores, names, event words, script). They do not prove the text is true.'

export const fieldLabels: Readonly<Record<NarrationField, string>> = {
  headline: 'Headline', fan: 'Fan', analyst: 'Analyst', why: 'Why it matters',
}

const reasonLabels: Readonly<Record<FallbackReason, string>> = {
  DISABLED: 'AI narration is off',
  NOT_CONFIGURED: 'the AI model is not configured',
  UNAVAILABLE: 'the AI model was unavailable',
  TIMEOUT: 'the AI model timed out',
  INVALID_OUTPUT: 'the AI output was malformed',
  VERIFIER_FAILED: 'the AI text failed the mechanical checks',
  BUDGET_EXHAUSTED: 'the model-call budget is used up',
  COOLDOWN: 'AI narration is paused after repeated failures',
  NOT_READY: 'narration was not ready in time',
}

export const reasonLabel = (reason: FallbackReason | null) => reason === null ? 'no reason given' : reasonLabels[reason]

/** What an audience sees next to a cue: where its words came from. Every gated cue was approved by a person. */
export const provenanceLabels: Readonly<Record<NarrationSource, string>> = {
  AI: 'AI-written - operator-approved',
  OPERATOR: 'Operator-edited',
  FALLBACK: 'Deterministic text',
}

/** What the desk shows: the source of the words before any approval. */
export const deskSourceLabels: Readonly<Record<NarrationSource, string>> = {
  AI: 'AI-written',
  OPERATOR: 'Operator-edited',
  FALLBACK: 'Deterministic fallback',
}

/** Set when the delivered language is not the requested one, which only happens for a fallback to the English rule text. */
export function languageNotice(narration: Pick<PublicNarration, 'requestedLanguage' | 'language' | 'fallbackReason'>): string | null {
  if (narration.language === narration.requestedLanguage) return null
  return `${languageNames[narration.requestedLanguage]} unavailable - showing ${languageNames[narration.language]} (reason: ${reasonLabel(narration.fallbackReason)})`
}

export type VerificationSummary =
  | { readonly kind: 'none'; readonly text: string }
  | { readonly kind: 'passed'; readonly text: string }
  | { readonly kind: 'flagged'; readonly text: string; readonly checks: readonly VerifierCheck[] }

export function verificationSummary(verification: Verification | null): VerificationSummary {
  if (verification === null) return { kind: 'none', text: 'No mechanical checks ran' }
  if (verification.passed) return { kind: 'passed', text: 'Mechanical checks passed' }
  const checks = [...new Set(verification.failures.map(failure => failure.check))]
  return { kind: 'flagged', text: `Checks flagged: ${checks.join(', ')}`, checks }
}
