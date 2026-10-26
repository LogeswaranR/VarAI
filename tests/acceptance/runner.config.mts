import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  cacheDir: 'tests/acceptance/.cache/runner',
  build: {
    ssr: 'tests/acceptance/cli.ts',
    outDir: 'tests/acceptance/artifacts/runner',
    emptyOutDir: true,
    minify: false,
    rolldownOptions: { output: { entryFileNames: 'cli.mjs' } },
  },
})
