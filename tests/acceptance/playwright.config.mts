import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.VAR108_PORT)
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 4173) {
  throw new Error('Set VAR108_PORT to an explicitly verified free loopback port, never the user preview port 4173.')
}
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './browser',
  outputDir: './artifacts/browser-traces',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalTimeout: 180_000,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('./artifacts/browser-report.json', import.meta.url)) }]],
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'chromium-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --config tests/acceptance/browser/vite.config.mts --port ${port} --strictPort`,
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    url: `${baseURL}/tests/acceptance/browser/index.html`,
    reuseExistingServer: false,
    env: { PLAYWRIGHT_TEST: '1' },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
