import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ApplicationBrowserAdapter } from '../../../tests/acceptance/browser/application-checks'
import { UI_HOOKS } from '../../src/contracts/ui-hooks'

const counts = new WeakMap<Page, number>()

export const applicationAdapter: ApplicationBrowserAdapter = {
  kind: 'real-application',
  live: { available: false, reason: 'NOT RUN: paid live smoke is not authorised. This published test host has Explanations:LiveEnabled=false.' },
  async open(page, scenario) {
    if (!counts.has(page)) {
      counts.set(page, 0)
      await page.clock.install()
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/graphql' && request.postDataJSON()?.operationName === 'Explain') {
          counts.set(page, (counts.get(page) ?? 0) + 1)
        }
      })
    }
    await page.goto(`/?scenario=${scenario}`)
    await expect(page.getByTestId(UI_HOOKS.scenarioSelect)).toHaveValue(scenario)
    await expect(page.getByTestId(UI_HOOKS.replayPlay)).toBeVisible()
  },
  async advanceToReady(page) {
    await page.getByTestId(UI_HOOKS.replayPlay).click()
    await page.clock.fastForward(6500)
    await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText('Review-ready')
  },
  async explanationRequestCount(page) { return counts.get(page) ?? 0 },
  selectedSource(page) { return page.locator('[data-source-id][data-selected]').first() },
  async deferNextExplanation(page) {
    let release!: () => void
    let started!: () => void
    let settled!: () => void
    const released = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { started = resolve })
    const finished = new Promise<void>(resolve => { settled = resolve })
    let used = false
    await page.route('**/graphql', async route => {
      if (used || route.request().postDataJSON()?.operationName !== 'Explain') return route.continue()
      used = true
      const response = await route.fetch()
      started()
      await released
      try { await route.fulfill({ response }) } finally { settled() }
    })
    return {
      async releaseAndSettle() {
        await entered
        release()
        await finished
        await page.clock.runFor(50)
      },
    }
  },
}
