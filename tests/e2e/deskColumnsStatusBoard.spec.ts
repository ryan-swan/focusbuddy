import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

// Verifies commit a25fafb: the Columns view overhaul (real status board + smart
// grouping modes + drag fix + AI topics). Drives a fresh desk with 3 widgets
// (sticky, note, calculator) through every group-by mode, the status board's
// drag-to-set-status + persistence, freeform's drag/add/rename/remove, drag
// reliability when the card body is an interactive widget, and Topic mode's
// honest no-key degradation (the e2e harness strips ANTHROPIC_API_KEY, see
// _helpers.ts).

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
  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Columns Test Desk' })
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
  return result
}

async function goToDesk(window: import('@playwright/test').Page, taskId: string): Promise<void> {
  await window.evaluate((id) => {
    const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
    w.__fbView?.getState().goTask(id)
  }, taskId)
  await window.waitForTimeout(500)
}

// A real pointer drag from a card's drag handle to a target column. ColumnsView
// uses pointer-based dragging (not HTML5 DnD), so this drives the genuine gesture.
async function pointerDragTo(
  window: import('@playwright/test').Page,
  handle: import('@playwright/test').Locator,
  targetCol: import('@playwright/test').Locator
): Promise<void> {
  const hb = await handle.boundingBox()
  const cb = await targetCol.boundingBox()
  if (!hb || !cb) throw new Error('pointerDragTo: missing bounding box')
  await window.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await window.mouse.down()
  const tx = cb.x + cb.width / 2
  const ty = cb.y + Math.min(140, cb.height / 2)
  await window.mouse.move(tx, ty, { steps: 14 })
  await window.mouse.move(tx, ty) // settle so onMove records the target column
  await window.mouse.up()
  await window.waitForTimeout(250)
}

async function colWidth(window: import('@playwright/test').Page, colId: string): Promise<number> {
  return window
    .locator(`[data-testid="column-${colId}"]`)
    .evaluate((el) => (el as HTMLElement).getBoundingClientRect().width)
}

