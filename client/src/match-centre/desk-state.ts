import type { DecisionResult, DeskMessage, ProposalView, SessionView } from './gate-model'

export type DeskConnection = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'ended' | 'error'

/** The server's session clock at the moment a message arrived, with the local clock reading at that moment. */
export interface ServerClockSync {
  readonly elapsedMs: number
  readonly atMs: number
}

export interface DeskState {
  readonly connection: DeskConnection
  readonly message: string | null
  readonly session: SessionView | null
  /** In arrival order; each approval ID appears once. */
  readonly proposals: readonly ProposalView[]
  /** Highest desk message number applied, so a replay after a reconnect changes nothing. */
  readonly lastSeq: number
  readonly sync: ServerClockSync | null
}

export type DeskAction =
  | { readonly type: 'reset' }
  | { readonly type: 'connecting' }
  | { readonly type: 'status'; readonly connection: DeskConnection; readonly message?: string | null }
  | { readonly type: 'stopped'; readonly message?: string | null }
  | { readonly type: 'message'; readonly message: DeskMessage; readonly seq: number | null; readonly atMs: number }
  | { readonly type: 'recorded'; readonly result: DecisionResult }

export const initialDeskState: DeskState = {
  connection: 'idle', message: null, session: null, proposals: [], lastSeq: 0, sync: null,
}

const receiving = new Set<DeskConnection>(['connecting', 'open', 'reconnecting'])

function update(proposals: readonly ProposalView[], approvalId: string, change: (proposal: ProposalView) => ProposalView) {
  return proposals.map(proposal => proposal.approvalId === approvalId ? change(proposal) : proposal)
}

function applyMessage(state: DeskState, message: DeskMessage, seq: number | null, atMs: number): DeskState {
  const connection = receiving.has(state.connection) ? 'open' : state.connection
  switch (message.type) {
    case 'session':
      if (state.session && state.session.sessionId !== message.payload.sessionId) return state
      return { ...state, connection, message: null, session: message.payload, sync: { elapsedMs: message.payload.elapsedMs, atMs } }
    case 'heartbeat':
      return { ...state, connection, sync: { elapsedMs: message.payload.elapsedMs, atMs } }
    case 'proposal': {
      if (seq !== null && seq <= state.lastSeq) return state
      const lastSeq = Math.max(state.lastSeq, seq ?? 0)
      if (state.proposals.some(proposal => proposal.approvalId === message.payload.approvalId)) return { ...state, connection, lastSeq }
      return { ...state, connection, lastSeq, proposals: [...state.proposals, message.payload] }
    }
    case 'decision': {
      if (seq !== null && seq <= state.lastSeq) return state
      const lastSeq = Math.max(state.lastSeq, seq ?? 0)
      const { payload } = message
      const target = state.proposals.find(proposal => proposal.approvalId === payload.approvalId)
      // A decision is final: it may complete a locally recorded one (adding the narration and note) but never contradict it.
      if (!target || (target.state !== 'PENDING' && target.state !== payload.state)) return { ...state, connection, lastSeq }
      return {
        ...state, connection, lastSeq,
        proposals: update(state.proposals, payload.approvalId, proposal => ({
          ...proposal, state: payload.state, decidedAtMs: payload.decidedAtMs, payloadHash: payload.payloadHash,
          note: payload.note, narrations: payload.narrations,
        })),
      }
    }
  }
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case 'reset':
      return initialDeskState
    case 'connecting':
      return { ...state, connection: 'connecting', message: null }
    case 'status':
      return { ...state, connection: action.connection, message: action.message ?? null }
    case 'stopped':
      return receiving.has(state.connection) ? { ...state, connection: 'closed', message: action.message ?? null } : state
    case 'message':
      return applyMessage(state, action.message, action.seq, action.atMs)
    case 'recorded': {
      const { result } = action
      const target = state.proposals.find(proposal => proposal.approvalId === result.approvalId)
      if (!target || target.state !== 'PENDING') return state
      return {
        ...state,
        proposals: update(state.proposals, result.approvalId, proposal => ({
          ...proposal, state: result.state, decidedAtMs: result.decidedAtMs, payloadHash: result.payloadHash,
        })),
      }
    }
  }
}

/** The server's session clock now: the last reported value plus the local time that has passed since. */
export function serverElapsedMs(sync: ServerClockSync | null, nowMs: number): number | null {
  return sync === null ? null : sync.elapsedMs + Math.max(0, nowMs - sync.atMs)
}

export function remainingMs(proposal: Pick<ProposalView, 'deadlineMs'>, sync: ServerClockSync | null, nowMs: number): number | null {
  const elapsed = serverElapsedMs(sync, nowMs)
  return elapsed === null ? null : proposal.deadlineMs - elapsed
}

export const isPending = (proposal: ProposalView) => proposal.state === 'PENDING'

/** Soonest deadline first, so the cue that airs next is on top. */
export function pendingProposals(proposals: readonly ProposalView[]): readonly ProposalView[] {
  return proposals.filter(isPending).sort((a, b) => a.deadlineMs - b.deadlineMs || a.approvalId.localeCompare(b.approvalId))
}

/** Most recent decision first. */
export function decidedProposals(proposals: readonly ProposalView[]): readonly ProposalView[] {
  return proposals.filter(proposal => !isPending(proposal))
    .sort((a, b) => (b.decidedAtMs ?? -1) - (a.decidedAtMs ?? -1) || b.approvalId.localeCompare(a.approvalId))
}
