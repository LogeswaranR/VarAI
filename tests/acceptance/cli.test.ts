// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateReport } from './report'

const root = process.cwd()
const cli = resolve(root, 'tests/acceptance/artifacts/runner/cli.mjs')
const badAdapter = resolve(root, 'tests/acceptance/artifacts/self-test/broken-adapter.mjs')

beforeAll(async () => {
  await mkdir(resolve(root, 'tests/acceptance/artifacts/self-test'), { recursive: true })
  await writeFile(badAdapter, `
import { createContractStubAdapter } from ${JSON.stringify(pathToFileURL(cli).href)};
export function createAdapter() {
  const adapter = createContractStubAdapter();
  adapter.client = { explain: async () => ({ __typename: 'ExplanationSuccess' }) };
  return adapter;
}
`, 'utf8')
})

afterAll(async () => { await unlink(badAdapter) })

describe('VAR-108 executable reporting', () => {
  it.each([
    ['contract-stub', [], 'positive', 0, 'PASS', 27, 0, 0],
    ['contract-stub', ['--adapter', badAdapter], 'invalid-output', 1, 'FAIL', 11, 16, 0],
    ['contract-stub', ['--adapter', 'tests/acceptance/artifacts/self-test/absent.mjs'], 'missing-explicit-adapter', 1, 'FAIL', 0, 27, 0],
    ['real-application', [], 'no-application', 2, 'INCOMPLETE', 0, 0, 27],
  ] as const)('persists a validated %s report (%s / %s), never manufacturing green', async (target, extra, name, code, outcome, passed, failed, blocked) => {
    const output = `tests/acceptance/artifacts/self-test/${name}.json`
    const child = spawnSync(process.execPath, [cli, '--target', target, ...extra, '--output', output], { cwd: root, encoding: 'utf8', timeout: 20_000 })
    expect(child.error).toBeUndefined()
    expect(child.stderr).toBe('')
    expect(child.status).toBe(code)
    const summary = JSON.parse(child.stdout)
    expect(Object.keys(summary).sort()).toEqual(['report', 'target', 'outcome', 'counts', 'productAcceptance', 'evidenceLabel'].sort())
    expect(summary).toMatchObject({ target, outcome, report: output, productAcceptance: 'NOT_ESTABLISHED' })
    const report: unknown = JSON.parse(await readFile(resolve(root, output), 'utf8'))
    validateReport(report)
    expect(report.counts).toMatchObject({ total: 27, PASS: passed, FAIL: failed, BLOCKED: blocked, matrix: 12, injectedFailures: 7 })
    expect(summary.counts).toEqual(report.counts)
  })

  it('exits nonzero for invalid invocation rather than choosing fixtures automatically', () => {
    const child = spawnSync(process.execPath, [cli], { cwd: root, encoding: 'utf8', timeout: 20_000 })
    expect(child.status).toBe(1)
    expect(child.stdout).toBe('')
    expect(child.stderr).toContain('No successful result is claimed')
  })
})
