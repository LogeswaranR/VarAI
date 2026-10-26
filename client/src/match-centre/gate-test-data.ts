import type { DecisionMessage, ProposalView, SessionView } from './gate-model'
import { MATCH_ID } from './match-model'
import type { OverlayCue } from './match-model'
import { verifierChecks } from './narration-model'
import type {
  CueApproval, CueNarration, FallbackReason, ModelUsage, NarrationLanguage, NarrationStatus, NarrationText, PublicNarration, Verification,
} from './narration-model'
import { cue } from './match-test-data'

export const SESSION_ID = '0123456789abcdef0123456789abcdef'
export const HASH = 'a'.repeat(64)
export const OTHER_HASH = 'b'.repeat(64)
export const GOAL_CUE_ID = `${MATCH_ID}-OV-027`

export const englishText: NarrationText = {
  headline: 'Ravi Sorrell levels it for Alder Vale',
  fan: 'Ravi Sorrell finishes from close range and the match is level again.',
  analyst: 'Finish from 7.2 m at 72 km/h after a 28.2 m assisting pass.',
  why: 'Level at 1–1 with a minute left.',
}

export const tamilText: NarrationText = {
  headline: 'ரவி சோரெல் சமன் செய்தார்',
  fan: 'ஆட்டம் மீண்டும் சமநிலைக்கு வந்தது.',
  analyst: '7.2 மீ தூரத்திலிருந்து 72 கிமீ/மணி வேகத்தில் கோல்.',
  why: 'ஒரு நிமிடம் மீதமுள்ள நிலையில் 1–1.',
}

export const goalCue = (overrides: Partial<OverlayCue> = {}): OverlayCue => cue({
  overlayId: GOAL_CUE_ID, kind: 'GOAL', priority: 3, inMs: 5_291_200, outMs: 5_300_200, durationMs: 9000,
  headline: 'Goal for Alder Vale Comets: Ravi Sorrell',
  detail: 'Ravi Sorrell finishes from 7.2 m at 72 km/h. The assisting pass covered 28.2 m (difficulty 92/100).',
  whyItMatters: 'Levels the match: AVC 1–1 BRL with 1 minute left. One more goal now decides it.',
  lowerThird: { title: 'GOAL · AVC', subtitle: 'Ravi Sorrell · 88:10 · AVC 1–1 BRL' },
  ...overrides,
})

export const passedVerification: Verification = { passed: true, passedChecks: [...verifierChecks], failures: [] }

export const flaggedVerification: Verification = {
  passed: false,
  passedChecks: ['schema', 'markup', 'script', 'scoreboard', 'events', 'claims'],
  failures: [
    { check: 'numbers', field: 'fan', detail: 'The number 3 is not in the facts.' },
    { check: 'names', field: 'headline', detail: 'The name Kane is not in the facts.' },
  ],
}

export const usage: ModelUsage = {
  deployment: 'gpt-demo', reportedModel: 'gpt-demo-2026-05', promptTokens: 1200, completionTokens: 340, reasoningTokens: 120,
  cachedPromptTokens: 64, latencyMs: 1830,
}

export function fallbackNarration(
  language: NarrationLanguage, reason: FallbackReason = 'DISABLED', cueId = GOAL_CUE_ID, source = goalCue(),
): CueNarration {
  return {
    cueId, requestedLanguage: language, language: 'en', source: 'FALLBACK', fallbackReason: reason,
    text: { headline: source.headline, fan: source.detail, analyst: source.detail, why: source.whyItMatters },
    verification: null, usage: null,
  }
}

export function aiNarration(language: NarrationLanguage, cueId = GOAL_CUE_ID, overrides: Partial<CueNarration> = {}): CueNarration {
  return {
    cueId, requestedLanguage: language, language, source: 'AI', fallbackReason: null,
    text: language === 'ta' ? tamilText : englishText, verification: passedVerification, usage, ...overrides,
  }
}

export function operatorNarration(language: NarrationLanguage, text: NarrationText, cueId = GOAL_CUE_ID): CueNarration {
  return {
    cueId, requestedLanguage: language, language, source: 'OPERATOR', fallbackReason: null, text, verification: passedVerification, usage: null,
  }
}

export const publicOf = (narration: CueNarration): PublicNarration => ({
  source: narration.source, requestedLanguage: narration.requestedLanguage, language: narration.language,
  fallbackReason: narration.fallbackReason, text: narration.text,
})

export function approval(
  en: CueNarration = fallbackNarration('en'), ta: CueNarration = fallbackNarration('ta'), overrides: Partial<CueApproval> = {},
): CueApproval {
  return { approvalId: 'APR-001', payloadHash: HASH, decision: 'APPROVED', narrations: { en: publicOf(en), ta: publicOf(ta) }, ...overrides }
}

/** A cue as the gated program feed delivers it: the rule's fields plus the approval that released it. */
export function approvedCue(
  overrides: Partial<OverlayCue> = {}, en: CueNarration = fallbackNarration('en'), ta: CueNarration = fallbackNarration('ta'),
  approvalOverrides: Partial<CueApproval> = {},
): OverlayCue {
  const base = goalCue(overrides)
  return { ...base, approval: approval(
    { ...en, cueId: base.overlayId }, { ...ta, cueId: base.overlayId }, approvalOverrides) }
}

export const narrationStatus = (overrides: Partial<NarrationStatus> = {}): NarrationStatus => ({
  enabled: false, deployment: null, callsUsed: 0, callLimit: 160, coolingDown: false, ...overrides,
})

export function session(overrides: Partial<SessionView> = {}): SessionView {
  return {
    sessionId: SESSION_ID, matchId: MATCH_ID, speed: 10, fromSeconds: 5280, leadSeconds: 20, slaSeconds: 20, languages: ['en', 'ta'],
    narration: narrationStatus(), createdAtUtc: '2026-10-23T12:12:19.9864610+00:00', expiresAtUtc: '2026-10-23T12:17:47.9864610+00:00',
    elapsedMs: 1, ...overrides,
  }
}

export function proposal(overrides: Partial<ProposalView> = {}): ProposalView {
  const source = overrides.cue ?? goalCue()
  return {
    approvalId: 'APR-001', payloadHash: HASH, state: 'PENDING', proposedAtMs: 1000, deadlineMs: 21_000, cue: source,
    narrations: {
      en: fallbackNarration('en', 'DISABLED', source.overlayId, source), ta: fallbackNarration('ta', 'DISABLED', source.overlayId, source),
    },
    decidedAtMs: null, note: null, ...overrides,
  }
}

export function decision(overrides: Partial<DecisionMessage> = {}): DecisionMessage {
  const source = goalCue()
  return {
    approvalId: 'APR-001', state: 'APPROVED', decidedAtMs: 6000, payloadHash: HASH, note: null,
    narrations: { en: fallbackNarration('en', 'DISABLED', source.overlayId, source), ta: fallbackNarration('ta', 'DISABLED', source.overlayId, source) },
    ...overrides,
  }
}

export const deskEnvelope = (type: string, payload: unknown, schemaVersion = '1.0') => JSON.stringify({ schemaVersion, type, payload })
