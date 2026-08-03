import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// N4 move-boss (horizontal push): dropping a widget on top of free neighbours
// keeps the DROPPED widget put (boss, unchanged) and slides each overlapped
// neighbour HORIZONTALLY — toward the side it already sits on relative to the
// anchor — keeping its row (y unchanged). This is the axis='horizontal'
// default added to resolvePushFromAnchor in sectionGeometry.ts; the only
// caller is WidgetFrame.tsx's commitDrop canvas-level drop block (unchanged
// wiring). Sections remain immovable blockers that pushed widgets route
// around without ever overlapping them or the anchor.
//
// Driven via the same in-page MouseEvent dispatch dragPriority.spec.ts uses
// (dispatchDragBy) — real Playwright CDP mouse drags on react-rnd are not
// reliable in headless Electron (see dragPriority.spec.ts comment), so this
// fires real mousedown/mousemove/mouseup DOM events against the widget
// handle, which reaches both React's delegated listener and DraggableCore's
// document-level listeners and exercises the exact commitDrop code path.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

type Rect = { x: number; y: number; width: number; height: number }

async function seedTaskWith(
  l: LaunchedApp,
  items: Array<Rect & { kind: 'sticky' | 'section' }>
): Promise<{ taskId: string; ids: string[] }> {
  const { window } = l
  await waitForReady(window)
  const seeded = await window.evaluate(async (its) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'N4 push test' })
    const ids: string[] = []
    for (let i = 0; i < its.length; i++) {
      const it = its[i]
      const w = await api.widgets.create({
        taskId: task.id,
        kind: it.kind,
        title: it.kind === 'section' ? 'Section' : `w${i}`,
        content: it.kind === 'section' ? '' : `w${i}`,
        x: it.x,
        y: it.y,
        width: it.width,
        height: it.height,
        ...(it.kind === 'section' ? { color: '#3b82f6' } : {})
      })
      ids.push(w.id)
    }
    return { taskId: task.id, ids }
  }, items)

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /N4 push test/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  for (const id of seeded.ids) {
    await window.waitForSelector(`[data-widget-id="${id}"]`, { timeout: 5_000 })
  }
  await window.waitForTimeout(250)
  return seeded
}

async function listWidgets(
  l: LaunchedApp,
  taskId: string
): Promise<Array<{ id: string; x: number; y: number; width: number; height: number }>> {
  return l.window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const all = await api.widgets.listByTask(tid)
    return all.map((w) => ({ id: w.id, x: w.x, y: w.y, width: w.width, height: w.height }))
  }, taskId)
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x + a.width <= b.x || a.x >= b.x + b.width || a.y + a.height <= b.y || a.y >= b.y + b.height)
}

// Same mechanism as dragPriority.spec.ts's dispatchDragBy — fires real
// MouseEvent objects in-page so both React's delegated handle listener and
// DraggableCore's document listeners see the gesture, which is what actually
// drives commitDrop/resolvePushFromAnchor deterministically in headless
// Electron (native Playwright pointer drag on react-rnd is unreliable there).
async function dispatchDragBy(l: LaunchedApp, widgetId: string, dx: number, dy: number): Promise<void> {
  await l.window.evaluate(
    async ({ widgetId, dx, dy }) => {
      const handle = document.querySelector(`[data-widget-id="${widgetId}"] .widget-handle`) as HTMLElement | null
      if (!handle) throw new Error('no widget-handle found')
      const box = handle.getBoundingClientRect()
      const startX = box.left + box.width / 2
      const startY = box.top + Math.min(20, box.height / 2)
      const fire = (target: EventTarget, type: string, x: number, y: number): void => {
        target.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, clientX: x, clientY: y })
        )
      }
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      fire(handle, 'mousedown', startX, startY)
      await sleep(20)
      const steps = 20
      for (let i = 1; i <= steps; i++) {
        fire(document, 'mousemove', startX + (dx * i) / steps, startY + (dy * i) / steps)
        await sleep(10)
      }
      await sleep(20)
      fire(document, 'mouseup', startX + dx, startY + dy)
    },
    { widgetId, dx, dy }
  )
  await l.window.waitForTimeout(400)
}

test('(a) dragging A onto B keeps A put (boss) and slides B horizontally, same row', async () => {
  launched = await launchApp()

  const A = { x: 60, y: 60, width: 200, height: 150, kind: 'sticky' as const }
  const B = { x: 600, y: 60, width: 200, height: 150, kind: 'sticky' as const }
  const { taskId, ids } = await seedTaskWith(launched, [A, B])
  const [idA, idB] = ids

  const before = await listWidgets(launched, taskId)
  const bBefore = before.find((w) => w.id === idB)!

  // Drag A (60,60) so it lands on top of B: delta (540,40) -> top-left ~(600,100).
  const dx = 540
  const dy = 40
  await dispatchDragBy(launched, idA, dx, dy)

  const after = await listWidgets(launched, taskId)
  const aAfter = after.find((w) => w.id === idA)!
  const bAfter = after.find((w) => w.id === idB)!

  // A (the boss) commits to the drop point, unmoved by the push logic.
  expect(Math.abs(aAfter.x - (A.x + dx))).toBeLessThanOrEqual(20)
  expect(Math.abs(aAfter.y - (A.y + dy))).toBeLessThanOrEqual(20)

  // B was in the way: it moved, no longer overlaps A, AND its row (y) is
  // unchanged — the N4 behaviour change (was: nearest clear spot, any
  // direction; now: horizontal slide only).
  expect(bAfter.x).not.toBe(bBefore.x)
  expect(bAfter.y).toBe(bBefore.y)
  expect(overlaps(aAfter, bAfter)).toBe(false)
  // B sat to the right of A's drop point, so it should be pushed further right.
  expect(bAfter.x).toBeGreaterThan(bBefore.x)
})

