import { describe, expect, it } from 'vitest'
import { applicationBrowserTitles, fixtureBrowserTitles, validateBrowserReport } from './browser-report'

function syntheticReporterOutput() {
  return {
    errors: [] as string[],
    stats: { expected: 48, skipped: 36, unexpected: 0, flaky: 0 },
    suites: [{
      specs: [...fixtureBrowserTitles, ...applicationBrowserTitles].map(title => {
        const fixture = title.startsWith('fixture:')
        return {
          title, ok: true,
          tests: ['chromium-375', 'chromium-1280'].map(projectName => ({
            projectName, expectedStatus: fixture ? 'passed' : 'skipped',
            status: fixture ? 'expected' : 'skipped',
            annotations: fixture ? [] : [{ type: 'skip', description: 'NOT RUN: no explicit G01 application/browser adapter supplied.' }],
            results: [{ status: fixture ? 'passed' : 'skipped', errors: [] as string[], retry: 0 }],
          })),
        }
      }),
    }],
  }
}

describe('browser reporter validation using synthetic reporter data, not browser observations', () => {
  it('checks all eighty-four scoped result records, not just an existing JSON file', () => {
    expect(validateBrowserReport(syntheticReporterOutput())).toEqual({
      scope: 'contract-stub-browser', fixturePassed: 48, applicationExecuted: 0, applicationSkipped: 36,
      viewportWidths: [375, 1280], retries: 0, productAcceptance: 'NOT_ESTABLISHED',
    })
  })
  it.each(['count', 'omitted', 'duplicate', 'skipped-fixture', 'failing-fixture', 'missing-reason', 'false-application-pass', 'retry', 'run-error'])(
    'rejects manufactured browser evidence: %s', alteration => {
      const report = syntheticReporterOutput()
      const first = report.suites[0].specs[0].tests[0]
      const application = report.suites[0].specs.at(-1)!.tests[0]
      if (alteration === 'count') report.stats.expected = 49
      if (alteration === 'omitted') report.suites[0].specs.pop()
      if (alteration === 'duplicate') report.suites[0].specs.push(report.suites[0].specs[0])
      if (alteration === 'skipped-fixture') first.results[0].status = 'skipped'
      if (alteration === 'failing-fixture') first.results[0].status = 'failed'
      if (alteration === 'missing-reason') application.annotations = []
      if (alteration === 'false-application-pass') application.results[0].status = 'passed'
      if (alteration === 'retry') first.results[0].retry = 1
      if (alteration === 'run-error') report.errors.push('Reporter failure')
      expect(() => validateBrowserReport(report)).toThrow('Invalid fixture browser report')
    },
  )
})
