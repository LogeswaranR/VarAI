import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  cacheDir: 'tests/acceptance/.cache/application-adapter',
  build: {
    ssr: 'tests/acceptance/application-adapter.ts',
    outDir: 'tests/acceptance/artifacts/application-adapter',
    emptyOutDir: true,
    minify: false,
    rolldownOptions: { output: { entryFileNames: 'adapter.mjs' } },
  },
})
