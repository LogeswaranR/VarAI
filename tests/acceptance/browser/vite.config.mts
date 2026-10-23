import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  cacheDir: 'tests/acceptance/.cache/browser',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    hmr: false,
    watch: null,
    fs: { strict: true },
  },
  build: {
    outDir: 'tests/acceptance/artifacts/browser-dist',
    emptyOutDir: true,
    copyPublicDir: false,
    rolldownOptions: { input: 'tests/acceptance/browser/index.html' },
  },
})