test('(b) anchor with a neighbour on each side: both stay on their row, no residual overlaps', async () => {
  launched = await launchApp()

  // L and R straddle the point A will be dropped onto (gap between them is
  // only 40px, so a 200-wide drop in the middle overlaps both at once).
  const L = { x: 200, y: 200, width: 180, height: 120, kind: 'sticky' as const }
  const R = { x: 420, y: 200, width: 180, height: 120, kind: 'sticky' as const }
  const A = { x: 60, y: 500, width: 200, height: 120, kind: 'sticky' as const } // starts clear of both
  const { taskId, ids } = await seedTaskWith(launched, [A, L, R])
  const [idA, idL, idR] = ids

  const before = await listWidgets(launched, taskId)
  const lBefore = before.find((w) => w.id === idL)!
  const rBefore = before.find((w) => w.id === idR)!

  // Drag A from (60,500) to land at (300,200): dx=240, dy=-300. A's rect
  // [300,500]x[200,320] overlaps both L ([200,380]) and R ([420,600]).
  const dx = 240
  const dy = -300
  await dispatchDragBy(launched, idA, dx, dy)

  const after = await listWidgets(launched, taskId)
  const aAfter = after.find((w) => w.id === idA)!
  const lAfter = after.find((w) => w.id === idL)!
  const rAfter = after.find((w) => w.id === idR)!

  // Anchor committed near the drop point.
  expect(Math.abs(aAfter.x - (A.x + dx))).toBeLessThanOrEqual(20)
  expect(Math.abs(aAfter.y - (A.y + dy))).toBeLessThanOrEqual(20)

  // Both neighbours kept their row.
  expect(lAfter.y).toBe(lBefore.y)
  expect(rAfter.y).toBe(rBefore.y)

  // L (sat left of the drop point) went further left; R (sat right) went
  // further right — pushed apart, not relocated to some other row.
  expect(lAfter.x).toBeLessThan(lBefore.x)
  expect(rAfter.x).toBeGreaterThan(rBefore.x)

  // No residual overlap between any pair.
  expect(overlaps(aAfter, lAfter)).toBe(false)
  expect(overlaps(aAfter, rAfter)).toBe(false)
  expect(overlaps(lAfter, rAfter)).toBe(false)
})

test('(c) a section is an immovable blocker: pushed widget routes around it, never overlaps it or the anchor', async () => {
  launched = await launchApp()

  // N sits where dropping A will overlap it, and a section wall sits directly
  // to N's preferred (right) side — N must route past the section, not stop
  // short and overlap it, and must never touch the anchor either.
  const N = { x: 350, y: 200, width: 180, height: 120, kind: 'sticky' as const }
  const S = { x: 520, y: 150, width: 150, height: 300, kind: 'section' as const }
  const A = { x: 60, y: 500, width: 200, height: 120, kind: 'sticky' as const } // starts clear
  const { taskId, ids } = await seedTaskWith(launched, [A, N, S])
  const [idA, idN, idS] = ids

  const before = await listWidgets(launched, taskId)
  const nBefore = before.find((w) => w.id === idN)!
  const sBefore = before.find((w) => w.id === idS)!

  // Drag A from (60,500) to (300,200): dx=240, dy=-300. A's rect [300,500]x[200,320]
  // overlaps N ([350,530]x[200,320]); N's preferred push side (right, toward the
  // section) is blocked, so it must slide past S.
  const dx = 240
  const dy = -300
  await dispatchDragBy(launched, idA, dx, dy)

  const after = await listWidgets(launched, taskId)
  const aAfter = after.find((w) => w.id === idA)!
  const nAfter = after.find((w) => w.id === idN)!
  const sAfter = after.find((w) => w.id === idS)!

  // The section itself never moves — it's an immovable blocker.
  expect(sAfter.x).toBe(sBefore.x)
  expect(sAfter.y).toBe(sBefore.y)

  // Anchor committed near the drop point.
  expect(Math.abs(aAfter.x - (A.x + dx))).toBeLessThanOrEqual(20)
  expect(Math.abs(aAfter.y - (A.y + dy))).toBeLessThanOrEqual(20)

  // N routed around the section: pushed further right than the section's far
  // edge, kept its row, and never overlaps either the anchor or the section.
  expect(nAfter.y).toBe(nBefore.y)
  expect(nAfter.x).toBeGreaterThanOrEqual(sAfter.x + sAfter.width)
  expect(overlaps(aAfter, nAfter)).toBe(false)
  expect(overlaps(sAfter, nAfter)).toBe(false)
})
