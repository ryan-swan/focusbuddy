/**
 * E2E: Sheets cell navigation + sizing.
 *  - Default cells are Excel-sized wide rectangles (64x20), not squares.
 *  - While entering a value, each arrow key commits it and moves that direction.
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

async function cellText(window: Page, r: number, c: number): Promise<string> {
  return (await window.locator(`[data-testid="cell-${r}-${c}"] div`).first().innerText()).trim()
}

test('SN-1 — default cells are Excel-sized wide rectangles (64x20)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openDocumentsHub(window)
  await startBlankSpreadsheet(window)

  const box = await window.locator('[data-testid="cell-0-0"]').boundingBox()
  expect(box).not.toBeNull()
  // Excel: 64px wide, 20px tall (allow a couple px for borders/rounding).
  expect(box!.width).toBeGreaterThanOrEqual(62)
  expect(box!.width).toBeLessThanOrEqual(67)
  expect(box!.height).toBeGreaterThanOrEqual(18)
  expect(box!.height).toBeLessThanOrEqual(23)
  // A clearly wider-than-tall rectangle, not a square.
  expect(box!.width).toBeGreaterThan(box!.height * 2)
})

test('SN-2 — arrow keys commit the entry and move that direction', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await openDocumentsHub(window)
  await startBlankSpreadsheet(window)

  // Type into A1 and press Right: commits "hello" to A1 and moves to B1.
  await window.locator('[data-testid="cell-0-0"]').click()
  await window.keyboard.type('hello')
  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(120)

  // Now in B1: type and press Down: commits "world" to B1 and moves to B2.
  await window.keyboard.type('world')
  await window.keyboard.press('ArrowDown')
  await window.waitForTimeout(120)

  // In B2: type and press Left: commits "down" to B2 and moves to A2.
  await window.keyboard.type('downval')
  await window.keyboard.press('ArrowLeft')
  await window.waitForTimeout(120)

  // In A2: type and press Up: commits "left" to A2 and moves to A1.
  await window.keyboard.type('leftval')
  await window.keyboard.press('ArrowUp')
  await window.waitForTimeout(120)

  expect(await cellText(window, 0, 0)).toBe('hello') // A1, from Right
  expect(await cellText(window, 0, 1)).toBe('world') // B1, from Down
  expect(await cellText(window, 1, 1)).toBe('downval') // B2, from Left
  expect(await cellText(window, 1, 0)).toBe('leftval') // A2, from Up
})
