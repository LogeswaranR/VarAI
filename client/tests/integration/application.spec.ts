import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { registerApplicationChecks } from '../../../tests/acceptance/browser/application-checks'
import { applicationAdapter } from './application-adapter'
import { UI_HOOKS } from '../../src/contracts/ui-hooks'
import { rules } from '../../src/contracts/rules.generated'
import type { ErrorCode } from '../../src/contracts/graphql.generated'

const faults = Object.keys(rules.retryable) as ErrorCode[]

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== baseURL) throw new Error('Unexpected external request in local application check.')
    return route.continue()
  })
  page.on('pageerror', error => { throw error })
})

registerApplicationChecks(applicationAdapter)

test('real application acceptance adapter records authored evidence and unavailable gates separately', async ({ baseURL }) => {
  const child = spawnSync(process.execPath, [
    'tests/acceptance/artifacts/runner/cli.mjs', '--target', 'real-application',
    '--adapter', 'tests/acceptance/artifacts/application-adapter/adapter.mjs',
  ], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    env: { VARAI_APPLICATION_URL: baseURL!, TMPDIR: process.env.TMPDIR },
    encoding: 'utf8', timeout: 20_000,
  })
  expect(child.error).toBeUndefined()
  expect(child.stderr).toBe('')
  expect(child.status).toBe(2)
  expect(JSON.parse(child.stdout)).toMatchObject({
    target: 'real-application', outcome: 'INCOMPLETE', productAcceptance: 'NOT_ESTABLISHED',
    counts: { PASS: 8, FAIL: 0, BLOCKED: 7, SKIPPED: 12 },
  })
})

test('published process serves real client, health and GraphQL while missing routes remain 404', async ({ page, request }) => {
  await applicationAdapter.open(page, 'S1')
  await expect(page.getByText(/Placeholder|scaffold only/i)).toHaveCount(0)
  expect((await request.get('/health')).status()).toBe(200)
  expect((await request.get('/')).headers()['content-type']).toContain('text/html')
  const assets = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('src') ?? element.getAttribute('href')!))
  expect(assets.length).toBeGreaterThanOrEqual(2)
  for (const asset of assets) {
    const response = await request.get(asset)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain(asset.endsWith('.css') ? 'text/css' : 'javascript')
  }
  for (const path of ['/api/explanations', '/assets/not-found.js', '/assets/not-found', '/graphql/not-found']) {
    const response = await request.get(path)
    expect(response.status()).toBe(404)
    expect(response.headers()['content-type'] ?? '').not.toContain('text/html')
  }
})

test('real unconfigured Live AI request is MODEL_NOT_CONFIGURED, not simulated success or authored fallback', async ({ page }) => {
  await applicationAdapter.open(page, 'S1')
  await page.getByTestId(UI_HOOKS.sourceModeSelect).selectOption('LIVE_AI')
  await applicationAdapter.advanceToReady(page)
  expect(await applicationAdapter.explanationRequestCount(page)).toBe(0)
  await page.getByTestId(UI_HOOKS.explainButton).click()
  await expect(page.getByTestId(UI_HOOKS.explanationError)).toContainText('MODEL_NOT_CONFIGURED')
  await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
  await expect(page.getByTestId(UI_HOOKS.sourceModeSelect)).toHaveValue('LIVE_AI')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
  await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeHidden()
  expect(await applicationAdapter.explanationRequestCount(page)).toBe(1)
})

