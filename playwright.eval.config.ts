import { defineConfig } from '@playwright/test'

// plexi-brain I0 — the eval harness runs SEPARATELY from the e2e suite.
//
// Rationale: the e2e suite is a pass/fail correctness gate. The eval is a MEASUREMENT
// (a scorecard over the real corpus). Mixing them would either make quality scores block
// CI on day one — before any of the I1+ work that improves them — or bury the scorecard
// in e2e output. Same Electron launch machinery, separate entry point.
//
//   npm run brain:eval
export default defineConfig({
  testDir: 'tests/eval',
  timeout: 300_000, // 22 queries × real Electron launch + local embedding
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']]
})
