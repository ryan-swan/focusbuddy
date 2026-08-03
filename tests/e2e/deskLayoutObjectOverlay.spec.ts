import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// PLX-APP-010 Phase 2 (ADR-0006) — opt-in per-(user, device class) Object-geometry
// overlay. The core contract, verified against the built app:
//   1. With the Desk opted in, moving a top-level Object routes to the personal
//      overlay: the SHARED BASE (widgets table) is unchanged, so the move never
//      syncs. This is the per-user-isolation proof.
//   2. The overlay persists (desk_layouts) and wins on reopen.
//   3. Opting out clears the overlay and reverts the Desk to the shared base.
//   4. Section children are excluded: moving one writes to the shared base as
//      before and never enters the overlay.
//   5. Default (not opted in) is unchanged: a move writes to the shared base.
//
// Driven through the real widget store handle (window.__fbWidgets, mirroring the
// __fbView handle the camera-overlay spec uses) so moves are deterministic rather
// than depending on drag snapping, and navigation uses goTask like the other
// canvas specs.

interface W {
  id: string
  x: number
  y: number
  parentSectionId: string | null
}

async function baseWidget(window: Page, deskId: string, widgetId: string): Promise<W> {
  return window.evaluate(
    async ({ deskId, widgetId }) => {
      const list = (await window.api.widgets.listByTask(deskId)) as Array<{
        id: string
        x: number
        y: number
        parentSectionId: string | null
      }>
      const w = list.find((x) => x.id === widgetId)!
      return { id: w.id, x: w.x, y: w.y, parentSectionId: w.parentSectionId }
    },
    { deskId, widgetId }
  )
}

function memWidget(window: Page, widgetId: string): Promise<{ x: number; y: number } | null> {
  return window.evaluate((id) => {
    const s = (window as unknown as { __fbWidgets?: { getState: () => { widgets: Array<{ id: string; x: number; y: number }> } } }).__fbWidgets
    const w = s?.getState().widgets.find((x) => x.id === id)
    return w ? { x: w.x, y: w.y } : null
  }, widgetId)
}

function overlayObjects(window: Page, deskId: string): Promise<{ customLayout: boolean; objects: Array<{ objectId: string; x: number; y: number }> } | null> {
  return window.evaluate(async (id) => {
    const l = await window.api.deskLayout.load('local', id, 'desktop')
    return l ? { customLayout: l.customLayout === true, objects: l.objects } : null
  }, deskId)
}

async function openDesk(window: Page, deskId: string): Promise<void> {
  await window.evaluate((tid) => {
    const w = window as unknown as {
      __fbNodes?: { getState: () => { setActive: (id: string) => void } }
      __fbView?: { getState: () => { goTask: (id: string) => void } }
    }
    w.__fbNodes?.getState().setActive(tid)
    w.__fbView?.getState().goTask(tid)
  }, deskId)
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
}

async function setCustom(window: Page, enabled: boolean): Promise<void> {
  await window.evaluate((en) => {
    const s = (window as unknown as { __fbWidgets?: { getState: () => { setDeskCustomLayout: (b: boolean) => Promise<void> } } }).__fbWidgets
    return s?.getState().setDeskCustomLayout(en)
  }, enabled)
}

async function moveWidget(window: Page, id: string, x: number, y: number): Promise<void> {
  await window.evaluate(
    ({ id, x, y }) => {
      const s = (window as unknown as { __fbWidgets?: { getState: () => { update: (id: string, p: { x: number; y: number }) => Promise<void> } } }).__fbWidgets
      return s?.getState().update(id, { x, y })
    },
    { id, x, y }
  )
}

