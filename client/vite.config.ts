import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: process.env.PLAYWRIGHT_TEST === '1' ? false : undefined,
    watch: process.env.PLAYWRIGHT_TEST === '1' ? null : undefined,
    proxy: {
      '/health': process.env.VARAI_API_ORIGIN ?? 'http://127.0.0.1:5074',
      '/api': process.env.VARAI_API_ORIGIN ?? 'http://127.0.0.1:5074',
      '/graphql': process.env.VARAI_API_ORIGIN ?? 'http://127.0.0.1:5074',
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
