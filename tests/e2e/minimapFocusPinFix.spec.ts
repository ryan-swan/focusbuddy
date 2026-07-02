import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'
import * as path from 'path'
import * as fs from 'fs'

// Minimap behavior verification — two fixes:
//
// Test A — MINIMIZE ON FOCUS / SHOW ON NAVIGATE:
//   The minimap should collapse to a small round button when a widget is
//   focused (active), and reopen when the collapsed button is clicked.
//
// Test B — PIN HOLDS AS CANVAS GROWS:
//   Adding many widgets at large coordinates must not push the minimap
//   away from the bottom-right viewport corner. The minimap is pinned
//   to the BR zone; its position is relative to the canvas container,
//   not to canvas content coordinates.

const SCREENSHOT_DIR = '/private/tmp/claude-501/-Applications-agentic-starter-kit-main/0d9ea3a0-0a94-4273-82da-09071878651b/scratchpad'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ── Shared setup: create a task with 2 sticky widgets ──────────────────────

async function setupTaskWithWidgets(
  window: LaunchedApp['window']
): Promise<{ taskId: string; widgetAId: string; widgetBId: string }> {
  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({
      parentId: null,
      kind: 'task',
      title: 'Minimap fix test'
    })
    const a = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'Widget A',
      content: 'WIDGET-A',
      x: 160,
      y: 160,
      width: 220,
      height: 180
    })
    const b = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'Widget B',
      content: 'WIDGET-B',
      x: 460,
      y: 160,
      width: 220,
      height: 180
    })
    return { taskId: task.id, widgetAId: a.id, widgetBId: b.id }
  })
  return ids
}

async function openDesk(
  window: LaunchedApp['window'],
  title: string
): Promise<void> {
  await window.getByRole('button', { name: title }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
  // Allow minimap auto-create effect and any modals to settle
  await window.waitForTimeout(800)
}

// Dismiss the assistant panel if open, to make room for the minimap
async function dismissAssistant(window: LaunchedApp['window']): Promise<void> {
  const btn = window.getByRole('button', { name: 'Hide assistant panel' })
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
  await window.waitForTimeout(200)
}

// ── Test A: Collapse on focus, reopen on click ─────────────────────────────

test('A: minimap collapses when a widget is focused and reopens on button click', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { widgetAId } = await setupTaskWithWidgets(window)

  await window.reload()
  await waitForReady(window)
  await openDesk(window, 'Minimap fix test')
  await dismissAssistant(window)

  // Step 1: Wait for at least one minimap thumbnail to confirm the full minimap
  // is initially visible (nothing is focused yet so it should not be collapsed).
  const anyThumb = window.locator('[data-testid^="minimap-thumb-"]').first()
  await expect(anyThumb).toBeVisible({ timeout: 5_000 })
  await expect(window.locator('[data-testid="minimap-collapsed"]')).not.toBeVisible()

  // Screenshot: initial state (full minimap visible)
  const shot1Path = path.join(SCREENSHOT_DIR, 'minimap-A1-initial-expanded.png')
  await window.screenshot({ path: shot1Path })
  console.log(`Screenshot A1 (initial expanded): ${shot1Path}`)

  // Step 2: Click on widget A to focus it.
  // Use force:true since the widget might be obscured by the canvas overlay.
  const widgetEl = window.locator(`[data-widget-id="${widgetAId}"]`).first()
  await expect(widgetEl).toBeVisible({ timeout: 5_000 })
  await widgetEl.click({ force: true })
  console.log(`Clicked widget ${widgetAId}`)

  // Step 3: Wait up to 3.5s for the minimap to collapse (2.2s nav timer expires
  // plus render time). We do NOT pan between click and check.
  const collapsedBtn = window.locator('[data-testid="minimap-collapsed"]')
  await expect(collapsedBtn).toBeVisible({ timeout: 4_000 })

  // Verify thumbnails are gone when collapsed
  await expect(anyThumb).not.toBeVisible()

  // Screenshot: collapsed state
  const shot2Path = path.join(SCREENSHOT_DIR, 'minimap-A2-collapsed.png')
  await window.screenshot({ path: shot2Path })
  console.log(`Screenshot A2 (collapsed): ${shot2Path}`)

  // Step 4: Click the collapsed button — full minimap should reopen
  await collapsedBtn.click({ force: true })
  await expect(anyThumb).toBeVisible({ timeout: 3_000 })
  await expect(collapsedBtn).not.toBeVisible()

  // Screenshot: reopened state
  const shot3Path = path.join(SCREENSHOT_DIR, 'minimap-A3-reopened.png')
  await window.screenshot({ path: shot3Path })
  console.log(`Screenshot A3 (reopened): ${shot3Path}`)

  console.log('Test A PASSED: minimap collapsed on widget focus, reopened on button click')
})

