import { defineConfig } from '@playwright/test'

// Electron E2E config. We rely on @playwright/test's _electron API to launch
// the built app; tests live in tests/e2e/ and each test isolates its DB via
// FB_TEST_USER_DATA. No browser projects — only Electron.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // Each Electron instance grabs a lot of resources
  workers: 1,
  retries: 0,
  reporter: [['list']]
})
