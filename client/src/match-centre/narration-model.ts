export const narrationLanguages = ['en', 'ta'] as const
export type NarrationLanguage = typeof narrationLanguages[number]

export const narrationSources = ['AI', 'FALLBACK', 'OPERATOR'] as const
export type NarrationSource = typeof narrationSources[number]

export const fallbackReasons = [
  'DISABLED', 'NOT_CONFIGURED', 'UNAVAILABLE', 'TIMEOUT', 'INVALID_OUTPUT', 'VERIFIER_FAILED', 'BUDGET_EXHAUSTED', 'COOLDOWN', 'NOT_READY',
] as const
export type FallbackReason = typeof fallbackReasons[number]

export const verifierChecks = ['schema', 'markup', 'script', 'numbers', 'scoreboard', 'names', 'events', 'claims'] as const
export type VerifierCheck = typeof verifierChecks[number]

export const narrationFields = ['headline', 'fan', 'analyst', 'why'] as const
export type NarrationField = typeof narrationFields[number]

export interface NarrationText {
  readonly headline: string
  readonly fan: string
  readonly analyst: string
  readonly why: string
}

export type PerLanguage<T> = Readonly<Record<NarrationLanguage, T>>

/** What an audience may see: no token counts, no verifier internals. */
export interface PublicNarration {
  readonly source: NarrationSource
  readonly requestedLanguage: NarrationLanguage
  readonly language: NarrationLanguage
  readonly fallbackReason: FallbackReason | null
  readonly text: NarrationText
}

export interface VerificationFailure {
  readonly check: VerifierCheck
  readonly field: string
  readonly detail: string
}

export interface Verification {
  readonly passed: boolean
  readonly passedChecks: readonly VerifierCheck[]
  readonly failures: readonly VerificationFailure[]
}

export interface ModelUsage {
  readonly deployment: string
  readonly reportedModel: string | null
  readonly promptTokens: number
  readonly completionTokens: number
  readonly reasoningTokens: number
  readonly cachedPromptTokens: number
  readonly latencyMs: number
}

/** The operator desk's view of one narration: the public part plus the mechanical checks and model usage. */
export interface CueNarration extends PublicNarration {
  readonly cueId: string
  readonly verification: Verification | null
  readonly usage: ModelUsage | null
}

export type ApprovalDecision = 'APPROVED' | 'OVERRIDDEN'

export interface CueApproval {
  readonly approvalId: string
  readonly payloadHash: string
  readonly decision: ApprovalDecision
  readonly narrations: PerLanguage<PublicNarration>
}

export interface NarrationStatus {
  readonly enabled: boolean
  readonly deployment: string | null
  readonly callsUsed: number
  readonly callLimit: number
  readonly coolingDown: boolean
}

/** Mirrors the server's per-language size limits for operator edits (UTF-16 units, after trimming). */
export const EDIT_LIMITS: PerLanguage<Readonly<Record<NarrationField, number>>> = {
  en: { headline: 100, fan: 260, analyst: 420, why: 300 },
  ta: { headline: 170, fan: 440, analyst: 700, why: 500 },
}

export const NOTE_MAX_CHARS = 200

export const languageNames: PerLanguage<string> = { en: 'English', ta: 'Tamil' }
export const languageNativeNames: PerLanguage<string> = { en: 'English', ta: 'தமிழ்' }