test('A-nav: minimap stays expanded while navigating even when a widget is active', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { widgetAId } = await setupTaskWithWidgets(window)

  await window.reload()
  await waitForReady(window)
  await openDesk(window, 'Minimap fix test')
  await dismissAssistant(window)

  // Focus widget A so the minimap would normally collapse
  const widgetEl = window.locator(`[data-widget-id="${widgetAId}"]`).first()
  await expect(widgetEl).toBeVisible({ timeout: 5_000 })
  await widgetEl.click({ force: true })

  // Wait until it collapses (proves the widget IS active)
  await expect(window.locator('[data-testid="minimap-collapsed"]')).toBeVisible({ timeout: 4_000 })

  // Now dispatch a wheel event on the canvas surface to trigger navigation.
  // This updates panX/panY in the store which re-triggers navExpanded=true.
  const canvasSurface = window.locator('[data-canvas-surface="true"]')
  await canvasSurface.dispatchEvent('wheel', { deltaX: 50, deltaY: 50 })
  await window.waitForTimeout(100)

  // The nav timer fires immediately (setNavExpanded(true)) — minimap should expand
  const anyThumb = window.locator('[data-testid^="minimap-thumb-"]').first()
  await expect(anyThumb).toBeVisible({ timeout: 3_000 })

  // Screenshot: expanded during navigation
  const shot4Path = path.join(SCREENSHOT_DIR, 'minimap-A4-expanded-during-nav.png')
  await window.screenshot({ path: shot4Path })
  console.log(`Screenshot A4 (nav-expanded): ${shot4Path}`)

  console.log('Test A-nav PASSED: minimap expands during navigation even when widget is active')
})

// ── Test B: Pin holds as canvas grows ─────────────────────────────────────

