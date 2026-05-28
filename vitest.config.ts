import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit tests cover the deterministic, framework-free pieces: pure sorts, builders,
// hostname matchers. UI + Electron integration is handled by Playwright (see
// playwright.config.ts) — keep those concerns separated so vitest stays fast.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    globals: true
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  }
})
