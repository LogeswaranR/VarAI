import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { ScenarioId } from '../../../client/src/contracts/graphql.generated'
import { UI_HOOKS } from '../../../client/src/contracts/ui-hooks'
import { audiences, modes, scenarios } from '../model'
import type { Access } from '../model'

export interface ApplicationBrowserAdapter {
  kind: 'real-application'
  live: Access
  open: (page: Page, scenario: ScenarioId) => Promise<void>
  advanceToReady: (page: Page) => Promise<void>
  explanationRequestCount: (page: Page) => Promise<number>
  deferNextExplanation: (page: Page) => Promise<{ releaseAndSettle: () => Promise<void> }>
  selectedSource: (page: Page) => Locator
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 40; index++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

export function registerApplicationChecks(adapter?: ApplicationBrowserAdapter) {
  const unavailable = 'NOT RUN: no explicit G01 application/browser adapter supplied. G00 probes are not replay, reader, source navigation or integrated acceptance.'
  for (const scenario of scenarios) for (const audience of audiences) for (const mode of modes) {
    test(`application: ${scenario}/${audience}/${mode} journey`, async ({ page }) => {
      test.skip(!adapter, unavailable)
      if (!adapter) return
      expect(adapter.kind).toBe('real-application')
      test.skip(mode === 'LIVE_AI' && !adapter.live.available,
        adapter.live.available ? 'Live access is required.' : adapter.live.reason)
      await adapter.open(page, scenario)
      await expect(page.getByTestId(UI_HOOKS.syntheticBadge)).toBeVisible()
      await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
      const before = await adapter.explanationRequestCount(page)
      await page.getByTestId(UI_HOOKS.audienceSelect).selectOption(audience)
      await page.getByTestId(UI_HOOKS.sourceModeSelect).selectOption(mode)
      await adapter.advanceToReady(page)
      expect(await adapter.explanationRequestCount(page)).toBe(before)
      await page.getByTestId(UI_HOOKS.explainButton).click()
      await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeVisible()
      await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeVisible()
      await expect(page.getByTestId(UI_HOOKS.sourceModeBadge)).toBeVisible()
      expect(await adapter.explanationRequestCount(page)).toBe(before + 1)
      if (scenario === 'S3') {
        await expect(page.getByTestId(UI_HOOKS.missingEvidence)).toBeVisible()
        await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toBeVisible()
      }
    })
  }
  test('application: same-scenario replay reset clears explanation and recap', async ({ page }) => {
    test.skip(!adapter, unavailable)
    if (!adapter) return
    await adapter.open(page, 'S1')
    await adapter.advanceToReady(page)
    await page.getByTestId(UI_HOOKS.explainButton).click()
    await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeVisible()
    await page.getByTestId(UI_HOOKS.replayReset).click()
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
    await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeHidden()
    await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
    await adapter.advanceToReady(page)
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
  })
  test('application: delayed response cannot restore a reset result or recap', async ({ page }) => {
    test.skip(!adapter, unavailable)
    if (!adapter) return
    await adapter.open(page, 'S1')
    await adapter.advanceToReady(page)
    const pending = await adapter.deferNextExplanation(page)
    const count = await adapter.explanationRequestCount(page)
    await page.getByTestId(UI_HOOKS.explainButton).click()
    await expect(page.getByTestId(UI_HOOKS.explanationLoading)).toBeVisible()
    await expect.poll(() => adapter.explanationRequestCount(page)).toBe(count + 1)
    await page.getByTestId(UI_HOOKS.replayReset).click()
    await pending.releaseAndSettle()
    await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
    await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeHidden()
    await expect(page.getByTestId(UI_HOOKS.explanationError)).toBeHidden()
  })
  for (const control of ['audience', 'mode'] as const) {
    test(`application: delayed response stays invalid after a ${control} round-trip`, async ({ page }) => {
      test.skip(!adapter, unavailable)
      if (!adapter) return
      await adapter.open(page, 'S1')
      await adapter.advanceToReady(page)
      const pending = await adapter.deferNextExplanation(page)
      const count = await adapter.explanationRequestCount(page)
      await page.getByTestId(UI_HOOKS.explainButton).click()
      await expect(page.getByTestId(UI_HOOKS.explanationLoading)).toBeVisible()
      await expect.poll(() => adapter.explanationRequestCount(page)).toBe(count + 1)
      const selector = page.getByTestId(control === 'audience' ? UI_HOOKS.audienceSelect : UI_HOOKS.sourceModeSelect)
      await selector.selectOption(control === 'audience' ? 'ANALYST' : 'LIVE_AI')
      await selector.selectOption(control === 'audience' ? 'CASUAL' : 'AUTHORED')
      expect(await adapter.explanationRequestCount(page)).toBe(count + 1)
      await pending.releaseAndSettle()
      await expect(page.getByTestId(UI_HOOKS.explanationResult)).toBeHidden()
      await expect(page.getByTestId(UI_HOOKS.recapPanel)).toBeHidden()
    })
  }
  test('application: keyboard source navigation, visible focus and responsive presentation', async ({ page }) => {
    test.skip(!adapter, unavailable)
    if (!adapter) return
    await adapter.open(page, 'S1')
    await adapter.advanceToReady(page)
    await page.getByTestId(UI_HOOKS.explainButton).click()
    const source = page.getByTestId(UI_HOOKS.claimSourceLink).first()
    await expect(source).toBeVisible()
    await tabTo(page, source)
    await source.press('Enter')
    const target = adapter.selectedSource(page)
    await expect(target).toBeFocused()
    expect(await target.evaluate(element => {
      const style = getComputedStyle(element)
      return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none'
    })).toBe(true)
    const size = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(size[0]).toBe(test.info().project.use.viewport?.width)
    expect(size[1]).toBeLessThanOrEqual(size[2])
  })
  test('application: comparison is reversible, resets replay and is unavailable for S3', async ({ page }) => {
    test.skip(!adapter, unavailable)
    if (!adapter) return
    await adapter.open(page, 'S1')
    await adapter.advanceToReady(page)
    await page.getByTestId(UI_HOOKS.comparisonToggle).click()
    await expect(page.getByTestId(UI_HOOKS.scenarioSelect)).toHaveValue('S2')
    await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
    await adapter.advanceToReady(page)
    await page.getByTestId(UI_HOOKS.comparisonToggle).click()
    await expect(page.getByTestId(UI_HOOKS.scenarioSelect)).toHaveValue('S1')
    await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
    await adapter.open(page, 'S3')
    await expect(page.getByTestId(UI_HOOKS.comparisonUnavailable)).toBeVisible()
    await expect(page.getByTestId(UI_HOOKS.comparisonToggle)).toBeHidden()
  })
}
