/**
 * E2E for the segmented top-level IA: PlexiDesk, PlexiOffice and PlexiBrain.
 * Navigation now runs through the single persistent global sidebar — its section
 * headers open a segment home in the centre panel, and its deep-link rows land on
 * a specific app. This spec opens each segment, asserts a representative app
 * renders in the centre panel, and confirms the Projects → Plans rename shows in
 * the planning view header and nav (no "Project(s)" copy where the user reads
 * "Plan(s)").
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

test.describe('segmented IA', () => {
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

  test('PlexiDesk Tasks deep-link renders the tasks view', async () => {
    await window.locator('[data-testid="sidenav-desk-tasks"]').click()
    // Representative app: Tasks → AllTasksView (its "All Tasks" heading).
    await expect(window.getByRole('heading', { name: 'All Tasks' })).toBeVisible({ timeout: 8_000 })
  })

  test('PlexiOffice home is present with its Docs and Chat apps', async () => {
    await window.locator('[data-testid="nav-plexioffice"]').click()
    // The office content renders in the centre panel with the document apps.
    await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible({ timeout: 8_000 })
    // A communication app lives in the same content area.
    await expect(window.locator('[data-testid="office-comms-app-chat"]')).toBeVisible()
  })

  test('PlexiBrain Search deep-link renders the search view', async () => {
    await window.locator('[data-testid="sidenav-brain-search"]').click()
    await expect(window.locator('[data-testid="plexisearch-view"]')).toBeVisible({ timeout: 8_000 })
  })

  test('PlexiBrain Brain Map app renders a real graph or honest empty state', async () => {
    await window.locator('[data-testid="sidenav-brain-map"]').click()
    await expect(window.locator('[data-testid="brain-map-view"]')).toBeVisible({ timeout: 8_000 })
    // A fresh test workspace has no knowledge entries, so the honest empty state
    // must show — never an invented graph.
    await expect(window.locator('[data-testid="brain-map-empty"]')).toBeVisible()
  })

  test('Plans rename: the planning view reads Plans, not Projects', async () => {
    await window.locator('[data-testid="sidenav-desk-plans"]').click()
    const view = window.locator('[data-testid="plexiprojects-view"]')
    await expect(view).toBeVisible({ timeout: 8_000 })
    // Header reads "Plans" and the create button reads "New plan".
    await expect(window.getByRole('heading', { name: 'Plans' })).toBeVisible()
    await expect(window.locator('[data-testid="projects-new"]')).toContainText('New plan')
    // No user-facing "New project" / "Projects" header copy remains here.
    await expect(window.locator('[data-testid="projects-new"]')).not.toContainText('New project')
  })
})
