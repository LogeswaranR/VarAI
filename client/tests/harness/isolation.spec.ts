import { expect, test as base } from '@playwright/test'
import { UI_HOOKS } from '../../src/contracts/ui-hooks.ts'

const packages = ['VAR-102', 'VAR-103', 'VAR-104', 'VAR-106', 'VAR-107']
const test = base.extend<{ modelFree: void }>({
  modelFree: [async ({ page, baseURL }, use) => {
    const requests: string[] = []
    const errors: string[] = []
    page.on('request', request => requests.push(request.url()))
    page.on('pageerror', error => errors.push(error.message))
    await use()
    expect(errors).toEqual([])
    expect(requests.every(url => new URL(url).origin === baseURL)).toBe(true)
    expect(requests.some(url => /^\/(?:api|graphql|health)(?:\/|$)/.test(new URL(url).pathname))).toBe(false)
  }, { auto: true }],
})

test.beforeEach(async ({ page }) => {
  await page.goto('/harness.html')
  await expect(page.getByRole('heading', { name: 'VarAI isolated feature harness' })).toBeVisible()
})

test('VAR-108 - explicit placeholders, keyboard focus and responsive layout', async ({ page }) => {
  await expect(page.getByTestId(UI_HOOKS.syntheticBadge)).toHaveText('TEST HARNESS - SYNTHETIC STUBS ONLY')
  for (const id of packages) await expect(page.getByTestId(`placeholder-${id}`)).toBeVisible()
  await page.keyboard.press('Tab')
  const selector = page.getByLabel('Fixture scenario')
  await expect(selector).toBeFocused()
  await expect(selector).toHaveCSS('outline-style', 'solid')
  await expect(selector).toHaveCSS('outline-width', '3px')
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
  }))
  expect(dimensions.viewport).toBe(test.info().project.use.viewport?.width)
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
})

for (const id of packages) {
  test(`${id} - only the selected probe is mounted`, async ({ page }) => {
    await page.getByLabel('Mounted test probe').selectOption(id)
    await expect(page.getByTestId(`probe-${id}`)).toBeVisible()
    for (const other of packages.filter(value => value !== id)) {
      await expect(page.getByTestId(`placeholder-${other}`)).toBeVisible()
      await expect(page.getByTestId(`probe-${other}`)).toHaveCount(0)
    }
    const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(size[0]).toBeLessThanOrEqual(size[1])
  })
}

test('VAR-102 - scenario stub is independently callable', async ({ page }) => {
  await page.getByLabel('Mounted test probe').selectOption('VAR-102')
  await page.getByRole('button', { name: 'Exercise repository stub' }).click()
  await expect(page.getByText('3 synthetic summaries received')).toBeVisible()
})

test('VAR-103/104 - missing evidence and pre-ready context are explicit', async ({ page }) => {
  await page.getByLabel('Fixture scenario').selectOption('S3')
  await page.getByLabel('Mounted test probe').selectOption('VAR-103')
  await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toContainText('not revealed')
  await page.getByLabel('Fixture stage').selectOption('pass')
  await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toContainText('Pass-time snapshot unavailable')
  await page.getByLabel('Mounted test probe').selectOption('VAR-104')
  await expect(page.getByTestId(UI_HOOKS.missingEvidence)).toHaveText('Missing facts: 2')
  await expect(page.getByText('Context IDs:', { exact: false })).not.toContainText('DECISION-REVIEW')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await expect(page.getByText('Missing context values: 2')).toBeVisible()
})

test('VAR-106 - explicit simulated request and source event, no backend calls', async ({ page }) => {
  await page.getByLabel('Fixture scenario').selectOption('S3')
  await page.getByLabel('Mounted test probe').selectOption('VAR-106')
  await expect(page.getByRole('button', { name: 'Exercise explanation stub' })).toBeDisabled()
  await page.getByLabel('Probe audience').selectOption('ANALYST')
  await page.getByLabel('Probe source mode').selectOption('LIVE_AI')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await page.getByRole('button', { name: 'Exercise explanation stub' }).click()
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveText('STUB RESPONSE: S3 / ANALYST / LIVE_AI / LIMITED')
  await page.getByRole('button', { name: 'Emit source inspection' }).click()
  await expect(page.getByLabel('Source event')).toHaveText('F-PASS, F-BALL, F-POSITION')
})

test('VAR-106 - injected model error stays an error, never authored fallback', async ({ page }) => {
  await page.getByLabel('Mounted test probe').selectOption('VAR-106')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await page.getByLabel('Probe source mode').selectOption('LIVE_AI')
  await page.getByLabel('Injected explanation failure').selectOption('MODEL_NOT_CONFIGURED')
  await page.getByRole('button', { name: 'Exercise explanation stub' }).click()
  await expect(page.getByRole('alert')).toHaveText('STUB ERROR: MODEL_NOT_CONFIGURED; retryable: false')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
  await expect(page.getByLabel('Probe source mode')).toHaveValue('LIVE_AI')
})

test('VAR-107 - callback selects the pair and resets the fixture context', async ({ page }) => {
  await page.getByLabel('Mounted test probe').selectOption('VAR-107')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await page.getByRole('button', { name: 'Emit selection S2' }).click()
  await expect(page.getByLabel('Fixture scenario')).toHaveValue('S2')
  await expect(page.getByLabel('Fixture stage')).toHaveValue('before-pass')
  await expect(page.getByLabel('Scenario event')).toHaveText('S2')
  await page.getByLabel('Fixture scenario').selectOption('S3')
  await expect(page.getByTestId(UI_HOOKS.comparisonUnavailable)).toHaveText('S3 is not a comparison variant.')
  await expect(page.getByTestId(UI_HOOKS.comparisonToggle)).toHaveCount(0)
})
