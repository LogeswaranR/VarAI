import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import { UI_HOOKS } from '../../contracts/ui-hooks.ts'

const test = base.extend<{ isolated: void }>({
  isolated: [async ({ page, baseURL }, use) => {
    const requests: string[] = []
    const errors: string[] = []
    page.on('request', request => requests.push(request.url()))
    page.on('pageerror', error => errors.push(error.message))
    await use()
    expect(errors).toEqual([])
    expect(requests.every(url => new URL(url).origin === baseURL)).toBe(true)
    expect(requests.some(url => /^\/(?:graphql|api|health)(?:\/|$)/.test(new URL(url).pathname))).toBe(false)
  }, { auto: true }],
})

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(dimensions.width).toBe(test.info().project.use.viewport?.width)
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') })
  await page.goto('/src/review-room/preview/index.html')
  await expect(page.getByRole('heading', { name: 'Review room', exact: true })).toBeVisible()
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText('S1: Ready to play')
  await page.clock.pauseAt(new Date('2026-10-22T12:01:00Z'))
})

test('AC1/AC5/T02-AC2: keyboard selection, exact pause/resume, visible focus and live status', async ({ page }) => {
  await expect(page.getByLabel('Preview limitations')).toContainText('T02 TEST FIXTURES')
  await expect(page.getByText(/Placeholder —/)).toHaveCount(4)
  await page.keyboard.press('Tab')
  const selector = page.getByLabel('Choose scenario')
  await expect(selector).toBeFocused()
  await expect(selector).toHaveCSS('outline-style', 'solid')
  await expect(selector).toHaveCSS('outline-width', '3px')
  await selector.press('s')
  await selector.press('2')
  await expect(selector).toHaveValue('S2')
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText('S2: Ready to play')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCSS('outline-width', '3px')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('replay-stage')).toHaveText('Pass played')
  await page.clock.runFor(999)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText('Paused. Pass played')
  await page.clock.runFor(8000)
  await expect(page.getByRole('list', { name: 'Released replay events' }).getByRole('listitem')).toHaveCount(1)
  await noOverflow(page)
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.clock.runFor(1)
  await expect(page.getByTestId('replay-stage')).toHaveText('Receiver touch')
  await page.clock.runFor(3999)
  await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Not yet revealed')
  await page.clock.runFor(1)
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText('Replay complete. Review-ready')
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toHaveAttribute('role', 'status')
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByTestId(UI_HOOKS.reviewReady)).toHaveAttribute('aria-atomic', 'true')
  await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Goal confirmed')
  await expect(page.getByTestId('context-MATCH-SCORE-AFTER')).toHaveText('1 – 0')
  await noOverflow(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('replay-stage')).toHaveText('Before the pass')
  await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Not yet revealed')
  await noOverflow(page)
})

for (const [id, outcome, score] of [
  ['S1', 'Goal disallowed', '0 – 0'],
  ['S2', 'Goal confirmed', '1 – 0'],
  ['S3', 'Missing from supplied evidence', 'Missing from supplied evidence'],
]) {
  test(`AC1/AC2/T01-AC2: ${id} complete isolated replay, staged evidence and reset at both widths`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByLabel('Choose scenario').selectOption(id)
    await expect(page.getByTestId(UI_HOOKS.reviewReady)).toContainText(`${id}: Ready to play`)
    await expect(page.getByTestId('context-DECISION-ORIGINAL')).toHaveText('Not yet revealed')
    await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toHaveCount(0)
    await expect(page.getByTestId(UI_HOOKS.missingEvidence)).toHaveCount(0)
    await noOverflow(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    if (id === 'S3') {
      await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toContainText('Pass-time snapshot unavailable')
      await expect(page.getByTestId(UI_HOOKS.missingEvidence)).toContainText('explicitly mark missing evidence')
    }
    await page.clock.runFor(2999)
    await expect(page.getByTestId('context-DECISION-ORIGINAL')).toHaveText('Not yet revealed')
    await page.clock.runFor(1)
    await expect(page.getByTestId('context-DECISION-ORIGINAL')).toHaveText('Goal awarded')
    await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Not yet revealed')
    await expect(page.getByTestId('context-MATCH-SCORE-AFTER')).toHaveText('Not yet revealed')
    await noOverflow(page)
    await page.clock.runFor(1999)
    await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Not yet revealed')
    await page.clock.runFor(1)
    await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText(outcome)
    await expect(page.getByTestId('context-MATCH-SCORE-AFTER')).toHaveText(score)
    await expect(page.getByRole('list', { name: 'Released replay events' }).getByRole('listitem')).toHaveCount(6)
    await expect(page.getByText(/Placeholder —/)).toHaveCount(4)
    await noOverflow(page)
    if (id === 'S1') {
      await page.screenshot({
        path: fileURLToPath(new URL(`../.validation/replay-${test.info().project.name}.png`, import.meta.url)),
        fullPage: true,
      })
    }
    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await expect(page.getByTestId('replay-stage')).toHaveText('Before the pass')
    await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Not yet revealed')
    await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toHaveCount(0)
    await page.getByLabel('Choose scenario').selectOption(id === 'S1' ? 'S3' : 'S1')
    await expect(page.getByTestId('replay-stage')).toHaveText('Before the pass')
    await expect(page.getByRole('list', { name: 'Released replay events' })).toHaveCount(0)
    await noOverflow(page)
  })
}

test('scoped preview denies dummy secrets, own/nested Git metadata and paths outside this worktree', async ({ request }) => {
  const worktree = fileURLToPath(new URL('../../../../', import.meta.url))
  const directory = resolve(worktree, 'client/src/review-room/.validation/fs-probes')
  const sentinel = 'VAR102_NON_SECRET_DENIAL_PROBE'
  const fixtures = [
    '.env.preview-check', 'dummy.pem', '.npmrc', '.yarnrc.yml', 'metadata/.git/HEAD', 'metadata-file/.git',
  ]
  try {
    for (const name of fixtures) {
      const path = resolve(directory, name)
      await mkdir(resolve(path, '..'), { recursive: true })
      await writeFile(path, sentinel)
    }
    const deniedPaths = [
      ...fixtures.map(name => resolve(directory, name)),
      resolve(worktree, '.git'),
      resolve(worktree, '../../../../README.md'),
      resolve(worktree, '../../../../.git/HEAD'),
    ]
    for (const path of deniedPaths) {
      const response = await request.get(`/@fs${path}`)
      const body = await response.text()
      expect(response.status(), `denied path: ${path}`).toBe(403)
      expect(body.includes(sentinel)).toBe(false)
      expect(body.includes('gitdir:')).toBe(false)
      expect(body.includes('# VarAI')).toBe(false)
      expect(body.includes('ref: refs/heads/')).toBe(false)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
