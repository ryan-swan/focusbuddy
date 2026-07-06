/**
 * E2E: merged cells in PlexiSheets. Select a horizontal range, click Merge, and
 * confirm the anchor cell spans the range (native colSpan) and the covered cells
 * are no longer rendered. Then unmerge and confirm they return.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function openDocumentsHub(window: Page): Promise<void> {
  await window.evaluate(() => {
    const w = window as unknown as { __fbView?: { getState: () => { goDocuments: () => void } } }
    w.__fbView?.getState().goDocuments()
  })
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({ timeout: 8_000 })
}

async function startBlankSpreadsheet(window: Page): Promise<void> {
  const blankRow = window.locator('text=Or start blank:').locator('..')
  await blankRow.locator('button', { hasText: 'Spreadsheet' }).first().click()
  await expect(window.locator('[data-testid="sheet-toolbar"]')).toBeVisible({ timeout: 8_000 })
}

test('SM-1 — merge a row range into one spanning cell, then unmerge', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openDocumentsHub(window)
  await startBlankSpreadsheet(window)

  // Select A1:C1 (click A1, shift-click C1).
  await window.locator('[data-testid="cell-0-0"]').click()
  await window.locator('[data-testid="cell-0-2"]').click({ modifiers: ['Shift'] })

  await window.locator('[data-testid="sheet-merge-btn"]').click()
  await window.waitForTimeout(200)

  // The anchor now spans three columns; the covered cells are gone from the DOM.
  await expect(window.locator('[data-testid="cell-0-0"]')).toHaveAttribute('colspan', '3')
  await expect(window.locator('[data-testid="cell-0-1"]')).toHaveCount(0)
  await expect(window.locator('[data-testid="cell-0-2"]')).toHaveCount(0)

  // Unmerge (the selection is still the merged range) — the cells return.
  await window.locator('[data-testid="sheet-merge-btn"]').click()
  await window.waitForTimeout(200)
  await expect(window.locator('[data-testid="cell-0-1"]')).toHaveCount(1)
  await expect(window.locator('[data-testid="cell-0-2"]')).toHaveCount(1)
  await expect(window.locator('[data-testid="cell-0-0"]')).not.toHaveAttribute('colspan', '3')
})
