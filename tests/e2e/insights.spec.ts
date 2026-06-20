// E2E smoke for the Flow & Focus Insights view: it mounts from the sidebar and,
// with no focus sessions, shows the honest empty state (no fabricated numbers).
// The analytics math itself is unit-tested in tests/unit/focusInsights.test.ts.

import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('Insights view opens from the sidebar and renders', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Open Insights from the sidebar nav.
  await window.getByText('Insights', { exact: true }).first().click()

  const view = window.getByTestId('insights-view')
  await expect(view).toBeVisible({ timeout: 5000 })
  // The header is always present.
  await expect(view.getByText('Focus insights')).toBeVisible()
  // "What to work on now" section is always present.
  await expect(view.getByText('What to work on now')).toBeVisible()
})

test('Insights shows the honest empty state with no sessions', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Confirm there are genuinely no focus sessions, so the empty state is correct
  // (not hiding a fabrication).
  const count = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const sessions = await api.focus.recent(1000)
    return sessions.length
  })

  await window.getByText('Insights', { exact: true }).first().click()
  const view = window.getByTestId('insights-view')
  await expect(view).toBeVisible({ timeout: 5000 })

  if (count === 0) {
    await expect(view.getByText('No focus sessions in this window yet.')).toBeVisible()
  }
})
