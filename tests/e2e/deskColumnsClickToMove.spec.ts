import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

// Verifies commit ec5e93c: click-to-move as a drag-free way to reorganise the
// Columns view. Every state change here is driven by real Playwright clicks
// (button.click() / menuitem.click()) — NOT a store-path fallback — since a
// click is something the CDP harness can genuinely drive, unlike HTML5 DnD.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function setupDeskWithWidgets(window: import('@playwright/test').Page): Promise<{
  taskId: string
  stickyId: string
  noteId: string
  calcId: string
}> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Click-to-Move Test Desk' })
    const sticky = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: '',
      content: 'A sticky note',
      x: 60,
      y: 60,
      width: 260,
      height: 200,
      color: '#fef08a'
    })
    const note = await api.widgets.create({
      taskId: task.id,
      kind: 'note',
      title: 'A note',
      content: 'Some note content',
      x: 380,
      y: 60,
      width: 320,
      height: 220,
      color: null
    })
    const calc = await api.widgets.create({
      taskId: task.id,
      kind: 'calculator',
      title: '',
      content: '',
      x: 60,
      y: 320,
      width: 260,
      height: 260,
      color: null
    })
    return { taskId: task.id, stickyId: sticky.id, noteId: note.id, calcId: calc.id }
  })
}

async function goToDesk(window: import('@playwright/test').Page, taskId: string): Promise<void> {
  await window.evaluate((id) => {
    const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
    w.__fbView?.getState().goTask(id)
  }, taskId)
  await window.waitForTimeout(500)
}

