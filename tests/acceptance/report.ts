import { checks, statuses } from './model'
import type { AcceptanceReport, CheckResult, Target, UnexecutedScope } from './model'

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid acceptance report: ${message}`)
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, expected: string[]) {
  requireValue(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected.sort()), 'unexpected or omitted fields')
}

export function unexecutedScopes(target: Target): UnexecutedScope[] {
  return [
    ...(target === 'contract-stub' ? [{
      scope: 'real-application', status: 'NOT_RUN' as const,
      reason: 'Only explicitly injected contract stubs ran. The G01 application adapter was not executed.',
    }] : []),
    {
      scope: 'authorized-live-provider-smoke', status: 'NOT_RUN',
      reason: 'Simulated LIVE_AI and candidate adapter assertions do not establish an authorized real provider request. G01 must record that separate evidence.',
    },
    {
      scope: 'browser-ui', status: 'NOT_RUN',
      reason: 'This report covers contract data only. The separately invoked Playwright and UI suites have their own reports; no browser result is inferred here.',
    },
    {
      scope: 'human-semantic-review', status: 'NOT_RUN',
      reason: 'Reference existence and structured validation cannot establish whether prose follows its evidence.',
    },
    {
      scope: 'qualified-rule-review', status: 'NOT_RUN',
      reason: 'Draft fixtures and proposed study answers have no recorded qualified reviewer approval.',
    },
    {
      scope: 'five-viewer-study', status: 'NOT_RUN',
      reason: 'Study materials are a protocol, not participant observations or market evidence.',
    },
  ]
}

export function countsFor(results: readonly CheckResult[]): AcceptanceReport['counts'] {
  return {
    PASS: results.filter(result => result.status === 'PASS').length,
    FAIL: results.filter(result => result.status === 'FAIL').length,
    SKIPPED: results.filter(result => result.status === 'SKIPPED').length,
    BLOCKED: results.filter(result => result.status === 'BLOCKED').length,
    NOT_RUN: results.filter(result => result.status === 'NOT_RUN').length,
    total: results.length,
    matrix: results.filter(result => result.kind === 'matrix').length,
    injectedFailures: results.filter(result => result.kind === 'injected-failure').length,
  }
}

export function outcomeFor(counts: AcceptanceReport['counts']): AcceptanceReport['outcome'] {
  return counts.FAIL > 0 ? 'FAIL' : counts.SKIPPED + counts.BLOCKED + counts.NOT_RUN > 0 ? 'INCOMPLETE' : 'PASS'
}

export function evidenceLabel(target: Target) {
  return target === 'contract-stub'
    ? 'CONTRACT STUB ONLY — LIVE_AI is simulated; no integrated application or provider acceptance.'
    : 'REAL APPLICATION TARGET — requires an explicit G01 adapter; fault injection is not provider evidence; see per-case availability.'
}

export function validateReport(value: unknown): asserts value is AcceptanceReport {
  requireValue(record(value), 'root must be an object')
  keys(value, [
    'schemaVersion', 'runId', 'startedAt', 'finishedAt', 'target', 'adapter', 'scope', 'evidenceLabel',
    'results', 'counts', 'outcome', 'productAcceptance', 'unexecuted',
  ])
  requireValue(value.schemaVersion === 'var108.acceptance/1', 'schema version')
  requireValue(typeof value.runId === 'string' && value.runId.trim().length > 0, 'run ID')
  for (const key of ['startedAt', 'finishedAt']) {
    requireValue(typeof value[key] === 'string' && Number.isFinite(Date.parse(value[key])), 'timestamp')
  }
  requireValue(Date.parse(value.finishedAt as string) >= Date.parse(value.startedAt as string), 'timestamp order')
  requireValue(value.target === 'contract-stub' || value.target === 'real-application', 'target')
  requireValue(value.adapter === null || (typeof value.adapter === 'string' && value.adapter.trim().length > 0), 'adapter')
  requireValue(value.scope === 'contract-data-and-injected-faults', 'scope')
  requireValue(value.evidenceLabel === evidenceLabel(value.target), 'evidence label')
  requireValue(value.productAcceptance === 'NOT_ESTABLISHED', 'must not claim product acceptance')
  requireValue(Array.isArray(value.results) && value.results.length === checks.length, 'case count')
  const seen = new Set<string>()
  for (const result of value.results) {
    requireValue(record(result), 'result must be an object')
    keys(result, ['id', 'requirements', 'expected', 'kind', 'status', 'reason', 'observed'])
    requireValue(typeof result.id === 'string' && !seen.has(result.id), 'duplicate/invalid case ID')
    seen.add(result.id)
    const spec = checks.find(check => check.id === result.id)
    requireValue(spec && result.expected === spec.expected && result.kind === spec.kind &&
      JSON.stringify(result.requirements) === JSON.stringify(spec.requirements), 'unknown or changed case definition')
    requireValue(statuses.some(status => status === result.status), 'status')
    requireValue(result.status === 'PASS'
      ? result.reason === null
      : typeof result.reason === 'string' && result.reason.trim().length > 0, 'status reason')
    requireValue(record(result.observed), 'observed evidence')
    requireValue(Object.values(result.observed).every(item =>
      item === null || typeof item === 'string' || typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item)) ||
      (Array.isArray(item) && item.every(entry => typeof entry === 'string'))), 'evidence values')
    requireValue(result.status !== 'PASS' || Object.keys(result.observed).length > 0, 'pass without observations')
  }
  const counts = countsFor(value.results as CheckResult[])
  requireValue(value.adapter !== null || counts.PASS === 0, 'pass without an identified adapter')
  requireValue(record(value.counts), 'counts')
  keys(value.counts, Object.keys(counts))
  requireValue(Object.entries(counts).every(([key, count]) => (value.counts as Record<string, unknown>)[key] === count), 'counts disagree with results')
  requireValue(counts.total === 27 && counts.matrix === 12 && counts.injectedFailures === 7, 'required coverage')
  requireValue(value.outcome === outcomeFor(counts), 'outcome disagrees with results')
  requireValue(JSON.stringify(value.unexecuted) === JSON.stringify(unexecutedScopes(value.target)), 'unperformed work must remain NOT_RUN')
}

export function exitCode(report: AcceptanceReport): 0 | 1 | 2 {
  validateReport(report)
  return report.outcome === 'FAIL' ? 1 : report.outcome === 'INCOMPLETE' ? 2 : 0
}