test('opted-in move stays in the personal overlay, leaves the shared base untouched, restores on reopen, reverts on opt-out', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const seeded = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const a = await api.nodes.create({ parentId: null, kind: 'task', title: 'Overlay Desk A' })
      const b = await api.nodes.create({ parentId: null, kind: 'task', title: 'Overlay Desk B' })
      const w = await api.widgets.create({ taskId: a.id, kind: 'sticky', title: '', content: 'move me', x: 300, y: 200, width: 240, height: 180 })
      return { deskAId: a.id, deskBId: b.id, widgetId: w.id }
    })
    await window.reload()
    await waitForReady(window)
    await openDesk(window, seeded.deskAId)

    // Opt in, then move the Object to a distinct spot.
    await setCustom(window, true)
    await moveWidget(window, seeded.widgetId, 900, 640)
    await window.waitForTimeout(900) // past the 600ms overlay-save debounce

    // 1. Shared base is UNCHANGED — the move never touched the widgets table.
    const base = await baseWidget(window, seeded.deskAId, seeded.widgetId)
    expect(base.x, 'shared base x unchanged after an opted-in move').toBe(300)
    expect(base.y).toBe(200)

    // 2. The overlay captured the move.
    const ov = await overlayObjects(window, seeded.deskAId)
    expect(ov?.customLayout).toBe(true)
    const entry = ov?.objects.find((o) => o.objectId === seeded.widgetId)
    expect(entry, 'overlay holds the moved Object').toBeTruthy()
    expect(entry!.x).toBe(900)
    expect(entry!.y).toBe(640)

    // In-memory (what the user sees) reflects the move.
    expect(await memWidget(window, seeded.widgetId)).toEqual({ x: 900, y: 640 })

    // 3. Switch away and back: the overlay wins on reopen.
    await openDesk(window, seeded.deskBId)
    await openDesk(window, seeded.deskAId)
    await window.waitForSelector(`[data-widget-id="${seeded.widgetId}"]`, { timeout: 8_000 })
    await window.waitForTimeout(200)
    expect(await memWidget(window, seeded.widgetId), 'overlay restored on reopen').toEqual({ x: 900, y: 640 })

    // 4. Opt out: the overlay clears and the Desk reverts to the shared base.
    await setCustom(window, false)
    await window.waitForTimeout(400)
    expect(await memWidget(window, seeded.widgetId), 'reverted to shared base on opt-out').toEqual({ x: 300, y: 200 })
    const ovOff = await overlayObjects(window, seeded.deskAId)
    expect(ovOff?.customLayout).toBe(false)
    expect(ovOff?.objects ?? []).toEqual([])
  } finally {
    await dispose()
  }
})

test('section children are excluded from the overlay: their moves write to the shared base even when opted in', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const seeded = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const a = await api.nodes.create({ parentId: null, kind: 'task', title: 'Overlay Section Desk' })
      const sec = await api.widgets.create({ taskId: a.id, kind: 'section', title: 'Sec', content: '', x: 60, y: 60, width: 600, height: 400 })
      const child = await api.widgets.create({ taskId: a.id, kind: 'sticky', title: '', content: 'child', x: 20, y: 20, width: 160, height: 120 })
      // Make the sticky a section child.
      await api.widgets.update(child.id, { parentSectionId: sec.id })
      return { deskId: a.id, childId: child.id }
    })
    await window.reload()
    await waitForReady(window)
    await openDesk(window, seeded.deskId)

    await setCustom(window, true)
    // Move the SECTION CHILD (ineligible). It must go to the shared base, not the overlay.
    await moveWidget(window, seeded.childId, 999, 999)
    await window.waitForTimeout(900)

    const base = await baseWidget(window, seeded.deskId, seeded.childId)
    expect(base.parentSectionId, 'still a section child').not.toBeNull()
    expect(base.x, 'section child move wrote to the shared base').toBe(999)
    expect(base.y).toBe(999)

    const ov = await overlayObjects(window, seeded.deskId)
    expect(ov?.objects.some((o) => o.objectId === seeded.childId), 'section child never enters the overlay').toBe(false)
  } finally {
    await dispose()
  }
})