test('B: minimap stays anchored to bottom-right viewport corner as canvas grows', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId } = await setupTaskWithWidgets(window)

  await window.reload()
  await waitForReady(window)
  await openDesk(window, 'Minimap fix test')
  await dismissAssistant(window)

  // Wait for minimap to appear
  const anyThumb = window.locator('[data-testid^="minimap-thumb-"]').first()
  await expect(anyThumb).toBeVisible({ timeout: 5_000 })

  // Measure the canvas surface and minimap positions BEFORE adding widgets
  const before = await window.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    // The minimap widget is pinned; find it by looking for the widget that
    // contains a minimap-thumb element (the WidgetFrame that wraps MinimapWidget).
    // We can also locate the WidgetFrame pinned to BR by querying the pinned layer.
    // The minimap widget element wraps [data-testid^="minimap-thumb-"] ancestors.
    const thumbEl = document.querySelector<HTMLElement>('[data-testid^="minimap-thumb-"]')
    // Walk up to find the pinned widget root (the element with data-widget-id)
    let minimapEl: HTMLElement | null = thumbEl
    while (minimapEl && !minimapEl.dataset.widgetId) {
      minimapEl = minimapEl.parentElement
    }

    if (!surface || !minimapEl) return null

    const sr = surface.getBoundingClientRect()
    const mr = minimapEl.getBoundingClientRect()

    return {
      surfaceRight: sr.right,
      surfaceBottom: sr.bottom,
      surfaceLeft: sr.left,
      surfaceTop: sr.top,
      minimapRight: mr.right,
      minimapBottom: mr.bottom,
      minimapLeft: mr.left,
      minimapTop: mr.top,
      minimapWidth: mr.width,
      minimapHeight: mr.height,
      // Distance from minimap right edge to surface right edge (should be small)
      gapRight: sr.right - mr.right,
      // Distance from minimap bottom to surface bottom (should be small)
      gapBottom: sr.bottom - mr.bottom
    }
  })

  console.log('Before adding widgets:', JSON.stringify(before, null, 2))
  expect(before).not.toBeNull()

  // Screenshot: minimap position before
  const shotB1 = path.join(SCREENSHOT_DIR, 'minimap-B1-before-add-widgets.png')
  await window.screenshot({ path: shotB1 })
  console.log(`Screenshot B1 (before widgets): ${shotB1}`)

  // Add 8 widgets at large coordinates to push the canvas content far out
  await window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const positions = [
      { x: 1000, y: 800 },
      { x: 2000, y: 1500 },
      { x: 3000, y: 500 },
      { x: 500, y: 2500 },
      { x: 2500, y: 2000 },
      { x: 1500, y: 3000 },
      { x: 3500, y: 2500 },
      { x: 4000, y: 3000 }
    ]
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      await api.widgets.create({
        taskId: tid,
        kind: 'sticky',
        title: `Extra ${i}`,
        content: `extra-${i}`,
        x: p.x,
        y: p.y,
        width: 220,
        height: 180
      })
    }
  }, taskId)

  // Allow re-render after widget additions
  await window.waitForTimeout(600)

  // Measure again AFTER adding widgets
  const after = await window.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    const thumbEl = document.querySelector<HTMLElement>('[data-testid^="minimap-thumb-"]')
    let minimapEl: HTMLElement | null = thumbEl
    while (minimapEl && !minimapEl.dataset.widgetId) {
      minimapEl = minimapEl.parentElement
    }

    // Also check for collapsed state
    const collapsedEl = document.querySelector<HTMLElement>('[data-testid="minimap-collapsed"]')
    const targetEl = minimapEl ?? collapsedEl

    if (!surface || !targetEl) return null

    const sr = surface.getBoundingClientRect()
    const mr = targetEl.getBoundingClientRect()

    return {
      surfaceRight: sr.right,
      surfaceBottom: sr.bottom,
      surfaceLeft: sr.left,
      surfaceTop: sr.top,
      minimapRight: mr.right,
      minimapBottom: mr.bottom,
      minimapLeft: mr.left,
      minimapTop: mr.top,
      minimapWidth: mr.width,
      minimapHeight: mr.height,
      gapRight: sr.right - mr.right,
      gapBottom: sr.bottom - mr.bottom,
      // Also check that minimap is NOT near top-left (the bug symptom)
      distFromTopLeft: Math.sqrt(
        Math.pow(mr.left - sr.left, 2) + Math.pow(mr.top - sr.top, 2)
      )
    }
  })

  console.log('After adding widgets:', JSON.stringify(after, null, 2))
  expect(after).not.toBeNull()

  // Screenshot: minimap position after
  const shotB2 = path.join(SCREENSHOT_DIR, 'minimap-B2-after-add-widgets.png')
  await window.screenshot({ path: shotB2 })
  console.log(`Screenshot B2 (after widgets): ${shotB2}`)

  // The gap from the minimap's right/bottom edges to the surface right/bottom
  // should be small (within 400px — enough for padding + AI rail).
  // If the minimap jumped to top-left (0,0), gapRight and gapBottom would be
  // nearly the full surface dimensions, and distFromTopLeft would be near zero.
  expect(after!.gapRight).toBeLessThan(400)
  expect(after!.gapBottom).toBeLessThan(400)

  // The minimap must NOT be near the top-left corner of the canvas surface.
  // If it were broken, distFromTopLeft would be < 100 (it'd be AT 0,0).
  // With a correct BR pin, distFromTopLeft should be >> 300 (well away from TL).
  expect(after!.distFromTopLeft).toBeGreaterThan(300)

  // The pin position should not have moved significantly between before and after
  // (the minimap should stay fixed to the viewport corner, not drift with content)
  const gapRightDrift = Math.abs(after!.gapRight - before!.gapRight)
  const gapBottomDrift = Math.abs(after!.gapBottom - before!.gapBottom)
  console.log(`Gap drift — right: ${gapRightDrift}px, bottom: ${gapBottomDrift}px`)

  // Allow up to 50px drift for re-render settling; the minimap should not
  // have moved by 100s of pixels as content grows.
  expect(gapRightDrift).toBeLessThan(100)
  expect(gapBottomDrift).toBeLessThan(100)

  // Step B4: Pan the canvas a lot and confirm the minimap stays at the corner
  const canvasSurface = window.locator('[data-canvas-surface="true"]')
  // Large pan via wheel events
  for (let i = 0; i < 5; i++) {
    await canvasSurface.dispatchEvent('wheel', { deltaX: 200, deltaY: 200 })
    await window.waitForTimeout(50)
  }
  await window.waitForTimeout(400)

  // After panning, the minimap may be collapsed (nav timer expired) or expanded.
  // Either way its position should still be near the BR corner.
  const afterPan = await window.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    const thumbEl = document.querySelector<HTMLElement>('[data-testid^="minimap-thumb-"]')
    let minimapEl: HTMLElement | null = thumbEl
    while (minimapEl && !minimapEl.dataset.widgetId) {
      minimapEl = minimapEl.parentElement
    }
    const collapsedEl = document.querySelector<HTMLElement>('[data-testid="minimap-collapsed"]')
    const targetEl = minimapEl ?? collapsedEl

    if (!surface || !targetEl) return null

    const sr = surface.getBoundingClientRect()
    const mr = targetEl.getBoundingClientRect()

    return {
      gapRight: sr.right - mr.right,
      gapBottom: sr.bottom - mr.bottom,
      distFromTopLeft: Math.sqrt(
        Math.pow(mr.left - sr.left, 2) + Math.pow(mr.top - sr.top, 2)
      )
    }
  })

  console.log('After panning:', JSON.stringify(afterPan, null, 2))

  const shotB3 = path.join(SCREENSHOT_DIR, 'minimap-B3-after-pan.png')
  await window.screenshot({ path: shotB3 })
  console.log(`Screenshot B3 (after pan): ${shotB3}`)

  expect(afterPan).not.toBeNull()
  expect(afterPan!.gapRight).toBeLessThan(400)
  expect(afterPan!.gapBottom).toBeLessThan(400)
  expect(afterPan!.distFromTopLeft).toBeGreaterThan(300)

  console.log('Test B PASSED: minimap stayed anchored to BR corner throughout')
})
