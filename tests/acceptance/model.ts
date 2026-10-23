import type { Audience, ErrorCode, ScenarioId, SourceMode } from '../../client/src/contracts/graphql.generated'
import type { ExplanationClient, ScenarioRepository } from '../../client/src/contracts/interfaces'

export const scenarios = ['S1', 'S2', 'S3'] as const satisfies readonly ScenarioId[]
export const audiences = ['CASUAL', 'ANALYST'] as const satisfies readonly Audience[]
export const modes = ['AUTHORED', 'LIVE_AI'] as const satisfies readonly SourceMode[]
export const errors = [
  'INVALID_REQUEST', 'SCENARIO_NOT_FOUND', 'CONTENT_VERSION_MISMATCH', 'MODEL_NOT_CONFIGURED',
  'MODEL_UNAVAILABLE', 'TIMEOUT', 'INVALID_OUTPUT',
] as const satisfies readonly ErrorCode[]
export const statuses = ['PASS', 'FAIL', 'SKIPPED', 'BLOCKED', 'NOT_RUN'] as const
export type Status = typeof statuses[number]
export type Target = 'contract-stub' | 'real-application'
export type Evidence = Record<string, string | number | boolean | null | string[]>
export type Access = { available: true } | { available: false; reason: string }

export interface Collaborators {
  repository: ScenarioRepository
  client: ExplanationClient
}

export interface AcceptanceAdapter extends Collaborators {
  kind: Target
  name: string
  application: Access
  live: Access
  failureClient?: (code: ErrorCode) => ExplanationClient
  withTeamLabels?: (id: ScenarioId, labels: { homeTeam: string; awayTeam: string }) => Promise<Collaborators>
}

export interface CheckSpec {
  id: string
  requirements: string[]
  expected: string
  kind: 'matrix' | 'injected-failure' | 'missing-evidence' | 'comparison' | 'audience' | 'team-labels'
  scenario?: ScenarioId
  audience?: Audience
  mode?: SourceMode
  error?: ErrorCode
}

export const checks: readonly CheckSpec[] = [
  ...scenarios.flatMap(scenario => audiences.flatMap(audience => modes.map(mode => ({
    id: `matrix/${scenario}/${audience}/${mode}`,
    requirements: ['BR-01', 'BR-02', 'BR-03', 'BR-04', 'BR-05', 'BR-06', 'BR-08', 'BR-09'],
    expected: 'Validated synthetic scenario and correlated explanation; supplied outcome/score, references, limits and provenance preserved.',
    kind: 'matrix' as const, scenario, audience, mode,
  })))),
  ...errors.map(error => ({
    id: `failure/${error}`, requirements: ['BR-08', 'BR-10'],
    expected: `${error} remains an explicit typed error with the approved retry policy and no authored fallback.`,
    kind: 'injected-failure' as const, error,
  })),
  {
    id: 'evidence/missing', requirements: ['BR-03', 'BR-04', 'BR-05', 'BR-08', 'BR-09'],
    expected: 'S3 preserves two unknown positions, unavailable snapshot, null outcome/after-score and LIMITED/INSUFFICIENT_EVIDENCE.',
    kind: 'missing-evidence',
  },
  {
    id: 'comparison/one-fact', requirements: ['BR-03', 'BR-07'],
    expected: 'Only RECEIVER_VS_SECOND_LAST changes independently; pair metadata, versions, context and sources agree.',
    kind: 'comparison',
  },
  ...scenarios.map(scenario => ({
    id: `audience/${scenario}`, requirements: ['BR-06'],
    expected: 'Both audiences retain the same structured interpretation and evidence availability in both modes.',
    kind: 'audience' as const, scenario,
  })),
  ...scenarios.map(scenario => ({
    id: `team-labels/${scenario}`, requirements: ['BR-05', 'BR-06'],
    expected: 'Swapped supplied team labels leave facts, decisions, scores and structured interpretations unchanged; prose still needs human review.',
    kind: 'team-labels' as const, scenario,
  })),
]

export interface CheckResult {
  id: string
  requirements: string[]
  expected: string
  kind: CheckSpec['kind']
  status: Status
  reason: string | null
  observed: Evidence
}

export interface UnexecutedScope {
  scope: string
  status: 'NOT_RUN'
  reason: string
}

export interface AcceptanceReport {
  schemaVersion: 'var108.acceptance/1'
  runId: string
  startedAt: string
  finishedAt: string
  target: Target
  adapter: string | null
  scope: 'contract-data-and-injected-faults'
  evidenceLabel: string
  results: CheckResult[]
  counts: Record<Status, number> & { total: number; matrix: number; injectedFailures: number }
  outcome: 'PASS' | 'FAIL' | 'INCOMPLETE'
  productAcceptance: 'NOT_ESTABLISHED'
  unexecuted: UnexecutedScope[]
}