test('Columns click-to-move: move button + context menu reorganise cards via real clicks, with persistence', async () => {
  test.setTimeout(120_000)
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId, stickyId, noteId, calcId } = await setupDeskWithWidgets(window)
  // Fresh reload so the nodes store (populated at boot) picks up the task
  // created via a raw IPC call — same requirement as the drag-fallback spec.
  await window.reload()
  await waitForReady(window)
  await goToDesk(window, taskId)
  await expect(window.locator('text=Something went wrong')).toHaveCount(0)

  await window.locator('[data-testid="view-selector-btn"]').click()
  await window.locator('[data-testid="view-opt-columns"]').click()
  await expect(window.locator('[data-testid="columns-view"]')).toBeVisible()

  // ── Status board ─────────────────────────────────────────────────────────
  await window.locator('[data-testid="columns-groupby-status"]').click()
  await window.waitForTimeout(300)
  await expect(window.locator('[data-testid="column-todo"]')).toBeVisible()
  await expect(window.locator('[data-testid="column-doing"]')).toBeVisible()

  // Sticky starts unassigned -> lands in "To sort" (todo).
  await expect(
    window.locator('[data-testid="column-todo"] [data-testid="column-card-' + stickyId + '"]')
  ).toBeVisible()

  // 1. Move button exists on the card and opens a context menu listing the
  // OTHER lanes (not the one it's already in).
  const moveBtn = window.locator(`[data-testid="column-move-${stickyId}"]`)
  await expect(moveBtn).toBeVisible()
  await moveBtn.click()
  const menu = window.locator('[role="menu"][data-canvas-ctx-menu]')
  await expect(menu).toBeVisible()
  const menuItemLabels = await menu.locator('[role="menuitem"]').allInnerTexts()
  console.log('[click-to-move][status] menu items:', menuItemLabels)
  expect(menuItemLabels.some((t) => /move to in progress/i.test(t))).toBe(true)
  expect(menuItemLabels.some((t) => /move to done/i.test(t))).toBe(true)
  expect(menuItemLabels.some((t) => /move to reference/i.test(t))).toBe(true)
  // The lane the card is already in ("To sort") must NOT be offered.
  expect(menuItemLabels.some((t) => /move to to sort/i.test(t))).toBe(false)

  // 2. Click "Move to In progress" -> card actually moves into column-doing,
  // driven by a real menuitem click, not a store call.
  await menu.getByRole('menuitem', { name: /move to in progress/i }).click()
  await window.waitForTimeout(300)
  await expect(
    window.locator('[data-testid="column-doing"] [data-testid="column-card-' + stickyId + '"]')
  ).toBeVisible()
  await expect(
    window.locator('[data-testid="column-todo"] [data-testid="column-card-' + stickyId + '"]')
  ).toHaveCount(0)
  console.log('[click-to-move][status] real click on "Move to In progress" moved the sticky card into column-doing.')

  // 3. Persistence: read (not drive) the underlying widget.status to confirm
  // the real field was written, then confirm the card survives a fresh
  // goTask + re-open of Columns.
  const persistedStatus = await window.evaluate(async (id) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const w = await api.widgets.get(id)
    return w?.status ?? null
  }, stickyId)
  expect(persistedStatus).toBe('doing')

  await window.locator('[data-testid="columns-to-canvas"]').click()
  await window.waitForTimeout(200)
  await goToDesk(window, taskId)
  await window.locator('[data-testid="view-selector-btn"]').click()
  await window.locator('[data-testid="view-opt-columns"]').click()
  await window.waitForTimeout(200)
  await window.locator('[data-testid="columns-groupby-status"]').click()
  await window.waitForTimeout(300)
  await expect(
    window.locator('[data-testid="column-doing"] [data-testid="column-card-' + stickyId + '"]')
  ).toBeVisible()
  console.log('[click-to-move][status-persist] sticky card still in "In progress" after re-entering Columns.')

  // ── Freeform mode ────────────────────────────────────────────────────────
  await window.locator('[data-testid="columns-groupby-freeform"]').click()
  await window.waitForTimeout(300)

  const freeformCols = window.locator('[data-testid^="column-col-"]')
  const freeformColIds: string[] = []
  const count = await freeformCols.count()
  for (let i = 0; i < count; i++) {
    const id = (await freeformCols.nth(i).getAttribute('data-testid'))!.replace('column-', '')
    freeformColIds.push(id)
  }
  expect(freeformColIds.length).toBeGreaterThanOrEqual(2)
  const firstColId = freeformColIds[0]
  const targetColId = freeformColIds[1]

  // All widgets start unassigned -> land in the first freeform column.
  await expect(
    window.locator(`[data-testid="column-${firstColId}"] [data-testid="column-card-${noteId}"]`)
  ).toBeVisible()

  const targetColTitle = await window
    .locator(`[data-testid="column-${targetColId}"] input`)
    .inputValue()

  const noteMoveBtn = window.locator(`[data-testid="column-move-${noteId}"]`)
  await expect(noteMoveBtn).toBeVisible()
  await noteMoveBtn.click()
  const freeformMenu = window.locator('[role="menu"][data-canvas-ctx-menu]')
  await expect(freeformMenu).toBeVisible()
  const freeformMenuLabels = await freeformMenu.locator('[role="menuitem"]').allInnerTexts()
  console.log('[click-to-move][freeform] menu items:', freeformMenuLabels)
  const targetItem = freeformMenu.getByRole('menuitem', {
    name: new RegExp(`move to ${targetColTitle}`, 'i')
  })
  await expect(targetItem).toBeVisible()
  await targetItem.click()
  await window.waitForTimeout(300)

  await expect(
    window.locator(`[data-testid="column-${targetColId}"] [data-testid="column-card-${noteId}"]`)
  ).toBeVisible()
  await expect(
    window.locator(`[data-testid="column-${firstColId}"] [data-testid="column-card-${noteId}"]`)
  ).toHaveCount(0)
  console.log(`[click-to-move][freeform] real click reassigned the note card from ${firstColId} to ${targetColId}.`)

  // Confirm the reassignment persisted to the freeform config too (assign map).
  const cfgKey = 'fb.deskColumns.v1.' + taskId
  const cfgRaw = await window.evaluate((key) => localStorage.getItem(key), cfgKey)
  const cfg = JSON.parse(cfgRaw as string)
  expect(cfg.assign[noteId]).toBe(targetColId)

  // ── 5. Structural: drag handle + Add/rename/remove still present ───────
  // The handle is pointer-based (mousedown), not HTML5 draggable — just confirm
  // it's present and grabbable.
  const calcHandle = window.locator(`[data-testid="column-drag-${calcId}"]`)
  await expect(calcHandle).toBeVisible()

  const addBtn = window.locator('[data-testid="columns-add"]')
  await expect(addBtn).toBeVisible()
  const beforeAdd = await window.locator('[data-testid^="column-col-"]').count()
  await addBtn.click()
  await window.waitForTimeout(200)
  const afterAdd = await window.locator('[data-testid^="column-col-"]').count()
  expect(afterAdd).toBe(beforeAdd + 1)

  const renameInput = window.locator(`[data-testid="column-${firstColId}"] input`)
  await renameInput.fill('Renamed via click test')
  await renameInput.blur()
  await window.waitForTimeout(200)
  await expect(renameInput).toHaveValue('Renamed via click test')

  const newColId = (await window.locator('[data-testid^="column-col-"]').last().getAttribute('data-testid'))!.replace(
    'column-',
    ''
  )
  const removeBtn = window.locator(`[data-testid="column-${newColId}"] button[title^="Remove column"]`)
  await expect(removeBtn).toBeVisible()
  await removeBtn.click()
  await window.waitForTimeout(200)
  await expect(window.locator(`[data-testid="column-${newColId}"]`)).toHaveCount(0)
  console.log('[structural] drag handle present + draggable; Add/rename/remove column all still work.')
})
