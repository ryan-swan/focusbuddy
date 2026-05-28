import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './_helpers'

// Smoke test — does the main window mount + the React tree render?
// Catches main-process crashes (DB init, IPC handler registration) and renderer
// boot failures (missing modules, unresolvable imports) that typecheck misses.
let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('app boots and renders the React shell', async () => {
  launched = await launchApp()
  const { window } = launched

  // The left sidebar's "FocusBuddy" wordmark sits at e16 in the page snapshot
  // — used as the canary that the React shell mounted past the loading state.
  // Strict-mode safe: there are two <aside> elements (left sidebar + right
  // assistant pane), so we anchor on the heading instead.
  await expect(
    window.getByRole('heading', { name: 'FocusBuddy', level: 2 })
  ).toBeVisible({ timeout: 10_000 })

  // window.api must be exposed via the contextBridge — otherwise renderer code
  // would silently fail every IPC call. Easier to catch here than later in a
  // store-level test.
  const hasApi = await window.evaluate(() => {
    return (
      typeof (window as unknown as { api?: object }).api === 'object' &&
      (window as unknown as { api?: object }).api !== null
    )
  })
  expect(hasApi).toBe(true)
})
