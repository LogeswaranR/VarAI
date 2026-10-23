import { GateApiError } from './gate-api'
import type { ProposalState } from './gate-model'
import type { ModelUsage } from './narration-model'

export const stateLabels: Readonly<Record<ProposalState, string>> = {
  PENDING: 'Awaiting decision',
  APPROVED: 'Approved',
  HELD: 'Held',
  OVERRIDDEN: 'Overridden',
  AUTO_HELD: 'Held automatically: no decision in time',
}

export const WINDOW_CLOSED_TEXT = 'Window closed - held automatically'

export const SESSION_ENDED_MESSAGE = 'The operator-gated session ended: it expired or the server restarted. Start a new run to continue.'

export const IDENTITY_NOTE = 'Operator identity is not authenticated in this demo; sessions live in server memory.'
export const LOG_NOTE = 'Hash-chained: it detects edits to the file. It is not signed and does not identify the operator.'

export function countdownSeconds(remainingMs: number) {
  return Math.max(0, Math.ceil(remainingMs / 1000))
}

/** Coarse steps for the screen-reader announcement, so a live region speaks a few times per cue rather than every second. */
export function countdownAnnouncement(remainingMs: number | null) {
  if (remainingMs === null) return ''
  if (remainingMs <= 0) return WINDOW_CLOSED_TEXT
  if (remainingMs <= 5000) return 'Under 5 seconds left to decide'
  if (remainingMs <= 10_000) return 'Under 10 seconds left to decide'
  return ''
}

const tokens = new Intl.NumberFormat('en')

export function usageFacts(usage: ModelUsage): readonly (readonly [string, string])[] {
  return [
    ['Deployment', usage.deployment || 'not reported'],
    ['Reported model', usage.reportedModel ?? 'not reported'],
    ['Tokens in', tokens.format(usage.promptTokens)],
    ['Tokens out', tokens.format(usage.completionTokens)],
    ['Reasoning tokens', tokens.format(usage.reasoningTokens)],
    ['Cached prompt tokens', tokens.format(usage.cachedPromptTokens)],
    ['Latency', `${(usage.latencyMs / 1000).toFixed(1)} s`],
  ]
}

export interface DecisionProblem {
  readonly message: string
  readonly sessionEnded: boolean
  /** True when the proposal can no longer be decided, so its controls should stay off. */
  readonly settled: boolean
}

/** Turns a failed decision into plain words; the server's own text is used when it explains the problem (a rejected edit). */
export function describeDecisionError(error: unknown): DecisionProblem {
  if (!(error instanceof GateApiError)) {
    return { message: 'The decision could not be sent. Try again before the window closes.', sessionEnded: false, settled: false }
  }
  switch (error.code) {
    case 'ALREADY_DECIDED':
      return { message: 'This cue was already decided, so nothing was changed.', sessionEnded: false, settled: true }
    case 'SLA_EXPIRED':
      return { message: 'The decision window closed first, so the cue was held automatically.', sessionEnded: false, settled: true }
    case 'STALE_PAYLOAD':
      return { message: 'The proposal changed after it was shown, so the decision was not applied. Check the text on screen and try again.', sessionEnded: false, settled: false }
    case 'UNKNOWN_PROPOSAL':
      return { message: 'The desk does not know this proposal. It may belong to an earlier session.', sessionEnded: false, settled: true }
    case 'SESSION_ENDED':
      return { message: 'The session has ended: it expired or the server restarted. Start a new run to continue.', sessionEnded: true, settled: true }
    case 'NETWORK':
      return { message: 'The server could not be reached, so the decision was not recorded. Try again before the window closes.', sessionEnded: false, settled: false }
    default:
      return { message: error.message, sessionEnded: false, settled: false }
  }
}
