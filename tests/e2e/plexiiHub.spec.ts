import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

// Plexii AI mission, Phase 1: the hub and its doors.
//
// The hub (view.kind 'plexii') is the existing conversational engine given a
// page in the main pane. These specs drive the three doors this phase built —
// the sidebar tab (with its recent-conversations sublist), the Home hero
// input, and the Home header button — and lock the one-ChatPanel invariant:
// while the hub page shows, the overlay pill is suppressed.
//
// No API key rides in e2e (stripped by _helpers), so a send takes the honest
// no-key path: the user turn renders, the assistant turn carries the failure.
// What matters here is navigation, seeding, persistence and suppression — not
// model output.

test.describe('Plexii hub (Phase 1)', () => {
  let launched: LaunchedApp

  // A fresh profile lands on the Suite launcher, not Home — the Home-door specs
  // walk there first, the way a user's saved view would.
  async function gotoHome(): Promise<void> {
    await launched.window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
      w.__fbView?.getState().goHome()
    })
    await launched.window.waitForTimeout(300)
  }

  test.beforeEach(async () => {
    launched = await launchApp()
    await waitForReady(launched.window)
  })

  test.afterEach(async () => {
    await launched.dispose()
  })

  test('sidebar tab opens the hub and suppresses the assistant pill', async () => {
    const { window } = launched
    // The pill exists before the hub is open (any non-hub screen).
    await expect(window.locator('[data-testid="assistant-pill"]')).toBeVisible()

    await window.locator('[data-testid="sidebar-plexii"]').click()
    await expect(window.locator('[data-testid="plexii-hub"]')).toBeVisible()
    // The hub hosts the real panel in its page dressing, rail included.
    await expect(window.locator('[data-testid="assistant-panel"]')).toBeVisible()
    await expect(window.locator('[data-testid="conversation-rail"]')).toBeVisible()
    // One ChatPanel instance: the overlay (pill and panel both) is suppressed.
    await expect(window.locator('[data-testid="assistant-pill"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="assistant-overlay"]')).toHaveCount(0)
    // Page mode is a place, not a dressing — no display-mode menu.
    await expect(window.locator('[data-testid="assistant-mode-toggle"]')).toHaveCount(0)
  })

  test('home hero input seeds a conversation and lands in the hub', async () => {
    const { window } = launched
    await gotoHome()
    const input = window.locator('[data-testid="start-or-ask-input"]')
    await input.waitFor({ state: 'visible' })
    await input.click()
    await input.fill('Plan a wedding')
    await window.locator('[data-testid="start-or-ask-go"]').click()

    // Landed on the hub with the typed message already sent as the first turn.
    await expect(window.locator('[data-testid="plexii-hub"]')).toBeVisible()
    await expect(window.locator('[data-testid="user-turn"]').first()).toContainText(
      'Plan a wedding'
    )
    // The send minted a persisted conversation; the hub's rail lists it.
    await expect(
      window.locator('[data-testid="conversation-row"]').first()
    ).toContainText('Plan a wedding', { timeout: 10_000 })
  })

  test('sidebar sublist shows recent conversations and reopens one', async () => {
    const { window } = launched
    // Seed one conversation through the hero door.
    await gotoHome()
    const input = window.locator('[data-testid="start-or-ask-input"]')
    await input.waitFor({ state: 'visible' })
    await input.fill('Track job applications')
    await window.locator('[data-testid="start-or-ask-go"]').click()
    await expect(window.locator('[data-testid="plexii-hub"]')).toBeVisible()
    // Wait for the conversation to persist and the shared store to refresh.
    await expect(
      window.locator('[data-testid="sidebar-plexii-conversation"]').first()
    ).toContainText('Track job applications', { timeout: 10_000 })

    // Walk away, then come back through the sublist row.
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
      w.__fbView?.getState().goHome()
    })
    await expect(window.locator('[data-testid="plexii-hub"]')).toHaveCount(0)
    await window.locator('[data-testid="sidebar-plexii-conversation"]').first().click()
    await expect(window.locator('[data-testid="plexii-hub"]')).toBeVisible()
    await expect(window.locator('[data-testid="user-turn"]').first()).toContainText(
      'Track job applications'
    )
  })

  test('home Ask button opens the hub, and leaving restores the pill', async () => {
    const { window } = launched
    await gotoHome()
    await window.locator('[data-testid="home-ask-brain"]').click()
    await expect(window.locator('[data-testid="plexii-hub"]')).toBeVisible()
    // Leave the hub: the overlay pill comes back exactly as it was.
    await window.evaluate(() => {
      const w = window as unknown as { __fbView?: { getState: () => { goHome: () => void } } }
      w.__fbView?.getState().goHome()
    })
    await expect(window.locator('[data-testid="assistant-pill"]')).toBeVisible()
  })
})
