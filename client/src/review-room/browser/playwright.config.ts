import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const port = Number(process.env.VAR102_PORT ?? '4182')
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 4173) {
  throw new Error('VAR102_PORT must be an unoccupied non-privileged port other than the canonical preview port 4173.')
}
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.browser.ts',
  outputDir: '../.validation/browser-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalTimeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: origin,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'review-room-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'review-room-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run dev -- --config src/review-room/validation.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    url: `${origin}/src/review-room/preview/index.html`,
    reuseExistingServer: false,
    env: { PLAYWRIGHT_TEST: '1' },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
