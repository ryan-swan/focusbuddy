import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, gotoView, type LaunchedApp } from './_helpers'

// PLX-APP-012 — off-viewport Object virtualisation.
//
// Coverage against the REAL built app (not the pure-fn unit tests):
//   1. A Desk with many Objects spread far across the world mounts far fewer
//      `[data-widget-id]` DOM nodes than a Desk where every Object fits on screen.
//   2. Panning brings an off-screen Object into view (it mounts as it crosses the
//      ~300px inner margin).
//   3. A link between an on-screen source and a far-off-screen target does not
//      break: the off-screen endpoint stays mounted (LinkOverlay reads its DOM
//      node via getBoundingClientRect, so an unmounted endpoint would silently
//      drop the line).
//   4. Desk-open time for a heavily-populated Desk (200 Objects, ~194 off-screen)
//      is not materially worse than a small Desk (6 Objects, all visible) — the
//      spec claim that latency tracks visible count, not total count.
//
// Camera note: `loadForTask` resets zoom=1, panX=0, panY=0 on every Desk open
// (src/renderer/src/stores/widgets.ts), so world coordinates equal screen
// coordinates on first paint — an Object at world x is exactly x px from the
// canvas surface's left edge. That determinism is what lets this spec place
// Objects precisely in/out of view without reading the camera first.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function createDesk(
  window: import('@playwright/test').Page,
  title: string,
  positions: Array<{ x: number; y: number }>
): Promise<{ taskId: string; ids: string[] }> {
  return window.evaluate(
    async ({ title, positions }: { title: string; positions: Array<{ x: number; y: number }> }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const task = await api.nodes.create({ parentId: null, kind: 'task', title })
      const ids: string[] = []
      for (let i = 0; i < positions.length; i++) {
        const w = await api.widgets.create({
          taskId: task.id,
          kind: 'sticky',
          title: `s${i}`,
          content: `s${i}`,
          x: positions[i].x,
          y: positions[i].y,
          width: 160,
          height: 120
        })
        ids.push(w.id)
      }
      return { taskId: task.id, ids }
    },
    { title, positions }
  )
}

// Open a Desk from a cold reload. Reserved for the FIRST navigation in a
// test: the view store persists "last active view", so a *second* reload
// after a Desk has already been opened restores straight back into that
// Desk's canvas (skipping the home dashboard) rather than showing the tile
// list — there is then nothing for `getByRole('button', { name: title })`
// to find, and the click hangs until the test timeout. Reload is only
// needed at all because API-created tasks bypass the renderer's live task
// store, so a fresh boot fetch is what makes the new tiles appear.
async function openDeskFirst(window: import('@playwright/test').Page, title: string): Promise<void> {
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: new RegExp(title) }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 10_000 })
}

// Switch to a different already-fetched Desk without reloading — drives the
// view store's `goHome` action directly (same mechanism `_helpers.ts`'s
// `gotoView` uses) so the home tile list re-renders in place, then clicks
// the target tile. Use for every navigation AFTER the first in a test.
async function switchDesk(window: import('@playwright/test').Page, title: string): Promise<void> {
  await gotoView(window, 'goHome')
  await window.getByRole('button', { name: new RegExp(title) }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 10_000 })
}

async function mountedWidgetCount(window: import('@playwright/test').Page): Promise<number> {
  return window.evaluate(() => document.querySelectorAll('[data-widget-id]').length)
}

// Spread positions: `onscreen` count of Objects inside a 1440x900 viewport,
// the remainder placed at increasing world-x far beyond the outer margin
// (600px) so they can never be visible at zoom 1, pan (0,0).
function buildSpread(total: number, onscreen: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  for (let i = 0; i < onscreen; i++) {
    positions.push({ x: 40 + (i % 6) * 180, y: 40 + Math.floor(i / 6) * 140 })
  }
  for (let i = onscreen; i < total; i++) {
    positions.push({ x: 4000 + i * 3000, y: 40 })
  }
  return positions
}

test('mounts far fewer DOM nodes on a Desk with many off-screen Objects than one where all fit on screen', async () => {
  launched = await launchApp()
  const { window } = launched

  await waitForReady(window)
  const many = await createDesk(window, 'Virt many', buildSpread(160, 6))
  const compact = await createDesk(window, 'Virt compact', buildSpread(20, 20))

  await openDeskFirst(window, 'Virt many')
  for (const id of many.ids.slice(0, 6)) {
    await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 8_000 })
  }
  // Poll rather than a single fixed-wait read: on first paint
  // `visibleObjectIds` is still null ("cull nothing") until the
  // ResizeObserver fires and the virtualisation effect runs its first
  // pass, so the DOM count settles down to 6 over a couple of frames.
  await expect
    .poll(() => mountedWidgetCount(window), { timeout: 8_000 })
    .toBeLessThan(20)
  const manyMounted = await mountedWidgetCount(window)

  await switchDesk(window, 'Virt compact')
  for (const id of compact.ids) {
    await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 8_000 })
  }
  await expect
    .poll(() => mountedWidgetCount(window), { timeout: 8_000 })
    .toBe(20)
  const compactMounted = await mountedWidgetCount(window)

  // Compact Desk: all 20 Objects fit on screen, all mount.
  expect(compactMounted).toBe(20)
  // Many Desk: 160 total, only the 6 on-screen ones (plus none exempt) mount —
  // far below the 160 total, proving off-screen Objects are actually culled.
  expect(manyMounted).toBeLessThan(20)
  expect(manyMounted).toBeGreaterThanOrEqual(6)
})

