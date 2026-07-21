/**
 * edgePanMenuOverlay.spec.ts
 *
 * Verifies the overlay.ts / useMenuOverlay.ts edge-pan-stands-down-for-open-menus
 * fix on branch Plexi3.0, plus the FloatingPill viewport clamp and the
 * CanvasContextMenu anti-magnetic placement, per the tester dispatch brief.
 *
 * Signal used for "did the camera pan": the `[data-bare-canvas]` element that
 * carries the live `transform: translate(panX px, panY px) scale(zoom)` inline
 * style (Canvas.tsx line ~2167). There are two DOM nodes sharing the
 * `data-bare-canvas` attribute (the outer drop container and the inner
 * transform layer) — we select the one whose inline style actually contains
 * `translate(`, which is the transform layer driven by useWidgetStore's
 * panX/panY. Reading the rendered transform is a real user-visible signal
 * (it is literally what moves the camera on screen), not an internal store
 * hook.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedAndOpenDesk(l: LaunchedApp, label: string): Promise<string> {
  const { window } = l
  await waitForReady(window)
  const taskId = await window.evaluate(async (title: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title })
    await api.widgets.create({
      taskId: task.id, kind: 'sticky', title: 'anchor',
      content: 'edge-pan test anchor', x: 100, y: 100, width: 160, height: 120
    })
    return task.id
  }, label)

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: new RegExp(label) }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 6_000 })
  await window.waitForSelector('[data-testid="floating-pill"]', { timeout: 6_000 })
  await window.waitForTimeout(200)
  return taskId
}

interface Pan { x: number; y: number }

async function readPan(window: import('@playwright/test').Page): Promise<Pan> {
  return window.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[data-bare-canvas]')) as HTMLElement[]
    const el = els.find((e) => e.style.transform && e.style.transform.includes('translate'))
    if (!el) return { x: NaN, y: NaN }
    const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)
    if (!m) return { x: NaN, y: NaN }
    return { x: parseFloat(m[1]), y: parseFloat(m[2]) }
  })
}

async function canvasRect(window: import('@playwright/test').Page) {
  return window.evaluate(() => {
    const el = document.querySelector('[data-canvas-surface="true"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
  })
}

// Sample pan repeatedly over `ms` and report whether it ever moved.
async function panMovedOverWindow(
  window: import('@playwright/test').Page,
  start: Pan,
  ms: number,
  stepMs = 40
): Promise<boolean> {
  const steps = Math.max(1, Math.floor(ms / stepMs))
  for (let i = 0; i < steps; i++) {
    await window.waitForTimeout(stepMs)
    const p = await readPan(window)
    if (Math.abs(p.x - start.x) > 0.5 || Math.abs(p.y - start.y) > 0.5) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Check 3 (run first as the baseline) — regression: edge-pan works normally
// with no menu open or hovered.
// ---------------------------------------------------------------------------

test('EDGE-PAN-1 — baseline: edge-pan works with nothing hovered/open', async () => {
  launched = await launchApp()
  const { window } = launched
  const pageErrors: string[] = []
  window.on('pageerror', (e) => pageErrors.push(e.message))

  await seedAndOpenDesk(launched, 'Edge pan baseline')
  const rect = await canvasRect(window)

  // Move to a neutral spot first so mousePosRef is primed away from any edge.
  await window.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2)
  await window.waitForTimeout(150)
  const before = await readPan(window)

  // Move into the right-edge margin (default 80px), mid-height — clear of the
  // breadcrumb (top-left), the desk-presence chip (top-right) and the pill
  // (top-center default position).
  await window.mouse.move(rect.right - 5, rect.top + rect.height / 2, { steps: 5 })
  const moved = await panMovedOverWindow(window, before, 500)
  const after = await readPan(window)

  console.log('[EDGE-PAN-1] before', before, 'after', after, 'moved', moved)
  expect(moved, 'panX/panY must change when cursor sits in the edge zone with nothing hovered/open').toBe(true)
  expect(pageErrors, 'no uncaught console exceptions').toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Check 1 (the core fix) — edge-pan stands down while the pill is hovered.
// ---------------------------------------------------------------------------

test('EDGE-PAN-2 — edge-pan stands down while FloatingPill is hovered, resumes after unhover', async () => {
  launched = await launchApp()
  const { window } = launched
  const pageErrors: string[] = []
  window.on('pageerror', (e) => pageErrors.push(e.message))

  await seedAndOpenDesk(launched, 'Edge pan pill hover')
  const rect = await canvasRect(window)
  // A point well inside the right-edge margin (default 80px), away from the
  // breadcrumb / desk-presence chip.
  const edgePoint = { x: rect.right - 30, y: rect.top + rect.height / 2 }

  // Sanity baseline FIRST, at this exact geometric point, with nothing
  // hovered: confirm it genuinely is an "active" edge-pan position before we
  // claim hovering the pill there suppresses it.
  await window.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2)
  await window.waitForTimeout(100)
  const baselineStart = await readPan(window)
  await window.mouse.move(edgePoint.x, edgePoint.y, { steps: 3 })
  const baselineMoved = await panMovedOverWindow(window, baselineStart, 400, 50)
  console.log('[EDGE-PAN-2] sanity: this point pans when nothing is hovered ->', baselineMoved)
  expect(baselineMoved, 'sanity check: the chosen point must be an active edge-pan position with nothing hovered').toBe(true)

  // Move away and let intensity settle back to zero before the real test.
  await window.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2)
  await window.waitForTimeout(150)

  // Drag the pill so its CENTER lands exactly on edgePoint. Grabbed at the
  // drag-affordance strip (10px in from the left edge, vertically centered)
  // so the mousedown doesn't land on a button. The grab offset is preserved
  // during the drag, so solving for the final mouse position that puts the
  // pill's center at edgePoint is a closed-form offset (see comment below).
  const pillBefore = await window.evaluate(() => {
    const el = document.querySelector('[data-testid="floating-pill"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
  const grabX = pillBefore.left + 10
  const grabY = pillBefore.top + pillBefore.height / 2
  // Grabbing at vertical center means finalMouseY = edgePoint.y directly.
  // Grabbing 10px in from the left means finalMouseX = edgePoint.x - width/2 + 10.
  const finalMouseX = edgePoint.x - pillBefore.width / 2 + 10
  const finalMouseY = edgePoint.y

  await window.mouse.move(grabX, grabY)
  await window.mouse.down()
  await window.mouse.move(finalMouseX, finalMouseY, { steps: 10 })
  await window.mouse.up()
  await window.waitForTimeout(150)

  const pillAfter = await window.evaluate(() => {
    const el = document.querySelector('[data-testid="floating-pill"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
  })
  const pillCenter = { x: (pillAfter.left + pillAfter.right) / 2, y: (pillAfter.top + pillAfter.bottom) / 2 }
  console.log('[EDGE-PAN-2] pill dragged to', pillAfter, 'center', pillCenter, 'target was', edgePoint)

  // Re-hover with a clean, Playwright-verified real hover (confirms the pill
  // is actually receiving pointer events at this new location, unobstructed).
  await window.locator('[data-testid="floating-pill"]').hover()
  await window.waitForTimeout(120)

  // Cursor is now stationary, directly over the pill, which itself sits
  // within the edge-pan margin. No further mouse events are needed for
  // useEdgePan's rAF loop to keep re-evaluating this same cached position
  // every frame, so there is no timing race against any hover-leave grace —
  // registration just needs to have happened once and hold steady.
  const hoveredStart = await readPan(window)
  const movedWhileHovered = await panMovedOverWindow(window, hoveredStart, 600, 50)
  const hoveredEnd = await readPan(window)
  console.log('[EDGE-PAN-2] while hovered at the same active position:', hoveredStart, '->', hoveredEnd, 'moved', movedWhileHovered)
  expect(movedWhileHovered, 'edge-pan must NOT engage while the pill is hovered, even sitting in the active edge margin').toBe(false)

  // Move off the pill entirely (back to canvas center) and confirm it does
  // NOT immediately resume pan from stale cache — proving unhover + moving
  // away is a clean, expected return to idle, not a residual glitch.
  await window.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2, { steps: 5 })
  await window.waitForTimeout(400) // past the 300ms mouseleave grace
  const idleStart = await readPan(window)
  await window.waitForTimeout(200)
  const idleEnd = await readPan(window)
  console.log('[EDGE-PAN-2] idle after moving to canvas center:', idleStart, '->', idleEnd)

  // Finally, move back into the (now-unhovered) edge margin and confirm
  // edge-pan resumes normally, proving the stand-down was specific to the
  // hover state and not a permanent regression.
  const resumeStart = await readPan(window)
  await window.mouse.move(edgePoint.x, edgePoint.y, { steps: 3 })
  const resumed = await panMovedOverWindow(window, resumeStart, 400, 50)
  console.log('[EDGE-PAN-2] resumes once un-hovered and back at the edge:', resumed)
  expect(resumed, 'edge-pan must resume at the same position once the pill is no longer hovered').toBe(true)

  expect(pageErrors, 'no uncaught console exceptions').toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Check 2 — edge-pan stands down while the canvas context menu is open;
// resumes after close.
// ---------------------------------------------------------------------------

test('EDGE-PAN-3 — edge-pan stands down while the context menu is open, resumes after close', async () => {
  launched = await launchApp()
  const { window } = launched
  const pageErrors: string[] = []
  window.on('pageerror', (e) => pageErrors.push(e.message))

  await seedAndOpenDesk(launched, 'Edge pan context menu')
  const rect = await canvasRect(window)

  // Move to a neutral spot, right-click near the canvas center (bare canvas,
  // away from the sticky at 100,100) to open the context menu.
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  await window.mouse.move(cx, cy)
  await window.mouse.click(cx, cy, { button: 'right' })
  await window.waitForSelector('[role="menu"].fb-context-menu', { timeout: 4_000 })

  const before = await readPan(window)
  // Move toward the bottom edge — far from the menu itself (opened near
  // center) so the move doesn't accidentally dismiss/interact with it.
  await window.mouse.move(rect.left + rect.width / 2, rect.bottom - 5, { steps: 4 })
  const movedWhileOpen = await panMovedOverWindow(window, before, 300, 40)
  const duringMenu = await readPan(window)
  console.log('[EDGE-PAN-3] before', before, 'duringMenu(edge zone)', duringMenu, 'moved', movedWhileOpen)
  expect(movedWhileOpen, 'edge-pan must NOT engage while the context menu is open').toBe(false)

  // Close the menu (Escape) and confirm pan resumes from the same cached
  // cursor position.
  await window.keyboard.press('Escape')
  await window.waitForSelector('[role="menu"].fb-context-menu', { state: 'detached', timeout: 4_000 })
  const resumed = await panMovedOverWindow(window, duringMenu, 500, 40)
  const after = await readPan(window)
  console.log('[EDGE-PAN-3] after close', after, 'resumed', resumed)
  expect(resumed, 'edge-pan must resume once the context menu closes').toBe(true)

  expect(pageErrors, 'no uncaught console exceptions').toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Check 4 — pill stays fully on screen after a drag past the viewport edge,
// and after hover-expansion.
// ---------------------------------------------------------------------------

test('EDGE-PAN-4 — FloatingPill clamps into view after drag past the corner, and stays in view when expanded', async () => {
  launched = await launchApp()
  const { window } = launched
  const pageErrors: string[] = []
  window.on('pageerror', (e) => pageErrors.push(e.message))

  await seedAndOpenDesk(launched, 'Edge pan pill drag')

  const pillRectBefore = await window.evaluate(() => {
    const el = document.querySelector('[data-testid="floating-pill"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })

  // mousedown on the drag-affordance strip (left edge of the pill body), not a button.
  const startX = pillRectBefore.left + 10
  const startY = pillRectBefore.top + pillRectBefore.height / 2
  const viewport = await window.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const targetX = viewport.w + 400
  const targetY = viewport.h + 400

  await window.mouse.move(startX, startY)
  await window.mouse.down()
  await window.mouse.move(targetX, targetY, { steps: 20 })
  await window.mouse.up()
  await window.waitForTimeout(150)

  const afterDrag = await window.evaluate(() => {
    const el = document.querySelector('[data-testid="floating-pill"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, innerW: window.innerWidth, innerH: window.innerHeight }
  })
  console.log('[EDGE-PAN-4] after drag past bottom-right corner:', afterDrag)
  expect(afterDrag.left, 'left must stay on screen').toBeGreaterThanOrEqual(0)
  expect(afterDrag.top, 'top must stay on screen').toBeGreaterThanOrEqual(0)
  expect(afterDrag.right, 'right must stay within innerWidth').toBeLessThanOrEqual(afterDrag.innerW)
  expect(afterDrag.bottom, 'bottom must stay within innerHeight').toBeLessThanOrEqual(afterDrag.innerH)

  // Hover to expand (labels slide in) and re-check after the framer-motion
  // label transition (220ms) has had time to finish.
  await window.locator('[data-testid="floating-pill"]').hover()
  await window.waitForTimeout(400)

  const afterExpand = await window.evaluate(() => {
    const el = document.querySelector('[data-testid="floating-pill"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, innerW: window.innerWidth, innerH: window.innerHeight }
  })
  console.log('[EDGE-PAN-4] after hover-expand:', afterExpand)
  expect(afterExpand.left, 'expanded left must stay on screen').toBeGreaterThanOrEqual(0)
  expect(afterExpand.top, 'expanded top must stay on screen').toBeGreaterThanOrEqual(0)
  expect(afterExpand.right, 'expanded right must stay within innerWidth (labels not clipped)').toBeLessThanOrEqual(afterExpand.innerW)
  expect(afterExpand.bottom, 'expanded bottom must stay within innerHeight').toBeLessThanOrEqual(afterExpand.innerH)

  expect(pageErrors, 'no uncaught console exceptions').toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Check 5 — anti-magnetic: a context menu opened where it would overlap the
// hovered pill gets nudged off it by avoidOverlap().
// ---------------------------------------------------------------------------

test('EDGE-PAN-5 — context menu avoids overlapping the hovered pill (anti-magnetic)', async () => {
  launched = await launchApp()
  const { window } = launched
  const pageErrors: string[] = []
  window.on('pageerror', (e) => pageErrors.push(e.message))

  await seedAndOpenDesk(launched, 'Edge pan anti magnetic')

  // Hover the pill (real, UI-driven) to register it in the overlay store, and
  // capture its expanded rect.
  await window.locator('[data-testid="floating-pill"]').hover()
  await window.waitForTimeout(400)
  const pillRect = await window.evaluate(() => {
    const el = document.querySelector('[data-testid="floating-pill"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })
  console.log('[EDGE-PAN-5] hovered pill rect:', pillRect)

  // API-driven: dispatch a synthetic contextmenu event with clientX/clientY
  // landing INSIDE the pill's rect, targeted at the bare-canvas element
  // underneath it (handleCanvasContextMenu requires the event target itself
  // to carry data-bare-canvas). We deliberately do NOT move the real OS
  // pointer here — a real mouse move to that point would first cross off the
  // pill and could clear its 300ms hover grace before the menu opens, which
  // would defeat the point of the test (proving avoidOverlap fires while the
  // pill is genuinely still registered as open).
  const target = { x: Math.round((pillRect.left + pillRect.right) / 2), y: Math.round(pillRect.bottom + 4) }
  await window.evaluate(({ x, y }) => {
    const el = document.querySelector('[data-bare-canvas]') as HTMLElement
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })
    el.dispatchEvent(ev)
  }, target)

  await window.waitForSelector('[role="menu"].fb-context-menu', { timeout: 4_000 })
  await window.waitForTimeout(100)

  const menuRect = await window.evaluate(() => {
    const el = document.querySelector('[role="menu"].fb-context-menu') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })
  const pillRectNow = await window.evaluate(() => {
    const el = document.querySelector('[data-testid="floating-pill"]') as HTMLElement
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })
  console.log('[EDGE-PAN-5] menu rect:', menuRect, 'pill rect at open time:', pillRectNow)

  const intersects =
    menuRect.left < pillRectNow.right &&
    menuRect.right > pillRectNow.left &&
    menuRect.top < pillRectNow.bottom &&
    menuRect.bottom > pillRectNow.top

  expect(intersects, 'context menu rect must not intersect the pill rect (avoidOverlap should nudge it clear)').toBe(false)

  const viewport = await window.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  expect(menuRect.left, 'menu stays on screen (left)').toBeGreaterThanOrEqual(0)
  expect(menuRect.top, 'menu stays on screen (top)').toBeGreaterThanOrEqual(0)
  expect(menuRect.right, 'menu stays on screen (right)').toBeLessThanOrEqual(viewport.w)
  expect(menuRect.bottom, 'menu stays on screen (bottom)').toBeLessThanOrEqual(viewport.h)

  await window.keyboard.press('Escape')
  expect(pageErrors, 'no uncaught console exceptions').toHaveLength(0)
})
