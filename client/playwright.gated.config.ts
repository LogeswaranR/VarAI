import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Operator-gated integration spec against the real published server. It needs a short decision window so that approving,
// holding and the automatic hold all happen inside one test, so it has its own server and is not part of the default
// `npm run test:integration` run (that config ignores it). Build first with `npm run publish`, then, from the repository root:
//   VARAI_APP_PORT=<free port> npm run test:integration --workspace @varai/client -- --config playwright.gated.config.ts
function port(name: string) {
  const value = Number(process.env[name])
  if (!Number.isInteger(value) || value < 1024 || value > 65535 || value === 4173) {
    throw new Error(`Set ${name} to a verified free loopback port, never 4173.`)
  }
  return value
}
const appPort = port('VARAI_APP_PORT')
const baseURL = `http://127.0.0.1:${appPort}`
const root = fileURLToPath(new URL('..', import.meta.url))
const published = fileURLToPath(new URL('../artifacts/publish/', import.meta.url))

// The spec skips itself under any other config, because it assumes the short window below.
process.env.VARAI_GATED_SERVER = '1'

export default defineConfig({
  testDir: './tests/integration',
  testMatch: 'match-centre-gated.spec.ts',
  outputDir: './test-results/gated',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  globalTimeout: 300_000,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'chromium-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `dotnet ${JSON.stringify(`${published}VarAI.Server.dll`)} --contentRoot ${JSON.stringify(published)} --urls ${baseURL} --Explanations:LiveEnabled=false --Narration:Enabled=false --Gate:SlaSeconds=6 --Gate:NarrationWait=00:00:02 --Gate:TickInterval=00:00:00.100`,
    cwd: root,
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    env: { ASPNETCORE_ENVIRONMENT: 'Production', DOTNET_ENVIRONMENT: 'Production' },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
