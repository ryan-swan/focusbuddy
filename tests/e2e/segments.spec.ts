/**
 * E2E for the PlexiWork / PlexiConnect / PlexiFlow segments — each a full-bleed
 * area with its own dedicated side menu and a home of app tiles, with the
 * existing views rendered inline so the segment menu stays put.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

async function openSegment(window: Page, navTestid: string): Promise<void> {
  // Each segment is a full-bleed takeover that hides the global sidebar, so first
  // exit any active segment back to the global app, then open the target via its
  // dedicated sidebar entry (testid, since some product labels still repeat).
  const exit = window.locator('[data-testid="segment-exit"]')
  if (await exit.isVisible().catch(() => false)) await exit.click()
  await expect(window.locator(`[data-testid="${navTestid}"]`)).toBeVisible({ timeout: 8_000 })
  await window.locator(`[data-testid="${navTestid}"]`).click()
  await expect(window.locator('[data-testid="segment-sidebar"]')).toBeVisible({ timeout: 8_000 })
}

test.describe('segments', () => {
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

  const SEGMENTS: { name: string; nav: string; apps: string[] }[] = [
    { name: 'PlexiWork', nav: 'nav-plexiwork', apps: ['projects', 'tasks', 'reports'] },
    { name: 'PlexiConnect', nav: 'nav-plexiconnect', apps: ['chat', 'meet'] },
    { name: 'PlexiFlow', nav: 'nav-plexiflow', apps: ['flow', 'api', 'build', 'form'] }
  ]

  for (const seg of SEGMENTS) {
    test(`${seg.name} opens with its side menu, tiles and inline views`, async () => {
      await openSegment(window, seg.nav)
      // The home shows a tile per app, and the sidebar lists each app.
      for (const a of seg.apps) {
        await expect(window.locator(`[data-testid="segment-tile-${a}"]`)).toBeVisible()
        await expect(window.locator(`[data-testid="segment-app-${a}"]`)).toBeVisible()
      }
      // Open the first app inline; the segment side menu stays present (no crash).
      await window.locator(`[data-testid="segment-app-${seg.apps[0]}"]`).click()
      await expect(window.locator('[data-testid="segment-sidebar"]')).toBeVisible()
      // Back to the segment home.
      await window.locator('[data-testid="segment-nav-home"]').click()
      await expect(window.locator(`[data-testid="segment-tile-${seg.apps[0]}"]`)).toBeVisible()
    })
  }
})
