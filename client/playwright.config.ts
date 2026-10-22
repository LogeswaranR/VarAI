import { defineConfig } from '@playwright/test'

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
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'chromium-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run dev:harness',
    url: 'http://127.0.0.1:4173/harness.html',
    reuseExistingServer: false,
    env: { PLAYWRIGHT_TEST: '1' },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
