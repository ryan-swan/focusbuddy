/**
 * E2E for the single persistent global sidebar. The four segment section headers
 * are present in every view, and the sidebar itself never disappears — including
 * inside a segment. Deep-linking a segment app swaps only the centre-panel content
 * while the menu stays put, and moving between two segments never hides the menu.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The persistent sidebar's PLEXIDESK wordmark heading is the stable anchor for
// "the single menu is still visible". Its own header renders it at h2.
function sidebar(window: Page) {
  return window.getByRole('heading', { name: /^plexidesk$/i, level: 2 }).first()
}

test.describe('persistent global sidebar', () => {
  let app: LaunchedApp
  let window: Page

  test.beforeAll(async () => {
    app = await launchApp()
    window = app.window
    await waitForReady(window)
  })
  test.afterAll(async () => {
    await app.dispose()
  })

  test('the four segment section headers are present from any view', async () => {
    for (const id of ['nav-plexidesk', 'nav-plexioffice', 'nav-plexipeople', 'nav-plexibrain']) {
      await expect(window.locator(`[data-testid="${id}"]`)).toBeVisible({ timeout: 8_000 })
    }
    await expect(sidebar(window)).toBeVisible()
  })

  test('sidenav-desk-plans shows the Plans view with the sidebar still visible', async () => {
    await window.locator('[data-testid="sidenav-desk-plans"]').click()
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })
    // The menu, including all four segment headers, is still present.
    await expect(sidebar(window)).toBeVisible()
    for (const id of ['nav-plexidesk', 'nav-plexioffice', 'nav-plexipeople', 'nav-plexibrain']) {
      await expect(window.locator(`[data-testid="${id}"]`)).toBeVisible()
    }
  })

  test('sidenav-office-docs shows the office docs area with the sidebar still visible', async () => {
    await window.locator('[data-testid="sidenav-office-docs"]').click()
    await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible({ timeout: 8_000 })
    await expect(sidebar(window)).toBeVisible()
  })

  test('sidenav-brain-search shows search with the sidebar still visible', async () => {
    await window.locator('[data-testid="sidenav-brain-search"]').click()
    await expect(window.locator('[data-testid="plexisearch-view"]')).toBeVisible({ timeout: 8_000 })
    await expect(sidebar(window)).toBeVisible()
  })

  test('navigating between two segments never hides the menu', async () => {
    // PlexiDesk plans → PlexiBrain search → PlexiPeople map → PlexiOffice docs.
    // After every hop the persistent sidebar and its section headers stay visible.
    const hops: { row: string; assert: string }[] = [
      { row: 'sidenav-desk-plans', assert: 'plexiprojects-view' },
      { row: 'sidenav-brain-search', assert: 'plexisearch-view' },
      { row: 'sidenav-people-map', assert: 'segment-plexipeople' },
      { row: 'sidenav-office-docs', assert: 'office-app-docs' }
    ]
    for (const hop of hops) {
      await window.locator(`[data-testid="${hop.row}"]`).click()
      await expect(window.locator(`[data-testid="${hop.assert}"]`)).toBeVisible({ timeout: 8_000 })
      await expect(sidebar(window)).toBeVisible()
      await expect(window.locator('[data-testid="nav-plexidesk"]')).toBeVisible()
    }
  })
})
