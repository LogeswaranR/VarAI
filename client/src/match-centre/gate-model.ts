import type { OverlayCue } from './match-model'
import type { CueNarration, NarrationLanguage, NarrationStatus, NarrationText, PerLanguage } from './narration-model'

export type PlaybackMode = 'preview' | 'gated'

/** Where an operator-gated run is: nothing yet, creating its session, running, stopped by the user, or ended on the server. */
export type GatePhase = 'idle' | 'creating' | 'running' | 'stopped' | 'ended'

export const GATED_SPEEDS = [1, 2, 5, 10] as const
export const DEFAULT_GATED_SPEED = 10
/** The match-clock second of the "Jump to 66:00" shortcut. */
export const JUMP_66_SECONDS = 3960
/** Only used for copy shown before a session reports the real decision window. */
export const DEFAULT_LEAD_SECONDS = 20

export const proposalStates = ['PENDING', 'APPROVED', 'HELD', 'OVERRIDDEN', 'AUTO_HELD'] as const
export type ProposalState = typeof proposalStates[number]
export type DecidedState = Exclude<ProposalState, 'PENDING'>

export type DecisionAction = 'approve' | 'hold' | 'override'

export interface SessionView {
  readonly sessionId: string
  readonly matchId: string
  readonly speed: number
  readonly fromSeconds: number
  readonly leadSeconds: number
  readonly slaSeconds: number
  readonly languages: readonly string[]
  readonly narration: NarrationStatus
  readonly createdAtUtc: string
  readonly expiresAtUtc: string
  readonly elapsedMs: number
}

export interface ProposalView {
  readonly approvalId: string
  readonly payloadHash: string
  readonly state: ProposalState
  readonly proposedAtMs: number
  readonly deadlineMs: number
  readonly cue: OverlayCue
  readonly narrations: PerLanguage<CueNarration>
  readonly decidedAtMs: number | null
  readonly note: string | null
}

export interface DecisionMessage {
  readonly approvalId: string
  readonly state: DecidedState
  readonly decidedAtMs: number
  readonly payloadHash: string
  readonly note: string | null
  readonly narrations: PerLanguage<CueNarration>
}

export type DeskMessage =
  | { readonly type: 'session'; readonly payload: SessionView }
  | { readonly type: 'proposal'; readonly payload: ProposalView }
  | { readonly type: 'decision'; readonly payload: DecisionMessage }
  | { readonly type: 'heartbeat'; readonly payload: { readonly elapsedMs: number } }

export interface DecisionResult {
  readonly approvalId: string
  readonly state: DecidedState
  readonly payloadHash: string
  readonly decidedAtMs: number
}

/** `payloadHash` must be the hash of the proposal the operator is looking at; the server binds the decision to it. */
export interface DecisionRequest {
  readonly approvalId: string
  readonly payloadHash: string
  readonly action: DecisionAction
  readonly edits?: Readonly<Partial<Record<NarrationLanguage, NarrationText>>>
  readonly note?: string
}

export interface CreateSessionRequest {
  readonly speed: number
  readonly fromSeconds: number
}
