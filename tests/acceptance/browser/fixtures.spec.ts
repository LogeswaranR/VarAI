import { expect, test as base } from '@playwright/test'
import { UI_HOOKS } from '../../../client/src/contracts/ui-hooks'
import { audiences, errors, modes, scenarios } from '../model'

const test = base.extend<{ modelFree: void }>({
  modelFree: [async ({ page, baseURL }, use) => {
    const unexpected: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.name))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== baseURL || /^\/(?:graphql|api|health)(?:\/|$)/.test(url.pathname)) {
        unexpected.push(`${url.origin}${url.pathname}`)
        return route.abort('blockedbyclient')
      }
      return route.continue()
    })
    await use()
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  }, { auto: true }],
})

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/acceptance/browser/index.html')
  await expect(page.getByRole('heading', { name: 'VarAI isolated feature harness' })).toBeVisible()
})

test('fixture: visible provenance, keyboard focus, placeholders and exact viewport', async ({ page }) => {
  await expect(page.getByTestId(UI_HOOKS.syntheticBadge)).toHaveText('TEST HARNESS - SYNTHETIC STUBS ONLY')
  for (const id of ['102', '103', '104', '106', '107']) await expect(page.getByTestId(`placeholder-VAR-${id}`)).toBeVisible()
  await page.keyboard.press('Tab')
  const selector = page.getByLabel('Fixture scenario')
  await expect(selector).toBeFocused()
  await expect(selector).toHaveCSS('outline-style', 'solid')
  await expect(selector).toHaveCSS('outline-width', '3px')
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
  }))
  expect(dimensions.width).toBe(test.info().project.use.viewport?.width)
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
})

for (const scenario of scenarios) for (const audience of audiences) for (const mode of modes) {
  test(`fixture: ${scenario}/${audience}/${mode} explicit request, status and mode`, async ({ page }) => {
    await page.getByLabel('Fixture scenario').selectOption(scenario)
    await page.getByLabel('Mounted test probe').selectOption('VAR-106')
    await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
    await page.getByTestId(UI_HOOKS.audienceSelect).selectOption(audience)
    await page.getByTestId(UI_HOOKS.sourceModeSelect).selectOption(mode)
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
    await page.getByLabel('Fixture stage').selectOption('review-ready')
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
    await page.getByTestId(UI_HOOKS.explainButton).click()
    await expect(page.getByTestId(UI_HOOKS.explanationResult))
      .toHaveText(`STUB RESPONSE: ${scenario} / ${audience} / ${mode} / ${scenario === 'S3' ? 'LIMITED' : 'COMPLETE'}`)
    await expect(page.getByTestId(UI_HOOKS.sourceModeBadge)).toContainText(`TEST STUB MODE: ${mode}`)
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveAttribute('role', 'status')
    const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(size[0]).toBeLessThanOrEqual(size[1])
  })
}

for (const code of errors) {
  test(`fixture: injected ${code} has no success-shaped fallback`, async ({ page }) => {
    await page.getByLabel('Mounted test probe').selectOption('VAR-106')
    await page.getByLabel('Fixture stage').selectOption('review-ready')
    await page.getByTestId(UI_HOOKS.sourceModeSelect).selectOption('LIVE_AI')
    await page.getByLabel('Injected explanation failure').selectOption(code)
    await page.getByTestId(UI_HOOKS.explainButton).click()
    await expect(page.getByRole('alert')).toContainText(`STUB ERROR: ${code};`)
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
    await expect(page.getByTestId(UI_HOOKS.sourceModeSelect)).toHaveValue('LIVE_AI')
  })
}

test('fixture: missing facts, snapshot and gated outcome context stay explicit', async ({ page }) => {
  await page.getByLabel('Fixture scenario').selectOption('S3')
  await page.getByLabel('Mounted test probe').selectOption('VAR-103')
  await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toContainText('not revealed')
  await page.getByLabel('Fixture stage').selectOption('pass')
  await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toContainText('Pass-time snapshot unavailable')
  await page.getByLabel('Mounted test probe').selectOption('VAR-104')
  await expect(page.getByTestId(UI_HOOKS.missingEvidence)).toHaveText('Missing facts: 2')
  await expect(page.getByText('Context IDs:', { exact: false })).not.toContainText('DECISION-ORIGINAL')
  await page.getByLabel('Fixture stage').selectOption('goal')
  await expect(page.getByText('Context IDs:', { exact: false })).toContainText('DECISION-ORIGINAL')
  await expect(page.getByText('Context IDs:', { exact: false })).not.toContainText('DECISION-REVIEW')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await expect(page.getByText('Missing context values: 2')).toBeVisible()
})

test('fixture: same-scenario staged reset clears result and source selection', async ({ page }) => {
  await page.getByLabel('Mounted test probe').selectOption('VAR-106')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await page.getByTestId(UI_HOOKS.explainButton).click()
  await page.getByTestId(UI_HOOKS.claimSourceLink).click()
  await expect(page.getByLabel('Source event')).not.toHaveText('none')
  await page.getByLabel('Fixture stage').selectOption('before-pass')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
  await expect(page.getByLabel('Source event')).toHaveText('none')
  await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
})

test('fixture: scenario change and audience/mode changes clear mismatched output', async ({ page }) => {
  await page.getByLabel('Mounted test probe').selectOption('VAR-106')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await page.getByTestId(UI_HOOKS.explainButton).click()
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeVisible()
  await page.getByTestId(UI_HOOKS.audienceSelect).selectOption('ANALYST')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
  await page.getByTestId(UI_HOOKS.explainButton).click()
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toContainText('ANALYST')
  await page.getByTestId(UI_HOOKS.sourceModeSelect).selectOption('LIVE_AI')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
  await page.getByLabel('Fixture scenario').selectOption('S2')
  await expect(page.getByLabel('Fixture stage')).toHaveValue('before-pass')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveCount(0)
})

test('fixture: comparison callback is reversible and S3 exposes no variant', async ({ page }) => {
  await page.getByLabel('Mounted test probe').selectOption('VAR-107')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await page.getByRole('button', { name: 'Emit selection S2' }).click()
  await expect(page.getByLabel('Fixture scenario')).toHaveValue('S2')
  await expect(page.getByLabel('Fixture stage')).toHaveValue('before-pass')
  await page.getByLabel('Fixture stage').selectOption('review-ready')
  await page.getByRole('button', { name: 'Emit selection S1' }).click()
  await expect(page.getByLabel('Fixture scenario')).toHaveValue('S1')
  await expect(page.getByLabel('Fixture stage')).toHaveValue('before-pass')
  await page.getByLabel('Fixture scenario').selectOption('S3')
  await expect(page.getByTestId(UI_HOOKS.comparisonUnavailable)).toBeVisible()
  await expect(page.getByTestId(UI_HOOKS.comparisonToggle)).toHaveCount(0)
})
