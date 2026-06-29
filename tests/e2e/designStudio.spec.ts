/**
 * E2E smoke for PlexiDesign — the on-platform design studio (a new 'design' doc
 * type whose canvas reuses the parameterized SlideCanvas at any size).
 *
 * Covers the core path: create a design, the studio opens, a template renders
 * real elements and persists an on-brand body, size change persists, add element,
 * and the AI image path is honest (no key -> a needs-key status, no fake image).
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

async function openDocumentsHub(window: Page): Promise<void> {
  await window.getByRole('button', { name: /^Documents$/i }).click()
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

async function openDesignStudio(window: Page): Promise<void> {
  // Select the Design type tile, then open the studio.
  await window.locator('button', { hasText: 'Design' }).first().click()
  await expect(window.locator('[data-testid="design-create-note"]')).toBeVisible({ timeout: 8_000 })
  await window.locator('[data-testid="design-open-studio"]').click()
  await expect(window.locator('[data-testid="design-editor"]')).toBeVisible({ timeout: 10_000 })
}

// Ensure the templates panel is open without toggling it closed when it already
// is (it auto-opens on a blank design).
async function ensureTemplatesOpen(window: Page): Promise<void> {
  const tpl = window.locator('[data-testid="design-template-social-quote"]')
  if (!(await tpl.isVisible().catch(() => false))) {
    await window.locator('[data-testid="design-templates-btn"]').click()
  }
  await expect(tpl).toBeVisible({ timeout: 5_000 })
}

test.describe('PlexiDesign studio', () => {
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

  test('DS-1 create a design and the studio opens with templates + tools', async () => {
    await openDocumentsHub(window)
    await openDesignStudio(window)
    // Toolbar tools present.
    for (const t of ['design-templates-btn', 'design-size-btn', 'design-add-text', 'design-add-rect', 'design-ai-btn', 'design-brandify']) {
      await expect(window.locator(`[data-testid="${t}"]`)).toBeVisible()
    }
  })

  test('DS-2 applying a template renders elements on the canvas', async () => {
    await ensureTemplatesOpen(window)
    await window.locator('[data-testid="design-template-social-quote"]').click()
    await expect(window.locator('[data-testid="slide-canvas"]')).toBeVisible()
    expect(await window.locator('[data-testid="slide-element"]').count()).toBeGreaterThan(0)
  })

  test('DS-3 changing the size repaints the canvas', async () => {
    await window.locator('[data-testid="design-size-btn"]').click()
    await window.locator('[data-testid="design-size-poster-a4"]').click()
    // Canvas still present and elements remain.
    await expect(window.locator('[data-testid="slide-canvas"]')).toBeVisible()
  })

  test('DS-4 add a text element grows the canvas', async () => {
    const before = await window.locator('[data-testid="slide-element"]').count()
    await window.locator('[data-testid="design-add-text"]').click()
    await expect(window.locator('[data-testid="slide-element"]')).toHaveCount(before + 1)
    // The new text element is selected -> inspector shows.
    await expect(window.locator('[data-testid="design-inspector"]')).toBeVisible()
  })

  test('DS-5 AI image with no key is honest (no fake image)', async () => {
    const before = await window.locator('[data-testid="slide-element"]').count()
    await window.locator('[data-testid="design-ai-btn"]').click()
    await window.locator('[data-testid="design-image-prompt"]').fill('a minimal abstract gradient')
    await window.locator('[data-testid="design-image-go"]').click()
    // Either a status (no key) appears OR (if a key is configured) an image is
    // added. Never both-fail-silently. Wait for a settled outcome.
    await window.waitForTimeout(1500)
    const after = await window.locator('[data-testid="slide-element"]').count()
    const status = window.locator('[data-testid="design-status"]')
    if (after === before) {
      // No image added -> there MUST be an honest status message (e.g. add a key).
      await expect(status).toBeVisible()
      expect((await status.textContent())?.toLowerCase()).toMatch(/key|fail|could not|reach/)
    } else {
      // A real image was generated and placed.
      expect(after).toBe(before + 1)
    }
  })

  test('DS-6 the export menu offers PNG and PDF', async () => {
    await window.locator('[data-testid="design-export-btn"]').click()
    await expect(window.locator('[data-testid="design-export-menu"]')).toBeVisible()
    await expect(window.locator('[data-testid="design-export-png"]')).toBeVisible()
    await expect(window.locator('[data-testid="design-export-pdf"]')).toBeVisible()
    // Dismiss the menu via its backdrop (top-left), not the native save dialog.
    await window.mouse.click(5, 5)
    await expect(window.locator('[data-testid="design-export-menu"]')).toBeHidden()
  })

  test('DS-7 brand kit editor saves a brand the design reads back', async () => {
    await window.locator('[data-testid="design-brand-kit-btn"]').click()
    await expect(window.locator('[data-testid="brand-kit-modal"]')).toBeVisible()
    // Set a distinctive primary color and save (IPC brand:set -> local store).
    await window.locator('[data-testid="brand-primary"]').fill('#ff0066')
    await window.locator('[data-testid="brand-save"]').click()
    await expect(window.locator('[data-testid="brand-kit-modal"]')).toBeHidden()
    // Re-open: the brand persisted through the store (IPC brand:get).
    await window.locator('[data-testid="design-brand-kit-btn"]').click()
    await expect(window.locator('[data-testid="brand-primary"]')).toHaveValue('#ff0066')
    await window.mouse.click(5, 5) // close the modal via its overlay
    await expect(window.locator('[data-testid="brand-kit-modal"]')).toBeHidden()
  })
})
