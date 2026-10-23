import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

function port(name: string) {
  const value = Number(process.env[name])
  if (!Number.isInteger(value) || value < 1024 || value > 65535 || value === 4173) {
    throw new Error(`Set ${name} to a verified free loopback port, never 4173.`)
  }
  return value
}
const appPort = port('VARAI_APP_PORT')
const componentPort = port('VARAI_COMPONENT_PORT')
if (appPort === componentPort) throw new Error('Application and component-test ports must be distinct.')
const baseURL = `http://127.0.0.1:${appPort}`
const root = fileURLToPath(new URL('..', import.meta.url))
const published = fileURLToPath(new URL('../artifacts/publish/', import.meta.url))

export default defineConfig({
  testDir: './tests/integration',
  // The operator-gated spec needs a short decision window, so it runs under playwright.gated.config.ts with its own server.
  testIgnore: '**/match-centre-gated.spec.ts',
  outputDir: '../artifacts/local/browser-traces',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalTimeout: 300_000,
  timeout: 30_000,
  expect: { timeout: 8000 },
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../artifacts/local/browser-report.json', import.meta.url)) }]],
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'chromium-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: `dotnet ${JSON.stringify(`${published}VarAI.Server.dll`)} --contentRoot ${JSON.stringify(published)} --urls ${baseURL} --Explanations:LiveEnabled=false`,
      cwd: root,
      url: `${baseURL}/health`,
      reuseExistingServer: false,
      env: { ASPNETCORE_ENVIRONMENT: 'Production', DOTNET_ENVIRONMENT: 'Production' },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${componentPort} --strictPort`,
      url: `http://127.0.0.1:${componentPort}/tests/components/index.html`,
      reuseExistingServer: false,
      env: { PLAYWRIGHT_TEST: '1', VARAI_API_ORIGIN: baseURL },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
