import type { PlaybackMode } from './gate-model'
import { DEFAULT_LEAD_SECONDS } from './gate-model'
import { formatClock } from './match-model'
import type { MatchMetadata } from './match-model'
import type { StreamStatus } from './match-state'
import type { NarrationStatus } from './narration-model'

export const PREVIEW_LABEL = 'Preview - deterministic rules only, not operator-approved'

export function introText(mode: PlaybackMode) {
  return mode === 'preview'
    ? 'Events stream in, deterministic rules turn them into metrics and explainable moments, and each viewer gets the same match shaped for them.'
    : 'Events stream in and deterministic rules find the moments. In operator-gated mode each moment is narrated in English and Tamil, a person approves, edits or holds it, and only approved cues air, after a short broadcast delay.'
}

/** `leadSeconds` is the real decision window once a session has reported it; before that the demo default is shown and labelled as such. */
export function speedNote(leadSeconds: number | null) {
  const known = leadSeconds !== null
  return `Operator-gated runs at 10x or slower because the decision window is real time. The program is delayed by the decision window (${leadSeconds ?? DEFAULT_LEAD_SECONDS} s).${known ? '' : ' That is the demo default; the server confirms the real window when a session starts.'}`
}

export function narrationChipText(status: NarrationStatus | null, failed: boolean) {
  if (status === null) return failed ? 'AI narration: status unavailable' : 'AI narration: checking status…'
  if (!status.enabled) return 'AI narration: off - deterministic English only'
  const model = status.deployment ?? 'deployment not reported'
  return `AI narration: on (${model}) - ${status.callsUsed}/${status.callLimit} model calls used${status.coolingDown ? ' - paused after repeated failures' : ''}`
}

const APPROVAL_RULE = 'A person must approve, edit or hold every cue before it airs. A cue nobody decides in time is held, never approved automatically.'

export function provenanceParagraphs(
  mode: PlaybackMode, seed: number | null, narration: NarrationStatus | null,
): readonly string[] {
  const shownSeed = seed ?? '…'
  if (mode === 'preview') {
    return [
      `Every team, player and event is fictional and generated from a fixed seed (${shownSeed}). Coordinates, durations and metrics are synthetic inputs and transparent derivations, not tracking, video or real match data. No AI model is called here: each moment comes from a named deterministic rule that is shown under “How we know”. The offside review is a separate supplied-evidence scenario, not an official decision.`,
    ]
  }
  const narrationParagraph = narration === null
    ? `When AI narration is on, the words of each cue are written by an AI model in English and Tamil; when it is off or unavailable the deterministic English text is used and Tamil falls back to English. The server has not reported which applies yet. ${APPROVAL_RULE}`
    : narration.enabled
      ? `In operator-gated mode the words of each cue are written by an AI model${narration.deployment ? ` (deployment ${narration.deployment})` : ''} in English and Tamil. The facts come from the rules; the model only words them. ${APPROVAL_RULE}`
      : `AI narration is off on this server, so every cue uses the deterministic English text from the rules and the Tamil view falls back to English. ${APPROVAL_RULE}`
  return [
    `Everything here is synthetic: every team, player and event is fictional and generated from a fixed seed (${shownSeed}), and coordinates, durations and metrics are synthetic inputs and transparent derivations, not tracking, video or real match data. The moments still come from named deterministic rules, shown under “How we know”.`,
    narrationParagraph,
    'The checks on AI text are mechanical (numbers, scores, names, event words and script); they do not prove the text is true. Tamil output has not been reviewed by a native speaker. This demo has no operator login, so anyone who has the session can decide, and the decision log does not say who decided. The offside review is a separate supplied-evidence scenario and makes no ruling.',
  ]
}

export interface GatedStatus {
  /** The program's delay behind the desk, once a session has reported it. */
  readonly leadSeconds: number | null
}

export function statusText(
  status: StreamStatus, clockMs: number, speed: number, message: string | null, metadata: MatchMetadata | null, gated: GatedStatus | null,
) {
  switch (status) {
    case 'idle':
      if (!metadata) return 'Loading the synthetic match…'
      return gated
        ? `Ready · a ${Math.round(metadata.durationMs / 60000)}-minute synthetic match, operator-gated. Nothing runs until you start a session, and every cue then needs a person's approval before it airs.`
        : `Ready · a ${Math.round(metadata.durationMs / 60000)}-minute synthetic match. Nothing plays until you start it.`
    case 'connecting': return gated ? 'Starting an operator-gated session…' : 'Connecting to the synthetic match stream…'
    case 'streaming':
      return gated
        ? `Operator-gated · playing at ${speed}× · match clock ${formatClock(clockMs)}.${gated.leadSeconds === null ? '' : ` The program runs ${gated.leadSeconds} s behind the desk.`}`
        : `Playing at ${speed}× · match clock ${formatClock(clockMs)}.`
    case 'reconnecting': return 'Connection interrupted. Resuming from the last item received…'
    case 'complete': return `Full time · ${formatClock(clockMs)} played.`
    case 'stopped':
      return gated
        ? `Stopped at ${formatClock(clockMs)}. Both streams are closed; the session stays on the server until it expires.`
        : `Stopped at ${formatClock(clockMs)}.`
    case 'error': return message ?? 'The match stream failed.'
  }
}
