/**
 * E2E: SyncIndicator boots 'disabled' with no signed-in account.
 * Backing contract: stores/syncStatus.ts (default state 'disabled') +
 * components/SyncIndicator.tsx (data-sync-state attribute + 'Saved locally' label).
 * The signed-in 'ok' transition is covered at the HTTP/store layer by
 * tests/unit/syncStatus.test.ts and the live cross-member flow in
 * orgSyncCrossMember.spec.ts / calendarSync.spec.ts; driving a full signed-in
 * renderer session into 'ok' here would hit the same file:// vs http:// mixed
 * content wall documented in calendarSync.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('SyncIndicator shows disabled/"Saved locally" with no account signed in', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    // The sidebar (and SyncIndicator inside it) renders alongside the ordinary
    // workspace views; the initial landing view is the suite hub, which does not.
    // The footer sync chip is always rendered (unlike the sidebar SyncIndicator,
    // which only shows on classic desk views). No navigation needed.
    await window.waitForTimeout(300)
    const indicator = window.locator('[data-testid="footer-sync-chip"]')
    await expect(indicator).toBeVisible()
    await expect(indicator).toHaveAttribute('data-sync-state', 'disabled')
    await expect(indicator).toContainText('Saved locally')
  } finally {
    await dispose()
  }
})
