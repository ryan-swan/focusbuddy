import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Copy-vs-Sync choice at creation — drives the REAL widget context-menu
// handlers (not the IPC layer), so it catches breakage between the store/UI
// wiring and the DB propagation that syncedWidgets.spec.ts (IPC-level) cannot.
//
//   • "Duplicate (keep synced)"      → both copies share a syncGroupId; edits mirror.
//   • "Duplicate (independent copy)" → no syncGroupId; the two never affect each other.
//   • The synced copy exposes "Unlink from synced copies"; the independent one does not.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function seedStickyAndOpen(
  l: LaunchedApp
): Promise<{ taskId: string; widgetId: string }> {
  const { window } = l
  await waitForReady(window)

  const seeded = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Sync choice test' })
    const w = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'original',
      content: 'v1',
      x: 240,
      y: 180,
      width: 240,
      height: 180
    })
    return { taskId: task.id, widgetId: w.id }
  })

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Sync choice test/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForSelector(`[data-widget-id="${seeded.widgetId}"]`, { timeout: 5_000 })
  await window.waitForTimeout(250)
  return seeded
}

/** Right-click the widget header to open the context menu, then click the
 *  menu item whose label contains `label`. Returns whether the item was found. */
async function duplicateVia(
  l: LaunchedApp,
  widgetId: string,
  label: string
): Promise<boolean> {
  const { window } = l
  await window.locator(`[data-widget-id="${widgetId}"] .widget-handle`).click({ button: 'right' })
  await window.waitForTimeout(250)
  const clicked = await window.evaluate((lbl: string) => {
    const menu = document.querySelector('[data-canvas-ctx-menu]')
    if (!menu) return false
    const btn = Array.from(menu.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(lbl)
    )
    if (!btn) return false
    ;(btn as HTMLButtonElement).click()
    return true
  }, label)
  await window.waitForTimeout(400)
  return clicked
}

// Only the sticky widgets we care about — the canvas auto-creates a minimap
// widget when a task opens, which would otherwise pollute the count.
async function widgetsOf(
  l: LaunchedApp,
  taskId: string
): Promise<Array<{ id: string; content: string; syncGroupId: string | null }>> {
  return l.window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const all = await api.widgets.listByTask(tid)
    return all
      .filter((w) => w.kind === 'sticky')
      .map((w) => ({ id: w.id, content: w.content, syncGroupId: w.syncGroupId ?? null }))
  }, taskId)
}

test('Duplicate (keep synced) links both copies with a shared syncGroupId', async () => {
  launched = await launchApp()
  const { taskId, widgetId } = await seedStickyAndOpen(launched)

  const found = await duplicateVia(launched, widgetId, 'Duplicate (keep synced)')
  expect(found).toBe(true)

  const widgets = await widgetsOf(launched, taskId)
  expect(widgets.length).toBe(2)
  // Both must carry the SAME non-null syncGroupId.
  const groups = widgets.map((w) => w.syncGroupId)
  expect(groups.every((g) => g !== null)).toBe(true)
  expect(groups[0]).toBe(groups[1])
})

test('synced duplicate mirrors a content edit to its linked copy', async () => {
  launched = await launchApp()
  const { taskId, widgetId } = await seedStickyAndOpen(launched)

  expect(await duplicateVia(launched, widgetId, 'Duplicate (keep synced)')).toBe(true)

  // Edit the ORIGINAL's content via the store path (window.api) and confirm the
  // linked copy receives it through the DB fan-out.
  await launched.window.evaluate(async (id: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.widgets.update(id, { content: 'v2-synced' })
  }, widgetId)
  await launched.window.waitForTimeout(300)

  const widgets = await widgetsOf(launched, taskId)
  const copy = widgets.find((w) => w.id !== widgetId)
  expect(copy).toBeTruthy()
  expect(copy!.content).toBe('v2-synced')
})

test('Duplicate (independent copy) does NOT link — edits never cross over', async () => {
  launched = await launchApp()
  const { taskId, widgetId } = await seedStickyAndOpen(launched)

  const found = await duplicateVia(launched, widgetId, 'Duplicate (independent copy)')
  expect(found).toBe(true)

  let widgets = await widgetsOf(launched, taskId)
  expect(widgets.length).toBe(2)
  // The original stays unlinked (no group), and the copy has no group either.
  for (const w of widgets) expect(w.syncGroupId).toBeNull()

  // Editing the original must NOT change the independent copy.
  await launched.window.evaluate(async (id: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.widgets.update(id, { content: 'v2-independent' })
  }, widgetId)
  await launched.window.waitForTimeout(300)

  widgets = await widgetsOf(launched, taskId)
  const copy = widgets.find((w) => w.id !== widgetId)
  expect(copy).toBeTruthy()
  expect(copy!.content).toBe('v1') // unchanged — fully independent
})

test('synced copy exposes "Unlink from synced copies"; independent copy does not', async () => {
  launched = await launchApp()
  const { window } = launched
  const { widgetId } = await seedStickyAndOpen(launched)

  // After a SYNCED duplicate, the original is in a group → Unlink is offered.
  expect(await duplicateVia(launched, widgetId, 'Duplicate (keep synced)')).toBe(true)
  await window.locator(`[data-widget-id="${widgetId}"] .widget-handle`).click({ button: 'right' })
  await window.waitForTimeout(250)
  const hasUnlinkWhenSynced = await window.evaluate(() => {
    const menu = document.querySelector('[data-canvas-ctx-menu]')
    return Array.from(menu?.querySelectorAll('button') ?? []).some((b) =>
      (b.textContent ?? '').includes('Unlink from synced copies')
    )
  })
  expect(hasUnlinkWhenSynced).toBe(true)
})
