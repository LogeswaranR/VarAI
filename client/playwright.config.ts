import { defineConfig } from '@playwright/test'

const port = Number(process.env.VARAI_HARNESS_PORT ?? 43174)
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 4173) {
  throw new Error('Choose a verified free VARAI_HARNESS_PORT, never the canonical preview port 4173.')
}
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/harness',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalTimeout: 180_000,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'chromium-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run dev:harness -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/harness.html`,
    reuseExistingServer: false,
    env: { PLAYWRIGHT_TEST: '1' },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
