import { MATCH_ID, SESSION_ID_PATTERN } from './match-model'
import { isCue } from './match-stream'
import type { DecidedState, DecisionMessage, DecisionResult, DeskMessage, ProposalView, SessionView } from './gate-model'
import { proposalStates } from './gate-model'
import { narrationLanguages } from './narration-model'
import { APPROVAL_ID, PAYLOAD_HASH, parseCueNarration, parseNarrationStatus, parsePerLanguage } from './narration-validate'
import { isBounded, isInt, isNonNegativeInt, isNum, isOneOf, isRec, isText, matches, orNull } from './validate-primitives'

export const DESK_SCHEMA_VERSION = '1.0'
const MAX_DESK_MESSAGE_CHARS = 200_000
const MAX_NOTE_CHARS = 400
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$/

const isState = isOneOf(proposalStates)
const isLanguageCode = isOneOf(narrationLanguages)
const isApprovalId = matches(APPROVAL_ID)
const isPayloadHash = matches(PAYLOAD_HASH)
const isSessionId = matches(SESSION_ID_PATTERN)
const isTimestamp = (value: unknown): value is string =>
  matches(ISO_TIMESTAMP)(value) && Number.isFinite(Date.parse(`${value.slice(0, 19)}Z`))

export function parseSessionView(value: unknown): SessionView | null {
  if (!isRec(value)) return null
  const { sessionId, matchId, speed, fromSeconds, leadSeconds, slaSeconds, languages, createdAtUtc, expiresAtUtc, elapsedMs } = value
  const narration = parseNarrationStatus(value.narration)
  return isSessionId(sessionId) && matchId === MATCH_ID && isNum(speed) && speed >= 1 && speed <= 10 &&
    isNonNegativeInt(fromSeconds) && fromSeconds <= 86_400 && isInt(leadSeconds) && leadSeconds >= 1 && leadSeconds <= 120 &&
    isInt(slaSeconds) && slaSeconds >= 1 && slaSeconds <= 120 &&
    Array.isArray(languages) && languages.length >= 1 && languages.length <= 2 && languages.every(isLanguageCode) &&
    narration !== null && isTimestamp(createdAtUtc) && isTimestamp(expiresAtUtc) && isNonNegativeInt(elapsedMs)
    ? { sessionId, matchId, speed, fromSeconds, leadSeconds, slaSeconds, languages: [...languages], narration, createdAtUtc, expiresAtUtc, elapsedMs }
    : null
}

function parseProposal(value: unknown): ProposalView | null {
  if (!isRec(value)) return null
  const { approvalId, payloadHash, state, proposedAtMs, deadlineMs, cue, decidedAtMs, note } = value
  const narrations = parsePerLanguage(value.narrations, parseCueNarration)
  if (!isApprovalId(approvalId) || !isPayloadHash(payloadHash) || !isState(state) || !isNonNegativeInt(proposedAtMs) ||
    !isNonNegativeInt(deadlineMs) || !isCue(cue) || 'approval' in cue || narrations === null ||
    !orNull(isNonNegativeInt)(decidedAtMs) || !orNull(isBounded(MAX_NOTE_CHARS))(note)) return null
  if (narrations.en.cueId !== cue.overlayId || narrations.ta.cueId !== cue.overlayId) return null
  return { approvalId, payloadHash, state, proposedAtMs, deadlineMs, cue, narrations, decidedAtMs, note }
}

function parseDecisionState(value: unknown): DecidedState | null {
  return isState(value) && value !== 'PENDING' ? value : null
}

function parseDecision(value: unknown): DecisionMessage | null {
  if (!isRec(value)) return null
  const { approvalId, payloadHash, decidedAtMs, note } = value
  const state = parseDecisionState(value.state)
  const narrations = parsePerLanguage(value.narrations, parseCueNarration)
  return isApprovalId(approvalId) && isPayloadHash(payloadHash) && state !== null && isNonNegativeInt(decidedAtMs) &&
    orNull(isBounded(MAX_NOTE_CHARS))(note) && narrations !== null && narrations.en.cueId === narrations.ta.cueId
    ? { approvalId, state, decidedAtMs, payloadHash, note, narrations }
    : null
}

export function parseDecisionResult(value: unknown): DecisionResult | null {
  if (!isRec(value)) return null
  const { approvalId, payloadHash, decidedAtMs } = value
  const state = parseDecisionState(value.state)
  return isApprovalId(approvalId) && isPayloadHash(payloadHash) && state !== null && isNonNegativeInt(decidedAtMs)
    ? { approvalId, state, payloadHash, decidedAtMs }
    : null
}

/** Validates one desk message; anything unexpected throws instead of being rendered. */
export function parseDeskMessage(raw: string): DeskMessage {
  if (raw.length > MAX_DESK_MESSAGE_CHARS) throw new Error('The operator desk sent an oversized message.')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The operator desk sent invalid JSON.')
  }
  if (!isRec(parsed) || parsed.schemaVersion !== DESK_SCHEMA_VERSION || !isRec(parsed.payload) || typeof parsed.type !== 'string') {
    throw new Error('The operator desk message has an unsupported shape or schema version.')
  }
  const type = parsed.type
  const payload = parsed.payload
  if (type === 'session') {
    const session = parseSessionView(payload)
    if (session) return { type, payload: session }
  } else if (type === 'proposal') {
    const proposal = parseProposal(payload)
    if (proposal) return { type, payload: proposal }
  } else if (type === 'decision') {
    const decision = parseDecision(payload)
    if (decision) return { type, payload: decision }
  } else if (type === 'heartbeat' && isNonNegativeInt(payload.elapsedMs)) {
    return { type, payload: { elapsedMs: payload.elapsedMs } }
  }
  throw new Error('The operator desk message contains invalid data.')
}

export interface ApiProblem {
  readonly message: string | null
  readonly code: string | null
}

/** Reads the `{ error, code }` body the gate routes use for failures; both parts are optional and bounded. */
export function parseApiProblem(value: unknown): ApiProblem {
  if (!isRec(value)) return { message: null, code: null }
  return {
    message: isText(400)(value.error) ? value.error.trim() : null,
    code: matches(/^[A-Z][A-Z_]{2,39}$/)(value.code) ? value.code : null,
  }
}
