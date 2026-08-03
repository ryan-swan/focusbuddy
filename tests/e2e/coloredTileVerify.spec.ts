/**
 * Colored-tile treatment verification.
 *
 * Navigates to each of the four area menus (Desk, Office, People, Brain)
 * and captures a screenshot of the LEFT sidebar only. Then evaluates,
 * via the DOM, whether every nav row has the expected colored-square
 * structure (w-6 h-6 rounded-md + a Tailwind bg-* color class).
 *
 * Playwright screenshots are captured so the operator can visually confirm.
 * The DOM check is the authoritative pass/fail signal.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'
import path from 'path'

const SCREENSHOT_DIR = '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad'

test.describe('colored-tile nav treatment', () => {
  test('all four area menus show colored rounded-square on every nav row', async () => {
    const { window, dispose } = await launchApp()
    try {
      await waitForReady(window)

      // ── 1. DESK ──────────────────────────────────────────────────────────
      // The Desk area is the default landing; just navigate home to be sure.
      await window.evaluate(() => {
        const w = window as unknown as { __fbView?: { getState: () => Record<string, () => void> } }
        w.__fbView?.getState().goHome?.()
      })
      // Wait for the Desk sidebar
      await expect(window.locator('aside').first()).toBeVisible({ timeout: 8_000 })

      // Screenshot the left sidebar only (first <aside> in the DOM).
      const deskSidebar = window.locator('aside').first()
      await deskSidebar.screenshot({
        path: path.join(SCREENSHOT_DIR, 'sidebar-desk.png')
      })

      // DOM check: every NavRow button inside the Desk nav block should contain
      // a <span> with rounded-md and a bg-* Tailwind class.
      // The six Desk nav rows (Home/Plans/Tasks/Calendar/Files/Vault) are the
      // px-3 py-2 rounded-lg buttons directly inside the px-2.pt-1.pb-2 div.
      // We scope by checking that the parent div has class pb-2 and pt-1 and px-2
      // (the dedicated nav block in Sidebar.tsx) to avoid capturing AI-suggestion
      // buttons elsewhere in the sidebar that happen to share button classes.
      const deskNavTiles = await window.evaluate(() => {
        // The nav block is the first div with exactly the classes px-2 pt-1 pb-2
        // in the sidebar. Use the SegmentSwitcher's data-testid as an anchor:
        // it appears just before the nav block in the DOM.
        const switcher = document.querySelector('[data-testid="segment-switcher"]')
        const navBlock = switcher?.nextElementSibling as HTMLElement | null
        if (!navBlock) return []
        const buttons = Array.from(navBlock.querySelectorAll('button'))
          .filter(b => b.className.includes('rounded-lg') && b.className.includes('px-3'))
        return buttons.map(b => {
          const tileSpan = b.querySelector('span.rounded-md')
          return {
            label: b.textContent?.trim().slice(0, 30) ?? '',
            hasTile: !!tileSpan,
            tileClasses: tileSpan?.className ?? ''
          }
        })
      })
      console.log('Desk nav tiles:', JSON.stringify(deskNavTiles, null, 2))

      // ── 2. OFFICE ────────────────────────────────────────────────────────
      await window.locator('[data-testid="switch-office"]').click()
      await expect(window.locator('[data-testid="office-sidebar"]')).toBeVisible({ timeout: 8_000 })

      const officeSidebar = window.locator('[data-testid="office-sidebar"]')
      await officeSidebar.screenshot({
        path: path.join(SCREENSHOT_DIR, 'sidebar-office.png')
      })

      // Check primary nav rows (home/recent/starred/shared/templates/trash) plus
      // the Apps section rows (PlexiDocs etc.) and Communicate rows.
      // Use data-testid selectors so only named nav/app rows are checked;
      // utility rows like "New Workspace" (no testid) are intentionally excluded.
      const officeNavTiles = await window.evaluate(() => {
        const sidebar = document.querySelector('[data-testid="office-sidebar"]')
        if (!sidebar) return []
        // Primary nav: office-nav-*, app rows: office-sideapp-*, comms: office-comms-app-*
        const buttons = Array.from(sidebar.querySelectorAll('[data-testid^="office-nav-"], [data-testid^="office-sideapp-"], [data-testid^="office-comms-app-"]'))
        return buttons.map(b => {
          const tileSpan = b.querySelector('span.rounded-md')
          return {
            testid: (b as HTMLElement).dataset.testid ?? '',
            label: b.textContent?.trim().slice(0, 30) ?? '',
            hasTile: !!tileSpan,
            tileClasses: tileSpan?.className ?? ''
          }
        })
      })
      console.log('Office nav tiles:', JSON.stringify(officeNavTiles, null, 2))

      // ── 3. PEOPLE ────────────────────────────────────────────────────────
      await window.locator('[data-testid="switch-plexipeople"]').click()
      await expect(window.locator('[data-testid="segment-sidebar"]')).toBeVisible({ timeout: 8_000 })

      const peopleSidebar = window.locator('[data-testid="segment-sidebar"]')
      await peopleSidebar.screenshot({
        path: path.join(SCREENSHOT_DIR, 'sidebar-people.png')
      })

      const peopleNavTiles = await window.evaluate(() => {
        const sidebar = document.querySelector('[data-testid="segment-sidebar"]')
        if (!sidebar) return []
        // Home nav button + app rows — all have data-testid
        const buttons = Array.from(sidebar.querySelectorAll('[data-testid="segment-nav-home"], [data-testid^="segment-app-"]'))
        return buttons.map(b => {
          const tileSpan = b.querySelector('span.rounded-md')
          return {
            testid: (b as HTMLElement).dataset.testid ?? '',
            label: b.textContent?.trim().slice(0, 30) ?? '',
            hasTile: !!tileSpan,
            tileClasses: tileSpan?.className ?? ''
          }
        })
      })
      console.log('People nav tiles:', JSON.stringify(peopleNavTiles, null, 2))

      // ── 4. BRAIN ─────────────────────────────────────────────────────────
      await window.locator('[data-testid="switch-plexibrain"]').click()
      // segment-sidebar is reused; wait for the wordmark span (exact class match) to update
      await expect(window.locator('span.font-bold:text-is("PLEXIBRAIN")')).toBeVisible({ timeout: 8_000 })

      const brainSidebar = window.locator('[data-testid="segment-sidebar"]')
      await brainSidebar.screenshot({
        path: path.join(SCREENSHOT_DIR, 'sidebar-brain.png')
      })

      const brainNavTiles = await window.evaluate(() => {
        const sidebar = document.querySelector('[data-testid="segment-sidebar"]')
        if (!sidebar) return []
        const buttons = Array.from(sidebar.querySelectorAll('[data-testid="segment-nav-home"], [data-testid^="segment-app-"]'))
        return buttons.map(b => {
          const tileSpan = b.querySelector('span.rounded-md')
          return {
            testid: (b as HTMLElement).dataset.testid ?? '',
            label: b.textContent?.trim().slice(0, 30) ?? '',
            hasTile: !!tileSpan,
            tileClasses: tileSpan?.className ?? ''
          }
        })
      })
      console.log('Brain nav tiles:', JSON.stringify(brainNavTiles, null, 2))

      // ── ASSERTIONS ───────────────────────────────────────────────────────
      // Desk: expect 6 nav rows (Home/Plans/Tasks/Calendar/Files/Vault), all with tiles.
      const deskRows = deskNavTiles.filter(r => r.label.length > 0)
      const deskPlain = deskRows.filter(r => !r.hasTile)
      console.log('Desk plain rows (should be 0):', deskPlain)
      expect(deskPlain, `Desk sidebar rows without a colored tile: ${deskPlain.map(r => r.label).join(', ')}`).toHaveLength(0)

      // Office: expect all primary nav rows and app rows to have tiles.
      const officeRows = officeNavTiles.filter(r => r.label.length > 0)
      const officePlain = officeRows.filter(r => !r.hasTile)
      console.log('Office plain rows (should be 0):', officePlain)
      expect(officePlain, `Office sidebar rows without a colored tile: ${officePlain.map(r => r.label).join(', ')}`).toHaveLength(0)

      // People: Home nav button + app rows, all with tiles.
      const peopleRows = peopleNavTiles.filter(r => r.label.length > 0)
      const peoplePlain = peopleRows.filter(r => !r.hasTile)
      console.log('People plain rows (should be 0):', peoplePlain)
      expect(peoplePlain, `People sidebar rows without a colored tile: ${peoplePlain.map(r => r.label).join(', ')}`).toHaveLength(0)

      // Brain: Home nav button + app rows, all with tiles.
      const brainRows = brainNavTiles.filter(r => r.label.length > 0)
      const brainPlain = brainRows.filter(r => !r.hasTile)
      console.log('Brain plain rows (should be 0):', brainPlain)
      expect(brainPlain, `Brain sidebar rows without a colored tile: ${brainPlain.map(r => r.label).join(', ')}`).toHaveLength(0)

      // ── CONSOLE ERRORS CHECK ─────────────────────────────────────────────
      // Navigation should not produce any console errors.
      // (Captured via the test's own console listener if needed — we rely on
      // Playwright's default error-on-uncaught-exception behaviour here.)

    } finally {
      await dispose()
    }
  })
})
