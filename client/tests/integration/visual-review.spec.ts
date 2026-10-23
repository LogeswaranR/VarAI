import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { applicationAdapter } from './application-adapter'
import { UI_HOOKS } from '../../src/contracts/ui-hooks'

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== baseURL) throw new Error('Visual review must remain local and model-free.')
    return route.continue()
  })
  page.on('pageerror', error => { throw error })
})

async function contrast(locator: Locator) {
  return locator.evaluate(element => {
    function colour(value: string) {
      const values = value.match(/[\d.]+/g)?.map(Number)
      if (!values || values.length < 3) throw new Error(`Unsupported computed colour: ${value}`)
      return { r: values[0]!, g: values[1]!, b: values[2]!, a: values[3] ?? 1 }
    }
    function background(node: Element | null): { r: number; g: number; b: number } {
      if (!node) return { r: 8, g: 14, b: 22 }
      const value = colour(getComputedStyle(node).backgroundColor)
      const behind = value.a === 1 ? value : background(node.parentElement)
      return {
        r: value.r * value.a + behind.r * (1 - value.a),
        g: value.g * value.a + behind.g * (1 - value.a),
        b: value.b * value.a + behind.b * (1 - value.a),
      }
    }
    function luminance(value: { r: number; g: number; b: number }) {
      const linear = (channel: number) => channel / 255 <= 0.04045
        ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4
      return 0.2126 * linear(value.r) + 0.7152 * linear(value.g) + 0.0722 * linear(value.b)
    }
    const text = luminance(colour(getComputedStyle(element).color))
    const surface = luminance(background(element))
    return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05)
  })
}

test('broadcast layout reflows at 320, 768 and 1440 pixels with readable critical text and usable controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await applicationAdapter.open(page, 'S1')
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    for (const selector of ['.app-brand', '.rr-intro', '.rr-status', '.rr-team strong', '.rr-eyebrow', '.rr-kicker',
      '.scene-description', '.source-mode-badge', '.reader-hint']) {
      expect(await contrast(page.locator(selector).first()), selector).toBeGreaterThanOrEqual(4.5)
    }
    for (const control of [page.getByTestId(UI_HOOKS.replayPlay), page.getByTestId(UI_HOOKS.scenarioSelect),
      page.getByRole('button', { name: '2D diagram', exact: true })]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
    await expect(page.locator('.rr-scene')).toHaveCSS('animation-name', 'none')
  }
})

test('Three.js renders a real local pitch, settles its camera and preserves explicit 2D access', async ({ page }) => {
  await applicationAdapter.open(page, 'S1')
  const canvas = page.getByTestId('three-pitch')
  await expect(canvas).toHaveAttribute('data-rendered', 'true')
  await page.clock.runFor(1000)
  await expect(canvas).toHaveAttribute('data-camera-motion', 'settled')
  expect(await canvas.evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected a rendered canvas.')
    const context = element.getContext('webgl2')
    return !!context && element.width > 0 && element.height > 0 && context.getError() === context.NO_ERROR
  })).toBe(true)
  await applicationAdapter.advanceToReady(page)
  await expect(page.getByRole('img', { name: 'Supplied pass-time positions' })).toBeVisible()
  await page.getByRole('button', { name: '2D diagram', exact: true }).click()
  await expect(canvas).toHaveCount(0)
  await expect(page.locator('[data-marker-role="RECEIVER"]')).toBeVisible()
  await expect(page.getByTestId('positional-reference')).toHaveCount(1)
  expect(await applicationAdapter.explanationRequestCount(page)).toBe(0)
  await page.screenshot({ path: test.info().outputPath('broadcast-2d-review-ready.png'), fullPage: true })
})

test('reduced motion keeps the 3D camera static and restarting preserves keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await applicationAdapter.open(page, 'S1')
  await expect(page.getByTestId('three-pitch')).toHaveAttribute('data-camera-motion', 'settled')
  await applicationAdapter.advanceToReady(page)
  const restart = page.getByTestId(UI_HOOKS.replayReset)
  await restart.focus()
  await restart.press('Enter')
  await expect(restart).toBeFocused()
  await expect(page.getByTestId('replay-stage')).toHaveText('Before the pass')
  await expect(page.getByTestId(UI_HOOKS.explainButton)).toBeDisabled()
  await expect(page.getByTestId('context-DECISION-REVIEW')).toHaveText('Not yet revealed')
  await expect(page.getByTestId('three-pitch')).toHaveAttribute('data-camera-motion', 'settled')
})

test('browsers without WebGL get a visible 2D fallback, never invented positions', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(globalThis, 'WebGL2RenderingContext', { value: undefined }) })
  await applicationAdapter.open(page, 'S3')
  await expect(page.getByText('3D is unavailable in this browser. Showing the supplied 2D diagram instead.')).toBeVisible()
  await expect(page.getByRole('button', { name: '3D pitch', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '2D diagram', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await applicationAdapter.advanceToReady(page)
  await expect(page.getByTestId(UI_HOOKS.missingSnapshot)).toBeVisible()
  await expect(page.locator('[data-marker-role]')).toHaveCount(0)
  await expect(page.getByTestId('positional-reference')).toHaveCount(0)
})

test('a real WebGL context loss switches visibly to the accessible 2D view', async ({ page }) => {
  await applicationAdapter.open(page, 'S1')
  const canvas = page.getByTestId('three-pitch')
  await expect(canvas).toHaveAttribute('data-rendered', 'true')
  await canvas.evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected a rendered canvas.')
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('The test browser does not support controlled context loss.')
    extension.loseContext()
  })
  await expect(page.getByText(/The 3D rendering context was lost/)).toBeVisible()
  await expect(page.getByRole('button', { name: '2D diagram', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveCount(0)
})

test('an unavailable lazy 3D bundle reports the failure and retains the 2D diagram', async ({ page }) => {
  await page.route('**/assets/Scene3D-*.js', route => route.abort('failed'))
  await applicationAdapter.open(page, 'S1')
  await expect(page.getByText('The 3D view could not load. Showing the supplied 2D diagram instead.')).toBeVisible()
  await expect(page.getByRole('button', { name: '2D diagram', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name: 'Pass-time positions unavailable' })).toBeVisible()
})