for (const code of faults) test(`simulated HTTP fault (not provider observation): ${code} respects retry policy`, async ({ page }) => {
  const ids: string[] = []
  await applicationAdapter.open(page, 'S1')
  await page.route('**/graphql', async route => {
    const body = route.request().postDataJSON()
    if (body?.operationName !== 'Explain') return route.continue()
    ids.push(body.variables.input.requestId)
    await route.fulfill({ contentType: 'application/graphql-response+json', json: { data: { explain: {
      __typename: 'ContractError', schemaVersion: '0.2', requestId: body.variables.input.requestId,
      status: 'ERROR', code, message: `Simulated ${code}; not an observed provider incident.`, retryable: rules.retryable[code],
    } } } })
  })
  await page.getByTestId(UI_HOOKS.sourceModeSelect).selectOption('LIVE_AI')
  await applicationAdapter.advanceToReady(page)
  await page.getByTestId(UI_HOOKS.explainButton).click()
  await expect(page.getByTestId(UI_HOOKS.explanationError)).toContainText(code)
  await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeHidden()
  expect(ids).toHaveLength(1)
  if (rules.retryable[code]) {
    await page.getByTestId(UI_HOOKS.explainButton).click()
    await expect(page.getByTestId(UI_HOOKS.explanationError)).toBeVisible()
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  } else await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
  await expect(page.getByTestId(UI_HOOKS.sourceModeSelect)).toHaveValue('LIVE_AI')
})

for (const fault of ['HTTP', 'media-type', 'partial-data', 'unknown-citation'] as const) {
  test(`simulated invalid transport: ${fault} never displays explanation or recap`, async ({ page }) => {
    await applicationAdapter.open(page, 'S1')
    await page.route('**/graphql', async route => {
      if (route.request().postDataJSON()?.operationName !== 'Explain') return route.continue()
      if (fault === 'HTTP') return route.fulfill({ status: 503, body: 'Simulated unavailable transport' })
      if (fault === 'media-type') return route.fulfill({ contentType: 'text/html', body: '<html>Not GraphQL</html>' })
      const response = await route.fetch()
      const payload = await response.json()
      if (fault === 'partial-data') payload.errors = [{ message: 'Simulated partial execution error' }]
      else payload.data.explain.headline.evidenceIds = ['unknown-citation']
      return route.fulfill({ contentType: 'application/graphql-response+json', json: payload })
    })
    await applicationAdapter.advanceToReady(page)
    await page.getByTestId(UI_HOOKS.explainButton).click()
    await expect(page.getByTestId(UI_HOOKS.explanationError)).toBeVisible()
    await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeHidden()
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
  })
}

test('real-time replay pause/resume preserves staging and reduced-motion layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?scenario=S1')
  await expect(page.getByTestId(UI_HOOKS.replayPlay)).toBeVisible()
  await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Not yet revealed')
  await expect(page.getByTestId('positional-reference')).toBeHidden()
  await page.getByTestId(UI_HOOKS.replayPlay).click()
  await expect(page.getByTestId('replay-stage')).toHaveText('Receiver touch')
  await page.getByTestId(UI_HOOKS.replayPause).click()
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText('Paused')
  await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
  await page.getByTestId(UI_HOOKS.replayPlay).click()
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText('Review-ready')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
  await page.screenshot({ path: test.info().outputPath('published-review-ready.png'), fullPage: true })
})

test('unavailable selection and load failure are explicit, recoverable and never substituted', async ({ page }) => {
  await page.goto('/?scenario=S99')
  await expect(page.getByRole('alert')).toContainText('INVALID_REQUEST: Invalid scenario selection.')
  await expect(page.getByTestId(UI_HOOKS.scenePanel)).toBeHidden()
  await page.route('**/graphql', route => route.fulfill({ status: 503, body: 'Simulated unavailable local server' }))
  await page.getByRole('button', { name: 'Reload scenario choices' }).click()
  await expect(page.getByRole('alert')).toContainText('LOAD_FAILED')
  await expect(page.getByTestId(UI_HOOKS.scenePanel)).toBeHidden()
  await page.unroute('**/graphql')
  await page.getByRole('button', { name: 'Reload scenario choices' }).click()
  await page.getByTestId(UI_HOOKS.scenarioSelect).selectOption('S1')
  await expect(page.getByTestId(UI_HOOKS.replayPlay)).toBeVisible()
})