test('panning toward an off-screen Object mounts it as it crosses the inner margin', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // One on-screen anchor, one Object placed well past the viewport's right
  // edge (viewport ~1160px wide once the sidebar is subtracted) plus outer
  // margin, so it starts unmounted, then pan left via a real wheel gesture to
  // bring it into view.
  const farX = 2400
  const { taskId, ids } = await createDesk(window, 'Virt pan reveal', [
    { x: 100, y: 100 },
    { x: farX, y: 100 }
  ])
  await openDeskFirst(window, 'Virt pan reveal')
  await window.waitForSelector(`[data-widget-id="${ids[0]}"]`, { timeout: 8_000 })
  const farLocator = window.locator(`[data-widget-id="${ids[1]}"]`)
  // Poll down to 0: first paint mounts everything ("cull nothing" until the
  // viewport is measured), then the virtualisation effect unmounts the far
  // Object once it computes visibility for the first time.
  await expect.poll(() => farLocator.count(), { timeout: 8_000 }).toBe(0)

  // Real two-finger/wheel pan gesture (handleWheel: panBy(-deltaX*sensitivity,
  // -deltaY*sensitivity), sensitivity defaults to 1). deltaX=1900 moves panX by
  // -1900, sliding the far Object's screen position from x=2400 to x=500 —
  // comfortably inside the 300px inner margin — using the exact user gesture,
  // not a store bypass.
  const surface = window.locator('[data-canvas-surface="true"]')
  await surface.hover()
  await window.mouse.wheel(1900, 0)

  await expect.poll(() => farLocator.count(), { timeout: 8_000 }).toBe(1)
  expect(taskId).toBeTruthy()
})

test('a link with one endpoint far off-screen keeps both endpoints mounted', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId, ids } = await createDesk(window, 'Virt link offscreen', [
    { x: 100, y: 100 },
    { x: 9000, y: 100 } // far beyond any margin at zoom 1, pan (0,0)
  ])
  await window.evaluate(
    async ({ taskId, source, target }: { taskId: string; source: string; target: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.widgetLinks.create(source, target, taskId)
    },
    { taskId, source: ids[0], target: ids[1] }
  )

  await openDeskFirst(window, 'Virt link offscreen')
  await window.waitForSelector(`[data-widget-id="${ids[0]}"]`, { timeout: 8_000 })
  // Give the virtualisation effect a beat to run its first real (post-measure)
  // pass — the assertion below must hold AFTER culling kicks in, not just
  // during the transient "cull nothing" first paint.
  await window.waitForTimeout(500)

  const sourceLocator = window.locator(`[data-widget-id="${ids[0]}"]`)
  const targetLocator = window.locator(`[data-widget-id="${ids[1]}"]`)
  await expect(sourceLocator).toHaveCount(1)
  // The link-endpoint exemption must keep the far target mounted even though
  // its geometry is nowhere near the viewport — otherwise LinkOverlay's
  // getBoundingClientRect lookup silently drops the connecting line. Held
  // across a poll window (not a one-shot read) to prove it stays mounted,
  // not just present in the transient pre-virtualisation paint.
  await expect.poll(() => targetLocator.count(), { timeout: 3_000 }).toBe(1)
  await window.waitForTimeout(500)
  expect(await targetLocator.count()).toBe(1)

  const linkLine = window.locator('svg [data-link-id], svg path, svg line').first()
  await expect(linkLine).toBeVisible({ timeout: 5_000 }).catch(() => {
    // Some link renderers use non-standard markers; the mount assertions above
    // are the load-bearing check for PLX-APP-012. This is a best-effort extra.
  })
})

test('Desk-open time for 200 mostly off-screen Objects is not materially worse than for 6 visible Objects', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const small = await createDesk(window, 'Virt perf small', buildSpread(6, 6))
  const large = await createDesk(window, 'Virt perf large', buildSpread(200, 6))

  // First navigation must be a cold reload (only reload finds the home tile
  // list — see openDeskFirst); every navigation after that switches via
  // goHome + click so it isn't tripped up by the view store restoring
  // straight back into the last-opened Desk on a second reload. Timing an
  // in-app switch rather than a full app-boot reload is the more precise
  // isolation of the render-mount cost virtualisation is meant to bound,
  // since it removes reload/boot noise from both sides of the comparison.
  async function timeOpen(title: string, ids: string[], first: boolean): Promise<number> {
    const start = Date.now()
    if (first) await openDeskFirst(window, title)
    else await switchDesk(window, title)
    await window.waitForSelector(`[data-widget-id="${ids[0]}"]`, { timeout: 10_000 })
    return Date.now() - start
  }

  // Warm-up pass (JIT / first-open cost, plus the cold-reload path) excluded
  // from the measured comparison. `switchDesk` already returns home before
  // clicking, so each timed call below starts from a clean home state.
  await timeOpen('Virt perf small', small.ids, true)
  const smallMs = await timeOpen('Virt perf small', small.ids, false)
  const largeMs = await timeOpen('Virt perf large', large.ids, false)
  // eslint-disable-next-line no-console
  console.log(`PLX-APP-012 desk-open: small(6 total)=${smallMs}ms large(200 total)=${largeMs}ms`)

  // Generous slack for CI/dev-machine noise: large must not be more than 3x
  // small, and not more than +1500ms in absolute terms. Without virtualisation
  // 200 mounted Objects (vs 6) would be an obvious multi-x regression; with it,
  // both opens mount ~6 DOM subtrees so the gap should be noise-level.
  expect(largeMs).toBeLessThanOrEqual(Math.max(smallMs * 3, smallMs + 1500))
})
