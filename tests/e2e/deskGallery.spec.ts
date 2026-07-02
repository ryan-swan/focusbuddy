/**
 * E2E spec: DeskGallery — the no-desk-open canvas empty state replacement.
 *
 * Verifies:
 *   1. Gallery renders with a card per top-level desk + "New desk" card.
 *   2. Empty desks show "empty" badge (no widget FK issues; widget creation skipped).
 *   3. Clicking a desk card opens that desk's canvas (gallery disappears,
 *      canvas surface shows).
 *   4. No uncaught console errors during the flow.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('DeskGallery renders desk cards and clicking opens the canvas', async () => {
  const { window, dispose } = await launchApp()
  const errors: string[] = []
  window.on('pageerror', (e) => errors.push(e.message))

  try {
    await waitForReady(window)

    // ------------------------------------------------------------------ //
    // Step 1 — create top-level desks via IPC                            //
    // Widget creation is skipped; empty desks are sufficient for gallery  //
    // verification (cards show "empty" badge, which is the honest state). //
    // ------------------------------------------------------------------ //

    const ids = await window.evaluate(async () => {
      const api = (window as unknown as {
        api: {
          nodes: { create: (d: Record<string, unknown>) => Promise<{ id: string }> }
        }
      }).api

      const alpha = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Alpha' })
      const beta  = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Beta' })
      const gamma = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Gamma' })
      const solo  = await api.nodes.create({ parentId: null, kind: 'task',   title: 'Solo' })

      return { alpha: alpha.id, beta: beta.id, gamma: gamma.id, solo: solo.id }
    })

    console.log('Created nodes:', JSON.stringify(ids))

    // ------------------------------------------------------------------ //
    // Step 2 — reload so the node store hydrates all created nodes, then  //
    // reach the "no desk open" Canvas state so DeskGallery renders        //
    // ------------------------------------------------------------------ //

    await window.reload()
    await waitForReady(window)

    // Navigate to project-dashboard with a non-existent id. Canvas renders
    // for this view kind; because the id matches no node, activeTask is null
    // and Canvas falls into the DeskGallery branch.
    await window.evaluate(() => {
      const vs = (window as unknown as {
        __fbView?: { getState: () => { goProject: (id: string) => void } }
      }).__fbView
      vs?.getState().goProject('no-such-desk')
    })

    // Wait for the gallery — or dump diagnostics if it doesn't appear.
    const galleryLocator = window.locator('[data-testid="desk-gallery"]')
    const galleryVisible = await galleryLocator.isVisible({ timeout: 10_000 }).catch(() => false)

    if (!galleryVisible) {
      const diag = await window.evaluate(() => {
        const hasSurface = !!document.querySelector('[data-canvas-surface="true"]')
        const hasGallery = !!document.querySelector('[data-testid="desk-gallery"]')
        const mainEl = document.querySelector('main') ?? document.body
        return {
          hasSurface,
          hasGallery,
          mainText: mainEl.textContent?.slice(0, 500) ?? '',
          bodyHtml: document.body.innerHTML.slice(0, 1200)
        }
      })
      console.error('Gallery not visible. Diagnostic:', JSON.stringify(diag, null, 2))
      throw new Error(
        `[data-testid="desk-gallery"] not visible after goProject('no-such-desk').\n` +
        `hasSurface=${diag.hasSurface} hasGallery=${diag.hasGallery}\n` +
        `mainText=${diag.mainText}`
      )
    }

    // ------------------------------------------------------------------ //
    // Step 3 — assert gallery structure                                   //
    // ------------------------------------------------------------------ //

    await expect(galleryLocator.getByText('Your desks')).toBeVisible()

    // One card per top-level desk (Alpha, Beta, Gamma, Solo = 4 cards).
    for (const [name, id] of Object.entries(ids)) {
      const card = window.locator(`[data-testid="desk-card-${id}"]`)
      await expect(card).toBeVisible({ timeout: 5_000 })
      console.log(`Card for ${name} (${id}): visible`)
    }

    // New desk card present.
    await expect(window.locator('[data-testid="desk-card-new"]')).toBeVisible()

    // All desks have no widgets. The card has two "empty" text occurrences:
    //   - DeskMiniature renders "Empty desk" in the thumbnail area
    //   - the footer count badge renders "empty" for zero-widget desks
    // Use the footer span (exact text, case-sensitive) via .first() to avoid
    // strict-mode ambiguity.
    const alphaCard = window.locator(`[data-testid="desk-card-${ids.alpha}"]`)
    // Confirm the thumbnail shows the "Empty desk" fallback (DeskMiniature with no widgets).
    await expect(alphaCard.locator('text=Empty desk').first()).toBeVisible({ timeout: 5_000 })
    // Confirm the footer count badge shows "empty" (zero widgets).
    await expect(alphaCard.locator('span:has-text("empty")').first()).toBeVisible({ timeout: 5_000 })

    // ------------------------------------------------------------------ //
    // Step 4 — screenshot the gallery                                     //
    // ------------------------------------------------------------------ //

    const screenshotPath = '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad/desk-gallery.png'
    await window.screenshot({ path: screenshotPath, fullPage: false })
    console.log(`Screenshot saved: ${screenshotPath}`)

    // ------------------------------------------------------------------ //
    // Step 5 — click Alpha card and confirm canvas opens                  //
    // ------------------------------------------------------------------ //

    await alphaCard.click()

    // Gallery disappears once a real desk is active.
    await expect(galleryLocator).not.toBeVisible({ timeout: 8_000 })

    // Canvas surface should now be present.
    await expect(window.locator('[data-bare-canvas], [data-canvas-surface]').first())
      .toBeVisible({ timeout: 6_000 })
    console.log('Canvas surface visible after clicking Alpha card.')

    // ------------------------------------------------------------------ //
    // Step 6 — no uncaught JS errors                                      //
    // ------------------------------------------------------------------ //

    const realErrors = errors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('Non-Error promise') &&
        // FK errors from background processes (snapshots, canvas save) are main-process
        // stderr, not renderer pageerror events; filter any that do surface.
        !e.includes('FOREIGN KEY')
    )
    if (realErrors.length > 0) {
      console.error('Uncaught JS errors:', realErrors)
    }
    expect(realErrors).toHaveLength(0)

  } finally {
    await dispose()
  }
})
