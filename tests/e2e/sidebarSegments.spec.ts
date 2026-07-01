/**
 * E2E for the left-sidebar segment navigation. The single global sidebar is now
 * the one persistent menu, shown in every view including inside segments. It has
 * four labelled, collapsible sections, one per segment (PlexiDesk, PlexiOffice,
 * PlexiPeople, PlexiBrain). Each header carries the legacy nav-* testid and opens
 * that segment's home in the centre panel; under it every app is an indented
 * sub-item that deep-links into the segment with that app preselected — and the
 * sidebar itself never disappears.
 *
 * This spec asserts the four headers render, a section's app rows are present when
 * expanded and hidden when collapsed, and that representative sub-items deep-link
 * to the right centre-panel content (Plans, office Docs, Brain Search, People map)
 * while the sidebar stays visible.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The persistent sidebar's own PLEXIDESK wordmark heading — a stable anchor to
// assert the menu is still present after any navigation.
function sidebar(window: Page) {
  return window.getByRole('heading', { name: /^plexidesk$/i, level: 2 }).first()
}

test.describe('sidebar segment navigation', () => {
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

  test('the four segment section headers render with their legacy testids', async () => {
    for (const id of ['nav-plexidesk', 'nav-plexioffice', 'nav-plexipeople', 'nav-plexibrain']) {
      await expect(window.locator(`[data-testid="${id}"]`)).toBeVisible({ timeout: 8_000 })
    }
  })

  test('an expanded section shows its app rows; collapsing hides them', async () => {
    // PlexiDesk defaults open, so its app rows are present inline.
    await expect(window.locator('[data-testid="sidenav-desk-plans"]')).toBeVisible()
    await expect(window.locator('[data-testid="sidenav-desk-tasks"]')).toBeVisible()
    // The collapse chevron sits just before the header; collapsing hides rows.
    const collapse = window.locator('[title="Collapse PlexiDesk"]')
    await expect(collapse).toBeVisible()
    await collapse.click()
    await expect(window.locator('[data-testid="sidenav-desk-plans"]')).toHaveCount(0)
    // Expand again so later tests see the rows.
    await window.locator('[title="Expand PlexiDesk"]').click()
    await expect(window.locator('[data-testid="sidenav-desk-plans"]')).toBeVisible()
  })

  test('clicking a segment header opens that segment home in the centre panel', async () => {
    await window.locator('[data-testid="nav-plexidesk"]').click()
    // The segment content renders in the centre panel; the sidebar stays put.
    await expect(window.locator('[data-testid="segment-plexidesk"]')).toBeVisible({ timeout: 8_000 })
    await expect(sidebar(window)).toBeVisible()
  })

  test('sidenav-desk-plans deep-links into the Plans view with the sidebar still visible', async () => {
    await window.locator('[data-testid="sidenav-desk-plans"]').click()
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })
    await expect(window.getByRole('heading', { name: 'Plans' })).toBeVisible()
    await expect(sidebar(window)).toBeVisible()
  })

  test('sidenav-office-docs opens the PlexiOffice docs area with the sidebar still visible', async () => {
    await window.locator('[data-testid="sidenav-office-docs"]').click()
    // Office content renders in the centre panel; the docs app tile is present and
    // the persistent sidebar stays.
    await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible({ timeout: 8_000 })
    await expect(sidebar(window)).toBeVisible()
  })

  test('sidenav-brain-search opens the Brain search view with the sidebar still visible', async () => {
    await window.locator('[data-testid="sidenav-brain-search"]').click()
    await expect(window.locator('[data-testid="plexisearch-view"]')).toBeVisible({ timeout: 8_000 })
    await expect(sidebar(window)).toBeVisible()
  })

  test('sidenav-people-map deep-links into the PlexiPeople organisation map with the sidebar still visible', async () => {
    await window.locator('[data-testid="sidenav-people-map"]').click()
    await expect(window.locator('[data-testid="segment-plexipeople"]')).toBeVisible({ timeout: 8_000 })
    await expect(sidebar(window)).toBeVisible()
  })
})
