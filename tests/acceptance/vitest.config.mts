import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  cacheDir: 'tests/acceptance/.cache/vitest',
  plugins: [react()],
  test: {
    include: ['tests/acceptance/**/*.test.{ts,tsx}'],
    exclude: ['tests/acceptance/artifacts/**'],
    environment: 'jsdom',
    setupFiles: ['client/src/test-setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    allowOnly: false,
    retry: 0,
  },
})
