/**
 * E2E test for the People Map view (PlexiDesk desktop).
 *
 * Boot scope: hermetic test DB (no signed-in session, no org, no people).
 * Goals:
 *   1. The "People Map" sidebar nav item exists and is clickable.
 *   2. After navigation data-testid="people-map" is visible.
 *   3. All three tab buttons are present (offices / global / hierarchy).
 *   4. With no session the view shows the honest "Sign in" empty state and
 *      renders NO fabricated people cards, office cards, or pins.
 *   5. Clicking each tab button does not throw a JS error.
 */
import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('People Map: mounts with honest empty state and no fake data in unauthenticated session', async () => {
  const { window, dispose } = await launchApp()
  const errors: string[] = []
  window.on('pageerror', (e) => errors.push(e.message))
  try {
    await waitForReady(window)

    // --- Navigate to People Map via sidebar ---
    // The Sidebar renders a NavRow (button) with text "People Map".
    // The HomeDashboard now also has a "People Map" quick-action button, so we
    // scope to the one that is NOT inside [data-testid="home-dashboard"] to
    // avoid a strict-mode violation.
    const navItem = window
      .getByRole('button', { name: 'People Map' })
      .filter({ hasNot: window.locator('[data-testid="home-dashboard"]') })
      .first()
    await expect(navItem).toBeVisible({ timeout: 8_000 })
    await navItem.click()

    // --- View root must be visible ---
    const root = window.locator('[data-testid="people-map"]')
    await expect(root).toBeVisible({ timeout: 8_000 })

    // --- All three tab buttons must be present ---
    await expect(window.locator('[data-testid="people-map-tab-offices"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="people-map-tab-global"]')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('[data-testid="people-map-tab-hierarchy"]')).toBeVisible({ timeout: 5_000 })

    // --- No session → honest "Sign in" empty state, NO fake people ---
    // The view short-circuits to the sign-in empty state when token is absent.
    await expect(window.getByText('Sign in to see your team')).toBeVisible({ timeout: 5_000 })

    // Confirm zero fabricated person rows (.pm-prow) and zero office cards (.pm-office).
    const personRows = window.locator('.pm-prow')
    await expect(personRows).toHaveCount(0, { timeout: 3_000 })
    const officeCards = window.locator('.pm-office')
    await expect(officeCards).toHaveCount(0, { timeout: 3_000 })
    // No map pins either.
    const pins = window.locator('.pm-pin')
    await expect(pins).toHaveCount(0, { timeout: 3_000 })

    // --- Clicking each tab must not throw ---
    // The empty state is rendered before the tab body, so the body content
    // changes only when there is actual data. Without data the empty state
    // persists across tab clicks, but clicking tabs must be error-free.
    await window.locator('[data-testid="people-map-tab-global"]').click()
    await window.locator('[data-testid="people-map-tab-hierarchy"]').click()
    await window.locator('[data-testid="people-map-tab-collaboration"]').click()
    await window.locator('[data-testid="people-map-tab-offices"]').click()

    // Allow a brief moment for any async reactions to settle.
    await window.waitForTimeout(400)

    // Still no fake data after tab cycling.
    await expect(window.locator('.pm-prow')).toHaveCount(0, { timeout: 3_000 })
    await expect(window.locator('.pm-office')).toHaveCount(0, { timeout: 3_000 })
    await expect(window.locator('.pm-pin')).toHaveCount(0, { timeout: 3_000 })

    // No JS errors during the whole interaction.
    expect(errors, `JS errors: ${errors.join('; ')}`).toHaveLength(0)
  } finally {
    await dispose()
  }
})
