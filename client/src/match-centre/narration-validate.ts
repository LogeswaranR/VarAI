import { fallbackReasons, narrationLanguages, narrationSources, verifierChecks } from './narration-model'
import type {
  CueApproval, CueNarration, ModelUsage, NarrationLanguage, NarrationStatus, NarrationText, PerLanguage, PublicNarration,
  Verification, VerificationFailure,
} from './narration-model'
import { isBool, isBounded, isNonNegativeInt, isOneOf, isRec, isText, matches, orNull } from './validate-primitives'

const MAX_TEXT = 2_000
const MAX_NAME = 200
const MAX_DETAIL = 500
const MAX_FAILURES = 100

export const APPROVAL_ID = /^APR-\d{3,6}$/
export const PAYLOAD_HASH = /^[0-9a-f]{64}$/

const isSource = isOneOf(narrationSources)
const isReason = isOneOf(fallbackReasons)
const isCheck = isOneOf(verifierChecks)
const isLanguage = isOneOf(narrationLanguages)
const isApprovalId = matches(APPROVAL_ID)
const isPayloadHash = matches(PAYLOAD_HASH)

export function parseNarrationText(value: unknown): NarrationText | null {
  if (!isRec(value)) return null
  const { headline, fan, analyst, why } = value
  const text = isText(MAX_TEXT)
  return text(headline) && text(fan) && text(analyst) && text(why) ? { headline, fan, analyst, why } : null
}

/**
 * A fallback is always the deterministic English text and carries its reason; any other source is delivered in the
 * requested language. Anything else is a contradictory message and is rejected rather than labelled optimistically.
 */
export function parsePublicNarration(value: unknown, language: NarrationLanguage): PublicNarration | null {
  if (!isRec(value)) return null
  const text = parseNarrationText(value.text)
  const { source, requestedLanguage, language: delivered, fallbackReason } = value
  if (!text || !isSource(source) || requestedLanguage !== language || !isLanguage(delivered)) return null
  if (source === 'FALLBACK') {
    return delivered === 'en' && isReason(fallbackReason)
      ? { source, requestedLanguage: language, language: 'en', fallbackReason, text }
      : null
  }
  return delivered === language && fallbackReason === null
    ? { source, requestedLanguage: language, language, fallbackReason: null, text }
    : null
}

function parseVerification(value: unknown): Verification | null {
  if (!isRec(value) || !isBool(value.passed)) return null
  const { passed, passedChecks, failures: rows } = value
  if (!Array.isArray(passedChecks) || !Array.isArray(rows) || passedChecks.length > verifierChecks.length || rows.length > MAX_FAILURES) {
    return null
  }
  const checks = passedChecks.filter(isCheck)
  if (checks.length !== passedChecks.length) return null
  const failures: VerificationFailure[] = []
  for (const row of rows) {
    if (!isRec(row) || !isCheck(row.check) || !isBounded(MAX_NAME)(row.field) || !isBounded(MAX_DETAIL)(row.detail)) return null
    failures.push({ check: row.check, field: row.field, detail: row.detail })
  }
  return passed === (failures.length === 0) ? { passed, passedChecks: checks, failures } : null
}

function parseUsage(value: unknown): ModelUsage | null {
  if (!isRec(value)) return null
  const { deployment, reportedModel, promptTokens, completionTokens, reasoningTokens, cachedPromptTokens, latencyMs } = value
  return isBounded(MAX_NAME)(deployment) && orNull(isBounded(MAX_NAME))(reportedModel) && isNonNegativeInt(promptTokens) &&
    isNonNegativeInt(completionTokens) && isNonNegativeInt(reasoningTokens) && isNonNegativeInt(cachedPromptTokens) &&
    isNonNegativeInt(latencyMs)
    ? { deployment, reportedModel, promptTokens, completionTokens, reasoningTokens, cachedPromptTokens, latencyMs }
    : null
}

export function parseCueNarration(value: unknown, language: NarrationLanguage): CueNarration | null {
  const base = parsePublicNarration(value, language)
  if (!base || !isRec(value) || !isText(MAX_NAME)(value.cueId)) return null
  const verification = value.verification === null ? null : parseVerification(value.verification)
  const usage = value.usage === null ? null : parseUsage(value.usage)
  if ((verification === null && value.verification !== null) || (usage === null && value.usage !== null)) return null
  return { ...base, cueId: value.cueId, verification, usage }
}

export function parsePerLanguage<T>(
  value: unknown, parse: (item: unknown, language: NarrationLanguage) => T | null,
): PerLanguage<T> | null {
  if (!isRec(value)) return null
  const en = parse(value.en, 'en')
  const ta = parse(value.ta, 'ta')
  return en !== null && ta !== null ? { en, ta } : null
}

export function parseApproval(value: unknown): CueApproval | null {
  if (!isRec(value)) return null
  const { approvalId, payloadHash, decision } = value
  const narrations = parsePerLanguage(value.narrations, parsePublicNarration)
  return isApprovalId(approvalId) && isPayloadHash(payloadHash) && (decision === 'APPROVED' || decision === 'OVERRIDDEN') && narrations
    ? { approvalId, payloadHash, decision, narrations }
    : null
}

export function parseNarrationStatus(value: unknown): NarrationStatus | null {
  if (!isRec(value)) return null
  const { enabled, deployment, callsUsed, callLimit, coolingDown } = value
  return isBool(enabled) && orNull(isBounded(MAX_NAME))(deployment) && isNonNegativeInt(callsUsed) && isNonNegativeInt(callLimit) &&
    isBool(coolingDown)
    ? { enabled, deployment, callsUsed, callLimit, coolingDown }
    : null
}
