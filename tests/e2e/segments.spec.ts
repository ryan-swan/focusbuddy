/**
 * E2E for the PlexiDesk / PlexiBrain segments. The global sidebar is the one
 * persistent menu; a segment renders its content (a home of app tiles, or an app
 * view) into the centre panel while the sidebar stays put. PlexiOffice is a third
 * segment with its own content, covered by officeShell.spec.ts.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Open a segment home by clicking its sidebar section header. The segment content
// wrapper (segment-<wordmark>) renders in the centre panel.
async function openSegmentHome(window: Page, navTestid: string, wordmark: string): Promise<void> {
  await expect(window.locator(`[data-testid="${navTestid}"]`)).toBeVisible({ timeout: 8_000 })
  await window.locator(`[data-testid="${navTestid}"]`).click()
  await expect(window.locator(`[data-testid="segment-${wordmark}"]`)).toBeVisible({ timeout: 8_000 })
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

  const SEGMENTS: { name: string; nav: string; wordmark: string; sidenavPrefix: string; apps: string[] }[] = [
    { name: 'PlexiDesk', nav: 'nav-plexidesk', wordmark: 'plexidesk', sidenavPrefix: 'desk', apps: ['home', 'desk', 'workspaces', 'plans', 'tasks', 'calendar', 'files', 'recent'] },
    { name: 'PlexiBrain', nav: 'nav-plexibrain', wordmark: 'plexibrain', sidenavPrefix: 'brain', apps: ['ask', 'search', 'map', 'flows', 'agents', 'connect', 'api', 'insights'] }
  ]

  for (const seg of SEGMENTS) {
    test(`${seg.name} home shows tiles and its apps are deep-linkable from the sidebar`, async () => {
      await openSegmentHome(window, seg.nav, seg.wordmark)
      // The home shows a tile per app, and the sidebar lists each app as a
      // deep-link row.
      for (const a of seg.apps) {
        await expect(window.locator(`[data-testid="segment-tile-${a}"]`)).toBeVisible()
        await expect(window.locator(`[data-testid="sidenav-${seg.sidenavPrefix}-${a}"]`)).toBeVisible()
      }
      // Open the first app from its home tile; the segment content swaps to it and
      // the persistent sidebar stays present (no crash).
      await window.locator(`[data-testid="segment-tile-${seg.apps[0]}"]`).click()
      await expect(
        window.getByRole('heading', { name: /^plexidesk$/i, level: 2 }).first()
      ).toBeVisible()
      // Back to the segment home via its section header.
      await window.locator(`[data-testid="${seg.nav}"]`).click()
      await expect(window.locator(`[data-testid="segment-tile-${seg.apps[0]}"]`)).toBeVisible()
    })
  }
})
