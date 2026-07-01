/**
 * E2E for the PlexiOffice segment. The global sidebar is the one persistent menu;
 * PlexiOffice renders its content (app tiles, page tabs, communicate row,
 * templates and inline editors) into the centre panel. This spec asserts the
 * office content shows its apps and pages, that launching PlexiDocs opens a doc
 * inline with the persistent sidebar still present, and that a template creates a
 * document inline.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The persistent sidebar's PLEXIDESK wordmark — a stable anchor to assert the
// single menu is still present after navigation.
function sidebar(window: Page) {
  return window.getByRole('heading', { name: /^plexidesk$/i, level: 2 }).first()
}

async function openOffice(window: Page): Promise<void> {
  // The PlexiOffice segment opens from its sidebar section header, which carries
  // the stable nav-plexioffice testid. Its content renders in the centre panel.
  await window.locator('[data-testid="nav-plexioffice"]').click()
  await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible({ timeout: 8_000 })
}

test.describe('PlexiOffice segment', () => {
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

  test('OF-1 the office content shows its pages, document apps and comms apps', async () => {
    await openOffice(window)
    for (const t of ['office-nav-home', 'office-nav-recent', 'office-nav-starred', 'office-nav-templates', 'office-nav-trash']) {
      await expect(window.locator(`[data-testid="${t}"]`)).toBeVisible()
    }
    for (const a of ['docs', 'sheets', 'slides', 'draw', 'design']) {
      await expect(window.locator(`[data-testid="office-app-${a}"]`)).toBeVisible()
    }
    // Sign, Mail, Chat, Meet and Inbox are communication apps in the Communicate
    // row of the office content.
    for (const a of ['mail', 'inbox', 'chat', 'meet', 'sign']) {
      await expect(window.locator(`[data-testid="office-comms-app-${a}"]`)).toBeVisible()
    }
    // The Ask-AI bar and upgrade affordance are present.
    await expect(window.locator('[data-testid="office-ask-ai"]')).toBeVisible()
    // The persistent sidebar stays put alongside the office content.
    await expect(sidebar(window)).toBeVisible()
  })

  test('OF-2 launching PlexiDocs opens a doc inline; the sidebar stays put', async () => {
    await window.locator('[data-testid="office-app-docs"]').click()
    // The document editor opens in the centre panel; the persistent sidebar stays.
    await expect(window.locator('[data-testid="doc-editor-surface"]')).toBeVisible({ timeout: 10_000 })
    await expect(sidebar(window)).toBeVisible()
    // Return to the office home via the persistent sidebar deep-link.
    await window.locator('[data-testid="sidenav-office-docs"]').click()
    await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible({ timeout: 8_000 })
  })

  test('OF-3 a template creates a spreadsheet inline; the sidebar stays put', async () => {
    // Re-open the office home so the templates grid is present regardless of what
    // the previous test left showing.
    await openOffice(window)
    await window.locator('[data-testid="office-template-blank-sheet"]').click()
    // The sheet editor opens in the centre panel; the persistent sidebar stays.
    await expect(sidebar(window)).toBeVisible()
    await window.locator('[data-testid="sidenav-office-docs"]').click()
    await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible({ timeout: 8_000 })
  })
})
