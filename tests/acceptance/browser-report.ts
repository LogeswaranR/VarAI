import { audiences, errors, modes, scenarios } from './model'

export const fixtureBrowserTitles = [
  'fixture: visible provenance, keyboard focus, placeholders and exact viewport',
  ...scenarios.flatMap(scenario => audiences.flatMap(audience => modes.map(mode =>
    `fixture: ${scenario}/${audience}/${mode} explicit request, status and mode`))),
  ...errors.map(code => `fixture: injected ${code} has no success-shaped fallback`),
  'fixture: missing facts, snapshot and gated outcome context stay explicit',
  'fixture: same-scenario staged reset clears result and source selection',
  'fixture: scenario change and audience/mode changes clear mismatched output',
  'fixture: comparison callback is reversible and S3 exposes no variant',
]

export const applicationBrowserTitles = [
  ...scenarios.flatMap(scenario => audiences.flatMap(audience => modes.map(mode =>
    `application: ${scenario}/${audience}/${mode} journey`))),
  'application: same-scenario replay reset clears explanation and recap',
  'application: delayed response cannot restore a reset result or recap',
  'application: delayed response stays invalid after a audience round-trip',
  'application: delayed response stays invalid after a mode round-trip',
  'application: keyboard source navigation, visible focus and responsive presentation',
  'application: comparison is reversible, resets replay and is unavailable for S3',
]

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid fixture browser report: ${message}`)
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateBrowserReport(value: unknown) {
  requireValue(record(value) && Array.isArray(value.suites) && record(value.stats), 'missing suites/stats')
  requireValue(Array.isArray(value.errors) && value.errors.length === 0, 'run errors')
  requireValue(fixtureBrowserTitles.length === 24 && applicationBrowserTitles.length === 18, 'coverage definitions')
  const found = new Set<string>()
  const projects = ['chromium-375', 'chromium-1280']
  function visit(suites: unknown[]) {
    for (const suite of suites) {
      requireValue(record(suite) && Array.isArray(suite.specs), 'suite structure')
      if (suite.suites !== undefined) {
        requireValue(Array.isArray(suite.suites), 'nested suite structure')
        visit(suite.suites)
      }
      for (const spec of suite.specs) {
        requireValue(record(spec) && typeof spec.title === 'string' && Array.isArray(spec.tests) && spec.ok === true, 'spec structure/result')
        const fixture = fixtureBrowserTitles.includes(spec.title)
        requireValue(fixture || applicationBrowserTitles.includes(spec.title), 'unknown test title')
        for (const test of spec.tests) {
          requireValue(record(test) && typeof test.projectName === 'string' && projects.includes(test.projectName), 'project')
          const key = `${test.projectName}/${spec.title}`
          requireValue(!found.has(key), 'duplicate case')
          found.add(key)
          requireValue(Array.isArray(test.results) && test.results.length === 1 && record(test.results[0]), 'missing result or hidden retries')
          const result = test.results[0]
          requireValue(result.retry === 0 && Array.isArray(result.errors) && result.errors.length === 0, 'retry/error')
          requireValue(result.status === (fixture ? 'passed' : 'skipped') &&
            test.expectedStatus === (fixture ? 'passed' : 'skipped') &&
            test.status === (fixture ? 'expected' : 'skipped'), 'fixture skipped/failed or real application falsely reported executed')
          if (!fixture) {
            requireValue(Array.isArray(test.annotations) && test.annotations.some(annotation =>
              record(annotation) && annotation.type === 'skip' && typeof annotation.description === 'string' &&
              annotation.description.includes('no explicit G01 application/browser adapter')), 'missing application skip reason')
          }
        }
      }
    }
  }
  visit(value.suites)
  for (const project of projects) for (const title of [...fixtureBrowserTitles, ...applicationBrowserTitles]) {
    requireValue(found.has(`${project}/${title}`), 'omitted required case/project')
  }
  requireValue(found.size === 84 && value.stats.expected === 48 && value.stats.skipped === 36 &&
    value.stats.unexpected === 0 && value.stats.flaky === 0, 'counts disagree with required executions')
  return {
    scope: 'contract-stub-browser',
    fixturePassed: 48,
    applicationExecuted: 0,
    applicationSkipped: 36,
    viewportWidths: [375, 1280],
    retries: 0,
    productAcceptance: 'NOT_ESTABLISHED',
  } as const
}
