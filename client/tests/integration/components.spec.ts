import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { UI_HOOKS } from '../../src/contracts/ui-hooks'
import { rules } from '../../src/contracts/rules.generated'

const origin = `http://127.0.0.1:${process.env.VARAI_COMPONENT_PORT}`
const fixtures = JSON.parse(readFileSync(new URL('../../../tests/contract-stubs/scenarios.json', import.meta.url), 'utf8')) as
  { id: string; diagram: { textAlternative: string } }[]
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || /^\/(api|graphql|health)(\/|$)/.test(url.pathname)) {
      throw new Error('Isolated component fixtures must not call a backend or external service.')
    }
    return route.continue()
  })
  page.on('pageerror', error => { throw error })
})
test.afterEach(async ({ page }) => {
  const size = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(size[0]).toBe(test.info().project.use.viewport?.width)
  expect(size[1]).toBeLessThanOrEqual(size[2])
})
const url = (parameters: string) => `${origin}/tests/components/index.html?${parameters}`

for (const scenario of ['S1', 'S2', 'S3']) test(`VAR-103 isolated ${scenario} and unrevealed snapshot`, async ({ page }) => {
  await page.goto(url(`panel=scene&scenario=${scenario}&stage=before-pass`))
  await expect(page.getByTestId(UI_HOOKS.scenePanel)).toContainText('Not yet revealed')
  await expect(page.locator('[data-marker-role]')).toHaveCount(0)
  await page.goto(url(`panel=scene&scenario=${scenario}`))
  await expect(page.getByText('Synthetic · illustrative snapshot')).toBeVisible()
  await expect(page.getByRole('img')).toHaveAccessibleDescription(fixtures.find(item => item.id === scenario)!.diagram.textAlternative)
  if (scenario === 'S3') {
    await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toBeVisible()
    await expect(page.locator('[data-marker-role]')).toHaveCount(0)
    await expect(page.getByTestId('positional-reference')).toBeHidden()
  } else {
    await expect(page.locator('[data-marker-role="RECEIVER"]')).toBeVisible()
    const reference = page.getByTestId('positional-reference')
    await expect(reference).toHaveCount(1)
    // A vertical SVG line has a zero-width geometry box even when its stroke is painted.
    expect(await reference.evaluate(element => {
      const style = getComputedStyle(element)
      return element.getBoundingClientRect().height > 0 && style.stroke !== 'none' &&
        parseFloat(style.strokeWidth) > 0 && style.visibility === 'visible' && style.opacity !== '0'
    })).toBe(true)
    const receiver = await page.locator('[data-marker-role="RECEIVER"]').getAttribute('transform')
    await page.goto(url(`panel=scene&scenario=${scenario === 'S1' ? 'S2' : 'S1'}`))
    expect(await page.locator('[data-marker-role="RECEIVER"]').getAttribute('transform')).not.toBe(receiver)
  }
})

test('VAR-104 isolated keyboard reference focus, missing and unknown IDs', async ({ page }) => {
  await page.goto(url('panel=evidence&scenario=S3'))
  await expect(page.getByTestId(UI_HOOKS.missingEvidence)).toBeVisible()
  await page.keyboard.press('Tab')
  const first = page.getByRole('link', { name: /^F-PASS\s*:/ })
  await expect(first).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-source-id="F-PASS"]')).toBeFocused()
  await expect(page.locator('[data-source-id="F-PASS"]')).toHaveCSS('outline-style', 'solid')
  await page.goto(url('panel=evidence&scenario=S1&reference=unknown-source'))
  await expect(page.getByRole('alert')).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('Reference unavailable')
  await page.goto(url('panel=evidence&scenario=S1&stage=before-pass&reference=F-PASS'))
  await expect(page.getByRole('alert')).toContainText('not yet revealed')
})

test('VAR-107 isolated keyboard selection, restoration and S3 limitation', async ({ page }) => {
  await page.goto(url('panel=comparison&scenario=S1'))
  await page.keyboard.press('Tab')
  await expect(page.getByTestId(UI_HOOKS.comparisonToggle)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Component callback')).toContainText('S2')
  await page.getByTestId(UI_HOOKS.comparisonToggle).press('Enter')
  await expect(page.getByLabel('Component callback')).toContainText('S1')
  await page.goto(url('panel=comparison&scenario=S3'))
  await expect(page.getByTestId(UI_HOOKS.comparisonUnavailable)).toContainText('missing position evidence')
  await expect(page.getByTestId(UI_HOOKS.comparisonToggle)).toBeHidden()
})

test('VAR-106 isolated keyboard generation, citation callback and limited recap', async ({ page }) => {
  await page.goto(url('panel=explanation&scenario=S3'))
  await page.keyboard.press('Tab')
  await expect(page.getByTestId(UI_HOOKS.audienceSelect)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId(UI_HOOKS.sourceModeSelect)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toHaveAttribute('data-status', 'LIMITED')
  await expect(page.getByTestId(UI_HOOKS.recapPanel)).toContainText('No final score is inferred')
  await page.getByTestId(UI_HOOKS.claimSourceLink).first().press('Enter')
  await expect(page.getByLabel('Component callback')).toContainText('F-PASS')
})

for (const [code, retryable] of Object.entries(rules.retryable)) test(`VAR-106 isolated ${code} error presentation`, async ({ page }) => {
  await page.goto(url(`panel=explanation&scenario=S1&error=${code}`))
  await page.getByTestId(UI_HOOKS.explainButton).click()
  await expect(page.getByTestId(UI_HOOKS.explanationError)).toContainText(code)
  await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
  if (retryable) await expect(page.getByTestId(UI_HOOKS.explainButton)).toHaveText('Retry explanation')
  else await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
})
