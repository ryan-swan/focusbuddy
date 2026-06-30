/**
 * E2E for the redesigned left-sidebar segment navigation. The single collapsed
 * "Segments" section is now four labelled, collapsible sections, one per segment
 * (PlexiDesk, PlexiOffice, PlexiPeople, PlexiBrain). Each header carries the
 * legacy nav-* testid and opens that segment; under it every app is an indented
 * sub-item that deep-links into the segment with that app preselected.
 *
 * This spec asserts the four headers render, a section's app rows are present
 * when expanded and hidden when collapsed, and that representative sub-items
 * deep-link to the right view (Plans, office Docs flow, Brain Search).
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Return to the global sidebar from inside any segment takeover.
async function exitSegment(window: Page): Promise<void> {
  const segExit = window.locator('[data-testid="segment-exit"]')
  if (await segExit.isVisible().catch(() => false)) await segExit.click()
  const officeExit = window.locator('[data-testid="office-exit"]')
  if (await officeExit.isVisible().catch(() => false)) await officeExit.click()
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
    await exitSegment(window)
    for (const id of ['nav-plexidesk', 'nav-plexioffice', 'nav-plexipeople', 'nav-plexibrain']) {
      await expect(window.locator(`[data-testid="${id}"]`)).toBeVisible({ timeout: 8_000 })
    }
  })

  test('an expanded section shows its app rows; collapsing hides them', async () => {
    await exitSegment(window)
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

  test('clicking a segment header opens that segment (legacy behaviour preserved)', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="nav-plexidesk"]').click()
    await expect(window.locator('[data-testid="segment-sidebar"]')).toBeVisible({ timeout: 8_000 })
  })

  test('sidenav-desk-plans deep-links into the Plans view', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="sidenav-desk-plans"]').click()
    await expect(window.locator('[data-testid="plexiprojects-view"]')).toBeVisible({ timeout: 8_000 })
    await expect(window.getByRole('heading', { name: 'Plans' })).toBeVisible()
  })

  test('sidenav-office-docs opens the PlexiOffice docs flow', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="sidenav-office-docs"]').click()
    // The office shell opens with its own sidebar and the Docs app present.
    await expect(window.locator('[data-testid="office-sidebar"]')).toBeVisible({ timeout: 8_000 })
    await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible()
  })

  test('sidenav-brain-search opens the Brain search view', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="sidenav-brain-search"]').click()
    await expect(window.locator('[data-testid="plexisearch-view"]')).toBeVisible({ timeout: 8_000 })
  })

  test('sidenav-people-map deep-links into the PlexiPeople organisation map', async () => {
    await exitSegment(window)
    await window.locator('[data-testid="sidenav-people-map"]').click()
    // PlexiPeople is a SegmentShell; opening its map app keeps the segment sidebar.
    await expect(window.locator('[data-testid="segment-sidebar"]')).toBeVisible({ timeout: 8_000 })
  })
})