test('Columns view: all 8 group-by modes render, status board drags+persists, freeform CRUD, drag-handle reliability, honest topic degradation', async () => {
  test.setTimeout(120_000)
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId, stickyId, noteId, calcId } = await setupDeskWithWidgets(window)
  // The nodes store only knows about tasks loaded at boot; a task created via
  // a raw IPC call (bypassing the store's own create action) needs a reload
  // before Canvas's `activeTask` lookup (nodes.find by id) can find it —
  // otherwise Canvas falls back to the "No desks yet" DeskGallery. Same
  // pattern as starterTemplates.spec.ts ST-1.
  await window.reload()
  await waitForReady(window)
  await goToDesk(window, taskId)

  await expect(window.locator('text=Something went wrong')).toHaveCount(0)

  // Enter the Columns view.
  const toggle = window.locator('[data-testid="desk-view-columns"]')
  await expect(toggle).toBeVisible({ timeout: 10_000 })
  await toggle.click()
  const columnsView = window.locator('[data-testid="columns-view"]')
  await expect(columnsView).toBeVisible()
  await expect(window.locator('text=Something went wrong')).toHaveCount(0)

  // ── 1. All 8 group-by modes render without crashing ────────────────────
  const modes = ['freeform', 'status', 'kind', 'color', 'connections', 'section', 'recency', 'topic'] as const
  for (const mode of modes) {
    const btn = window.locator(`[data-testid="columns-groupby-${mode}"]`)
    await expect(btn).toBeVisible()
    await btn.click()
    await window.waitForTimeout(mode === 'topic' ? 800 : 300)
    await expect(window.locator('text=Something went wrong')).toHaveCount(0, {
      timeout: 2000
    })
    const cols = window.locator('[data-testid^="column-"]')
    expect(await cols.count()).toBeGreaterThanOrEqual(1)
    console.log(`[mode:${mode}] columns rendered=${await cols.count()}, no crash`)
  }

  // ── 5. Topic mode: honest no-key banner, Regroup button present ────────
  await window.locator('[data-testid="columns-groupby-topic"]').click()
  await window.waitForTimeout(800)
  const regroupBtn = window.locator('[data-testid="columns-topic-regroup"]')
  await expect(regroupBtn).toBeVisible()
  const bodyText = await columnsView.innerText()
  const mentionsKey = /needs ai|add an anthropic key|add a key|api key/i.test(bodyText)
  expect(mentionsKey).toBe(true)
  // Never fabricated columns: with no key, everything should be Uncategorised
  // (or the mode shows the honest banner instead of invented topic labels).
  const topicColTitles = await window.locator('[data-testid^="column-topic:"] span.font-semibold').allInnerTexts()
  for (const t of topicColTitles) {
    expect(t.toLowerCase()).not.toMatch(/pricing|onboarding|research|roadmap/) // no fabricated real-sounding labels
  }
  console.log('[topic-honest] banner text found:', bodyText.match(/needs ai[^.]*\./i)?.[0] ?? bodyText.slice(0, 200))

  // ── 2. Status board: 4 lanes, drag handle moves + persists status ──────
  await window.locator('[data-testid="columns-groupby-status"]').click()
  await window.waitForTimeout(300)
  const laneIds = ['todo', 'doing', 'done', 'reference']
  for (const id of laneIds) {
    await expect(window.locator(`[data-testid="column-${id}"]`)).toBeVisible()
  }
  const laneTitles = await window.locator('[data-testid^="column-"] span.font-semibold').allInnerTexts()
  expect(laneTitles).toEqual(expect.arrayContaining(['To sort', 'In progress', 'Done', 'Reference']))

  // All 3 widgets start with no status -> all land in "To sort" (todo).
  await expect(window.locator(`[data-testid="column-todo"] [data-testid="column-card-${stickyId}"]`)).toBeVisible()

  // Drag the sticky's card via its dedicated drag handle from todo -> doing, using
  // a REAL pointer drag (mousedown/move/up). ColumnsView now uses pointer-based
  // dragging, not HTML5 DnD, so Playwright can drive it genuinely end to end.
  const stickyHandle = window.locator(`[data-testid="column-drag-${stickyId}"]`)
  const doingLane = window.locator('[data-testid="column-doing"]')
  await expect(stickyHandle).toBeVisible()
  await pointerDragTo(window, stickyHandle, doingLane)
  console.log('[status-drag] real pointer drag moved the sticky card from To sort -> In progress.')
  await expect(window.locator(`[data-testid="column-doing"] [data-testid="column-card-${stickyId}"]`)).toBeVisible()

  // Confirm the underlying widget record actually has status='doing' persisted
  // (real synced field, not just a local view artifact).
  const persistedStatus = await window.evaluate(async (id) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const w = await api.widgets.get(id)
    return w?.status ?? null
  }, stickyId)
  expect(persistedStatus).toBe('doing')

  // Reload the desk / re-enter Columns and confirm the card stays in doing.
  await window.locator('[data-testid="columns-to-canvas"]').click()
  await window.waitForTimeout(200)
  await goToDesk(window, taskId)
  await window.locator('[data-testid="desk-view-columns"]').click()
  await window.waitForTimeout(200)
  await window.locator('[data-testid="columns-groupby-status"]').click()
  await window.waitForTimeout(300)
  await expect(window.locator(`[data-testid="column-doing"] [data-testid="column-card-${stickyId}"]`)).toBeVisible()
  console.log('[status-persist] sticky card stayed in "In progress" lane after re-entering Columns.')

  // ── 3. Freeform: drag handle, add column, editable title, remove column ─
  await window.locator('[data-testid="columns-groupby-freeform"]').click()
  await window.waitForTimeout(300)

  const initialFreeformCols = await window.locator('[data-testid^="column-col-"]').count()
  await window.locator('[data-testid="columns-add"]').click()
  await window.waitForTimeout(200)
  const afterAddCols = await window.locator('[data-testid^="column-col-"]').count()
  expect(afterAddCols).toBe(initialFreeformCols + 1)
  console.log(`[freeform-add] columns ${initialFreeformCols} -> ${afterAddCols}`)

  // All 3 widgets start unassigned -> land in the first freeform column.
  const firstColId = (await window.locator('[data-testid^="column-col-"]').first().getAttribute('data-testid'))!.replace(
    'column-',
    ''
  )
  const lastColId = (await window.locator('[data-testid^="column-col-"]').last().getAttribute('data-testid'))!.replace(
    'column-',
    ''
  )
  expect(lastColId).not.toBe(firstColId)
  const colIds = await window
    .locator('[data-testid^="column-col-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('column-', '')))

  // Drag handle on the note card moves it from the first column to the last, via a
  // real pointer drag.
  const noteHandle = window.locator(`[data-testid="column-drag-${noteId}"]`)
  const lastCol = window.locator(`[data-testid="column-${lastColId}"]`)
  await expect(noteHandle).toBeVisible()
  await pointerDragTo(window, noteHandle, lastCol)
  await expect(window.locator(`[data-testid="column-${lastColId}"] [data-testid="column-card-${noteId}"]`)).toBeVisible()
  console.log('[freeform-drag] real pointer drag reassigned the note card to the new column.')

  // Rename the first column's title.
  const firstColTitleInput = window.locator(`[data-testid="column-${firstColId}"] input`)
  await firstColTitleInput.fill('Renamed Column')
  await firstColTitleInput.blur()
  await window.waitForTimeout(200)
  await expect(firstColTitleInput).toHaveValue('Renamed Column')

  // Removing a column: pick a column that is not the last remaining one.
  const removeBtn = window.locator(`[data-testid="column-${lastColId}"] button[title^="Remove column"]`)
  if (await removeBtn.isVisible().catch(() => false)) {
    await removeBtn.click()
    await window.waitForTimeout(200)
    await expect(window.locator(`[data-testid="column-${lastColId}"]`)).toHaveCount(0)
    console.log('[freeform-remove] column removed successfully; items reassigned to first column.')
  }

  // ── 4. Drag reliability for an interactive widget: a real pointer drag of the
  // calculator card (whose body would otherwise swallow the gesture) still moves it,
  // because the drag starts on the dedicated handle and the body is made
  // pointer-transparent during the drag.
  await window.locator('[data-testid="columns-groupby-freeform"]').click()
  await window.waitForTimeout(200)
  const calcHandle = window.locator(`[data-testid="column-drag-${calcId}"]`)
  await expect(calcHandle).toBeVisible()
  const calcFromCol = await window.evaluate((id) => {
    const card = document.querySelector(`[data-testid="column-card-${id}"]`)
    return card?.closest('[data-col-id]')?.getAttribute('data-col-id') ?? null
  }, calcId)
  const calcTargetColId = colIds.find((c) => c !== calcFromCol) ?? lastColId
  await pointerDragTo(window, calcHandle, window.locator(`[data-testid="column-${calcTargetColId}"]`))
  await expect(window.locator(`[data-testid="column-${calcTargetColId}"] [data-testid="column-card-${calcId}"]`)).toBeVisible()
  console.log('[drag-handle] real pointer drag moved the interactive calculator card via its handle.')

  // ── 5. Manual column resize: dragging a column's resize handle changes its width
  // and the new width persists (localStorage widths map).
  const resizeTargetCol = colIds[0]
  const beforeW = await colWidth(window, resizeTargetCol)
  const rh = window.locator(`[data-testid="column-resize-${resizeTargetCol}"]`)
  await expect(rh).toBeVisible()
  const rb = await rh.boundingBox()
  if (rb) {
    await window.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2)
    await window.mouse.down()
    await window.mouse.move(rb.x + 140, rb.y + rb.height / 2, { steps: 10 })
    await window.mouse.up()
    await window.waitForTimeout(150)
  }
  const afterW = await colWidth(window, resizeTargetCol)
  expect(afterW).toBeGreaterThan(beforeW + 40)
  console.log(`[resize] column widened ${Math.round(beforeW)} -> ${Math.round(afterW)}px via the resize handle.`)
})
