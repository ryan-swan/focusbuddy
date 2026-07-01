/**
 * Every area's menu carries a compact switcher so you can jump between the four
 * areas in one click. In particular, Docs and Sheets (PlexiOffice) are always one
 * click away, even from the desk. Regression guard for "I can't see docs/sheets".
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

async function openArea(window: Page, nav: string): Promise<void> {
  if (await window.locator('[data-testid="segment-switcher"]').isVisible().catch(() => false)) return
  const navBtn = window.locator(`[data-testid="${nav}"]`)
  // Enter an area from the global sidebar's Segments list; expand the section only
  // if the entry is not already visible.
  if (!(await navBtn.isVisible().catch(() => false))) {
    await window.getByText('Segments', { exact: true }).click().catch(() => {})
  }
  await navBtn.click()
}

test('SW-1 the switcher jumps to PlexiOffice and its apps (Docs) in one click', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    // Land in the PlexiDesk area first.
    await openArea(window, 'nav-plexidesk')
    await expect(window.locator('[data-testid="segment-switcher"]')).toBeVisible({ timeout: 8_000 })

    // One click to Office; the office apps (Docs) are now reachable.
    await window.locator('[data-testid="switch-office"]').click()
    await expect(window.locator('[data-testid="office-app-docs"]')).toBeVisible({ timeout: 8_000 })

    // And back to the desk in one click; the switcher stays put.
    await window.locator('[data-testid="switch-plexidesk"]').click()
    await expect(window.locator('[data-testid="segment-switcher"]')).toBeVisible()
  } finally {
    await dispose()
  }
})
