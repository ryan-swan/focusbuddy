// E2E: New table features — pointer-based column reorder, row reorder, keyboard navigation.
//
// Three feature groups, each with a focused test:
//
//  Group A — Column reorder via grip handle (pointer-based, usePointerReorder).
//    Each <th> has data-col-index. The grip <span title="Drag to reorder column">
//    fires mousedown → usePointerReorder tracks mousemove + mouseup → calls moveColumn.
//    We use page.mouse for the full pointer gesture because the mechanism is now
//    pointer-based (not HTML5 DataTransfer), making it testable in headless Electron.
//
//  Group B — Row reorder via grip handle (pointer-based, usePointerReorder).
//    Each <tr> has data-row-index; the grip is in the leading handle cell.
//    Dragging row 0 below row 1 should swap them; reorderRows persists to SQLite.
//
//  Group C — Keyboard navigation on the table body (tabIndex=0).
//    Arrow keys move the active cell ring; Tab/Shift+Tab wrap across rows;
//    Enter enters/commits edit; Escape leaves edit then clears selection;
//    Shift+Arrow extends the selection range; arrows while editing don't navigate.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ── shared seed + navigation ──────────────────────────────────────────────────

interface TableSeed {
  taskId: string
  tableId: string
  widgetId: string
}

async function seedTable(window: LaunchedApp['window']): Promise<TableSeed> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'NFTest' })
    const table = await api.tables.create({
      title: 'NFTable',
      schema: {
        columns: [
          { id: 'c-a', type: 'text-short', label: 'Alpha', config: {} },
          { id: 'c-b', type: 'text-short', label: 'Beta', config: {} },
          { id: 'c-c', type: 'text-short', label: 'Gamma', config: {} }
        ]
      }
    })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-a': 'r0a', 'c-b': 'r0b', 'c-c': 'r0c' } })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-a': 'r1a', 'c-b': 'r1b', 'c-c': 'r1c' } })
    const widget = await api.widgets.create({
      taskId: task.id,
      kind: 'table',
      title: 'NFTable',
      content: table.id,
      // Place the widget near the canvas origin so it's in the initial viewport.
      x: 20,
      y: 20,
      width: 680,
      height: 420
    })
    return { taskId: task.id, tableId: table.id, widgetId: widget.id }
  })
}

async function navigateToTable(
  window: LaunchedApp['window'],
  taskId: string,
  widgetId: string
): Promise<void> {
  await window.reload()
  await waitForReady(window)
  // Wait for the sidebar item to be in the DOM before clicking it.
  await expect(
    window.getByRole('button', { name: /NFTest/ }).first()
  ).toBeVisible({ timeout: 8_000 })
  await window.getByRole('button', { name: /NFTest/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
  // Wait until the table widget is ready: its filter toolbar is the last element
  // to mount (after the schema loads from SQLite).
  await window.waitForFunction(
    (wid: string) =>
      !!document.querySelector(`[data-widget-id="${wid}"] [data-testid="table-filter-button"]`),
    widgetId,
    { timeout: 12_000 }
  )
  // Additional wait for the table body and its rows/headers to render.
  await window.waitForFunction(
    (wid: string) =>
      !!document.querySelector(`[data-widget-id="${wid}"] [data-testid="table-body"]`),
    widgetId,
    { timeout: 8_000 }
  )
  // Small settle so React finishes rendering the table view rows/columns.
  await window.waitForTimeout(300)
}

async function readColumnOrder(
  window: LaunchedApp['window'],
  tableId: string
): Promise<string[]> {
  return window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tid)
    return (tbl?.schema.columns ?? []).map((c: { label: string }) => c.label)
  }, tableId)
}

async function readRowOrder(
  window: LaunchedApp['window'],
  tableId: string
): Promise<string[]> {
  return window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const rows = await api.tables.listRows(tid)
    return (rows as Array<{ cells: Record<string, unknown> }>).map(
      (r) => String(r.cells['c-a'] ?? '')
    )
  }, tableId)
}

// Helper: scroll the widget into the Electron viewport so pointer events hit it.
async function scrollWidgetIntoView(
  window: LaunchedApp['window'],
  widgetId: string
): Promise<void> {
  await window.evaluate((wid: string) => {
    const el = document.querySelector(`[data-widget-id="${wid}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, widgetId)
  await window.waitForTimeout(100)
}

// ── Group A — Column reorder (pointer drag via grip) ──────────────────────────

test('A1 — column grip drag reorders columns and persists to SQLite', async () => {
  // page.mouse does NOT work here: native Playwright pointer events are intercepted by
  // the widget frame's canvas drag machinery (react-rnd / widget-nodrag) before they
  // reach the grip span's React onMouseDown handler. The confirmed working approach is
  // evaluate-based MouseEvent dispatch, which goes through React's synthetic event
  // system and correctly fires start() → registers document mousemove/mouseup → commits.
  //
  // Geometry note from moveColumn: dragging Alpha (index 0) to Gamma (index 2) gives
  //   fromIdx=0, targetIndex=2, insertAt = 2-1 = 1 → [Beta, Alpha, Gamma].
  // Dragging only to Beta (index 1) gives insertAt = 1-1 = 0 === fromIdx → no-op.
  // So the drag must land on Gamma to produce a visible reorder.
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  const before = await readColumnOrder(window, seed.tableId)
  expect(before).toEqual(['Alpha', 'Beta', 'Gamma'])

  // Drive the full pointer-reorder gesture via evaluate: mousedown on the Alpha grip,
  // then mousemove steps across to Gamma, then mouseup — all as synthetic MouseEvents
  // with correct clientX/clientY so the rect-based lookup resolves index 2.
  const reorderResult = await window.evaluate(async ({ wid }: { wid: string }) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return { ok: false, reason: 'widget not found' }
    const ths = Array.from(widget.querySelectorAll('thead th[data-col-index]')) as HTMLElement[]
    if (ths.length < 3) return { ok: false, reason: `need 3 ths, got ${ths.length}` }
    const grip = ths[0].querySelector('[title="Drag to reorder column"]') as HTMLElement | null
    if (!grip) return { ok: false, reason: 'grip not found' }
    const gripR = grip.getBoundingClientRect()
    const gammaR = ths[2].getBoundingClientRect()
    const gripCx = gripR.left + gripR.width / 2
    const gripCy = gripR.top + gripR.height / 2
    const gammaCx = gammaR.left + gammaR.width * 0.5
    const gammaCy = gripCy

    grip.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, clientX: gripCx, clientY: gripCy, button: 0, view: window
    }))
    await new Promise((r) => setTimeout(r, 50))

    for (let i = 1; i <= 10; i++) {
      const cx = gripCx + (gammaCx - gripCx) * (i / 10)
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, clientX: cx, clientY: gammaCy, view: window
      }))
      await new Promise((r) => setTimeout(r, 10))
    }

    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, cancelable: true, clientX: gammaCx, clientY: gammaCy, view: window
    }))
    await new Promise((r) => setTimeout(r, 800))
    return { ok: true, reason: '' }
  }, { wid: seed.widgetId })

  expect(reorderResult.ok, 'gesture dispatch succeeded').toBe(true)

  const after = await readColumnOrder(window, seed.tableId)
  console.log(`A1: column order after drag: ${after.join(' | ')}`)
  expect(after.length, 'still three columns').toBe(3)
  expect(new Set(after), 'all columns still present').toEqual(new Set(['Alpha', 'Beta', 'Gamma']))
  // Alpha dragged to index 2 → [Beta, Alpha, Gamma].
  expect(after, 'Alpha moved past Beta — order is [Beta, Alpha, Gamma]').toEqual(['Beta', 'Alpha', 'Gamma'])

  // Confirm persistence through a reload.
  await navigateToTable(window, seed.taskId, seed.widgetId)
  const afterReload = await readColumnOrder(window, seed.tableId)
  expect(afterReload, 'reorder persists after reload').toEqual(['Beta', 'Alpha', 'Gamma'])
})

test('A2 — column grip: data-col-index attribute and grip span present on all column headers', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  const colInfo = await window.evaluate(({ wid }: { wid: string }) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return { ths: [], count: 0, debugHtml: '' }
    const ths = Array.from(widget.querySelectorAll('thead th[data-col-index]'))
    // Capture a snippet of the thead HTML for debugging if count is wrong.
    const theadHtml = widget.querySelector('thead')?.innerHTML?.slice(0, 500) ?? 'no thead'
    return {
      count: ths.length,
      ths: ths.map((th) => ({
        index: th.getAttribute('data-col-index'),
        hasGrip: !!th.querySelector('[title="Drag to reorder column"]')
      })),
      debugHtml: theadHtml
    }
  }, { wid: seed.widgetId })

  if (colInfo.count === 0) {
    console.log('DEBUG thead HTML:', colInfo.debugHtml)
  }

  expect(colInfo.count, 'three data-col-index column headers present').toBe(3)
  for (const th of colInfo.ths) {
    expect(th.hasGrip, `column ${th.index} has a drag grip span`).toBe(true)
    expect(Number(th.index), `data-col-index "${th.index}" is a valid integer`).not.toBeNaN()
  }
})

// ── Group B — Row reorder (pointer drag via grip) ─────────────────────────────

test('B1 — row grip drag reorders rows and result persists to SQLite', async () => {
  // Same harness constraint as A1: page.mouse is intercepted before reaching the grip's
  // React onMouseDown. evaluate-based MouseEvent dispatch is the confirmed working path.
  //
  // Geometry note from moveRow: with only 2 rows, dragging row 0 to index 1 gives
  //   fromIdx=0, targetIndex=1, insertAt = 1-1 = 0 === fromIdx → no-op.
  // We need 3 rows so dragging row 0 to index 2 (the third row) gives
  //   insertAt = 2-1 = 1 !== 0 → produces [r1a, r0a, r2a].
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window) // seeds r0a, r1a
  // Add a third row so the geometry produces a real reorder.
  await window.evaluate(async ({ tableId }: { tableId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    await api.tables.createRow({ tableId, cells: { 'c-a': 'r2a', 'c-b': 'r2b', 'c-c': 'r2c' } })
  }, { tableId: seed.tableId })

  await navigateToTable(window, seed.taskId, seed.widgetId)

  const before = await readRowOrder(window, seed.tableId)
  expect(before).toEqual(['r0a', 'r1a', 'r2a'])

  // Drive the gesture via evaluate: mousedown on row-0 grip, mousemove to row-2, mouseup.
  const reorderResult = await window.evaluate(async ({ wid }: { wid: string }) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return { ok: false, reason: 'widget not found' }
    const row0 = widget.querySelector('tbody tr[data-row-index="0"]') as HTMLElement | null
    const row2 = widget.querySelector('tbody tr[data-row-index="2"]') as HTMLElement | null
    if (!row0 || !row2) return { ok: false, reason: `rows not found r0=${!!row0} r2=${!!row2}` }
    const grip = row0.querySelector('[title="Drag to reorder row"]') as HTMLElement | null
    if (!grip) return { ok: false, reason: 'row-0 grip not found' }
    // Remove opacity-0 so getBoundingClientRect returns a real area.
    grip.classList.remove('opacity-0')
    const gripR = grip.getBoundingClientRect()
    const row2R = row2.getBoundingClientRect()
    const gripCx = gripR.left + gripR.width / 2
    const gripCy = gripR.top + gripR.height / 2
    const dropCx = gripCx
    const dropCy = row2R.bottom - 4

    grip.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, clientX: gripCx, clientY: gripCy, button: 0, view: window
    }))
    await new Promise((r) => setTimeout(r, 50))

    for (let i = 1; i <= 10; i++) {
      const cy = gripCy + (dropCy - gripCy) * (i / 10)
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, clientX: dropCx, clientY: cy, view: window
      }))
      await new Promise((r) => setTimeout(r, 10))
    }

    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, cancelable: true, clientX: dropCx, clientY: dropCy, view: window
    }))
    await new Promise((r) => setTimeout(r, 900))
    return { ok: true, reason: '' }
  }, { wid: seed.widgetId })

  expect(reorderResult.ok, 'gesture dispatch succeeded').toBe(true)

  const after = await readRowOrder(window, seed.tableId)
  console.log(`B1: row order after drag: ${after.join(' | ')}`)
  expect(after.length, 'still three rows').toBe(3)
  expect(new Set(after), 'all rows still present').toEqual(new Set(['r0a', 'r1a', 'r2a']))
  // row-0 dragged to index 2 → [r1a, r0a, r2a].
  expect(after, 'r0a moved to second position — order is [r1a, r0a, r2a]').toEqual(['r1a', 'r0a', 'r2a'])

  // Confirm persistence.
  await navigateToTable(window, seed.taskId, seed.widgetId)
  const afterReload = await readRowOrder(window, seed.tableId)
  expect(afterReload, 'reorder persists after reload').toEqual(['r1a', 'r0a', 'r2a'])
})

test('B2 — row grip: data-row-index and grip span present in flat table view', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  const rowInfo = await window.evaluate(({ wid }: { wid: string }) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return { rows: [], debugHtml: 'no widget' }
    const trs = Array.from(widget.querySelectorAll('tbody tr[data-row-index]'))
    const tbodyHtml = widget.querySelector('tbody')?.innerHTML?.slice(0, 600) ?? 'no tbody'
    return {
      rows: trs.map((tr) => ({
        rowIndex: tr.getAttribute('data-row-index'),
        hasGrip: !!tr.querySelector('[title="Drag to reorder row"]')
      })),
      debugHtml: tbodyHtml
    }
  }, { wid: seed.widgetId })

  if (rowInfo.rows.length === 0) {
    console.log('DEBUG tbody HTML:', rowInfo.debugHtml)
  }

  expect(rowInfo.rows.length, 'two rows with data-row-index are present').toBe(2)
  for (const row of rowInfo.rows) {
    expect(row.hasGrip, `row ${row.rowIndex} has a drag grip span`).toBe(true)
  }
})

test('B3 — row grip absent when a filter is active (rowsReorderable=false)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)

  // Apply a filter so only row 0 passes — this sets rowsReorderable to false.
  await window.evaluate(async ({ tableId }: { tableId: string }) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const tbl = await api.tables.get(tableId)
    if (!tbl) throw new Error('table not found')
    await api.tables.update(tableId, {
      schema: {
        ...tbl.schema,
        viewConfig: {
          filter: {
            conjunction: 'and' as const,
            rules: [{ id: 'f1', columnId: 'c-a', operator: 'is' as const, value: 'r0a' }]
          }
        }
      }
    })
  }, { tableId: seed.tableId })

  await navigateToTable(window, seed.taskId, seed.widgetId)

  const hasGrip = await window.evaluate(({ wid }: { wid: string }) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return false
    return !!widget.querySelector('tbody tr[data-row-index] [title="Drag to reorder row"]')
  }, { wid: seed.widgetId })

  expect(hasGrip, 'row drag grip must NOT render when a filter is active').toBe(false)
})

// ── Group C — Keyboard navigation ─────────────────────────────────────────────

// Establish focus on a specific cell by dispatching mousedown on the <td>.
// Then explicitly focus the table body so arrow keys route to onTableKeyDown.
async function clickCell(
  window: LaunchedApp['window'],
  widgetId: string,
  r: number,
  c: number
): Promise<void> {
  await window.evaluate(({ wid, r, c }: { wid: string; r: number; c: number }) => {
    const td = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-cell-${r}-${c}"]`
    ) as HTMLElement | null
    if (!td) throw new Error(`cell ${r},${c} not found`)
    // Fire mousedown on the td — this is the handler that calls onCellSelDown
    // which sets activeCell.
    td.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, shiftKey: false
    }))
    // Also fire mouseup to close any pointer-reorder that may have started.
    td.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }, { wid: widgetId, r, c })
  await window.waitForTimeout(80)
  // Explicitly focus the table body so keyboard events reach onTableKeyDown.
  await window.evaluate(({ wid }: { wid: string }) => {
    const body = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-body"]`
    ) as HTMLElement | null
    body?.focus()
  }, { wid: widgetId })
  await window.waitForTimeout(50)
}

// Return the {r, c} of the cell that has the ring-accent class, or null.
async function activeCell(
  window: LaunchedApp['window'],
  widgetId: string
): Promise<{ r: number; c: number } | null> {
  return window.evaluate(({ wid }: { wid: string }) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return null
    const td = widget.querySelector('td[class*="ring-accent"]') as HTMLElement | null
    if (!td) return null
    const testid = td.getAttribute('data-testid') ?? ''
    const m = testid.match(/table-cell-(\d+)-(\d+)/)
    if (!m) return null
    return { r: Number(m[1]), c: Number(m[2]) }
  }, { wid: widgetId })
}

// Return true if the cell's <input> or <textarea> is the current activeElement.
async function cellIsEditing(
  window: LaunchedApp['window'],
  widgetId: string,
  r: number,
  c: number
): Promise<boolean> {
  return window.evaluate(({ wid, r, c }: { wid: string; r: number; c: number }) => {
    const td = document.querySelector(
      `[data-widget-id="${wid}"] [data-testid="table-cell-${r}-${c}"]`
    )
    if (!td) return false
    const inp = td.querySelector('input, textarea') as HTMLElement | null
    return !!inp && document.activeElement === inp
  }, { wid: widgetId, r, c })
}

test('C1 — ArrowDown moves active cell ring from (0,0) to (1,0)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)
  let cell = await activeCell(window, seed.widgetId)
  expect(cell, 'active cell starts at (0,0)').toEqual({ r: 0, c: 0 })

  await window.keyboard.press('ArrowDown')
  await window.waitForTimeout(100)

  cell = await activeCell(window, seed.widgetId)
  expect(cell, 'active cell moved to (1,0) after ArrowDown').toEqual({ r: 1, c: 0 })
})

test('C2 — ArrowRight and ArrowLeft move active cell horizontally', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)

  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(80)
  let cell = await activeCell(window, seed.widgetId)
  expect(cell, '(0,1) after ArrowRight').toEqual({ r: 0, c: 1 })

  await window.keyboard.press('ArrowLeft')
  await window.waitForTimeout(80)
  cell = await activeCell(window, seed.widgetId)
  expect(cell, '(0,0) after ArrowLeft').toEqual({ r: 0, c: 0 })
})

test('C3 — ArrowUp clamped at row 0', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)
  await window.keyboard.press('ArrowUp')
  await window.waitForTimeout(80)

  const cell = await activeCell(window, seed.widgetId)
  expect(cell, 'active cell stays at (0,0) — cannot go above first row').toEqual({ r: 0, c: 0 })
})

test('C4 — ArrowRight at last column wraps to first column of next row (same behaviour as Tab)', async () => {
  // moveActive(0, 1, false): c = 2+1 = 3 >= colCount(3) → c=0, r += 1.
  // ArrowRight at the last column wraps to the next row's first column.
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  // Navigate to column 2 (last of 3), row 0.
  await clickCell(window, seed.widgetId, 0, 2)
  await window.keyboard.press('ArrowRight')
  await window.waitForTimeout(80)

  const cell = await activeCell(window, seed.widgetId)
  // ArrowRight overflows colCount → wraps to (1,0).
  expect(cell, 'ArrowRight at last column wraps to (1,0) — moveActive overflows into next row').toEqual({ r: 1, c: 0 })
})

test('C5 — Tab wraps from last column of row 0 to first column of row 1', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 2)
  await window.keyboard.press('Tab')
  await window.waitForTimeout(100)

  const cell = await activeCell(window, seed.widgetId)
  expect(cell, 'Tab wraps (0,2) → (1,0)').toEqual({ r: 1, c: 0 })
})

test('C6 — Shift+Tab wraps from first column of row 1 to last column of row 0', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 1, 0)
  await window.keyboard.press('Shift+Tab')
  await window.waitForTimeout(100)

  const cell = await activeCell(window, seed.widgetId)
  expect(cell, 'Shift+Tab wraps (1,0) → (0,2)').toEqual({ r: 0, c: 2 })
})

test('C7 — Enter on an active (non-editing) cell enters edit mode', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)
  // Cell is active (has ring) but not editing yet.
  let editing = await cellIsEditing(window, seed.widgetId, 0, 0)
  expect(editing, 'cell not in edit mode yet after click').toBe(false)

  await window.keyboard.press('Enter')
  await window.waitForTimeout(150)

  editing = await cellIsEditing(window, seed.widgetId, 0, 0)
  expect(editing, 'Enter enters edit mode — input focused').toBe(true)
})

test('C8 — Escape: first press leaves edit, second press clears active cell', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)
  await window.keyboard.press('Enter')
  await window.waitForTimeout(100)
  expect(await cellIsEditing(window, seed.widgetId, 0, 0), 'editing before first Escape').toBe(true)

  // First Escape: leaves edit mode.
  await window.keyboard.press('Escape')
  await window.waitForTimeout(100)
  expect(await cellIsEditing(window, seed.widgetId, 0, 0), 'no longer editing after first Escape').toBe(false)
  // Active ring still visible.
  expect(await activeCell(window, seed.widgetId), 'ring still present after first Escape').not.toBeNull()

  // Second Escape: clears active cell.
  await window.keyboard.press('Escape')
  await window.waitForTimeout(100)
  expect(await activeCell(window, seed.widgetId), 'ring cleared after second Escape').toBeNull()
})

test('C9 — Enter while editing moves active cell down one row', async () => {
  // PRODUCT BUG GUARD: onTableKeyDown uses document.activeElement to detect inEditor.
  // ShortText's own onKeyDown calls blur() before the event bubbles, so by the time
  // onTableKeyDown fires, document.activeElement is already the body — inEditor=false —
  // and the handler re-opens the same cell instead of moving down.
  // Fix needed in TableWidget.tsx: change inEditor to use e.target instead of document.activeElement.
  // This test will FAIL until that fix lands, serving as the regression guard.
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)
  await window.keyboard.press('Enter') // enter edit at (0,0)
  await window.waitForTimeout(150)
  expect(await cellIsEditing(window, seed.widgetId, 0, 0), 'in edit mode at (0,0)').toBe(true)

  // Enter while editing: should commit and move to (1,0).
  await window.keyboard.press('Enter')
  await window.waitForTimeout(300)

  // Primary assertion: active cell moved to (1,0).
  const cell = await activeCell(window, seed.widgetId)
  expect(cell, 'active cell moved to (1,0) after Enter-while-editing').toEqual({ r: 1, c: 0 })
  // Secondary: (1,0) must not be in edit mode — we exited the editor.
  const editingNewCell = await cellIsEditing(window, seed.widgetId, 1, 0)
  expect(editingNewCell, 'new active cell (1,0) is not in edit mode after commit').toBe(false)
})

test('C10 — ArrowDown while editing text input does NOT navigate', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)
  await window.keyboard.press('Enter') // enter edit at (0,0)
  await window.waitForTimeout(100)
  expect(await cellIsEditing(window, seed.widgetId, 0, 0), 'in edit mode at (0,0)').toBe(true)

  // While editing, ArrowDown should move the text cursor, NOT navigate cells.
  await window.keyboard.press('ArrowDown')
  await window.waitForTimeout(80)

  // The cell must remain in edit mode.
  expect(await cellIsEditing(window, seed.widgetId, 0, 0), 'still editing (0,0) after ArrowDown').toBe(true)
  // Active cell row must NOT have changed.
  const cell = await activeCell(window, seed.widgetId)
  expect(cell?.r ?? 0, 'active row did not change while editing').toBe(0)
})

test('C11 — Shift+ArrowRight extends the selection range to a two-cell highlight', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seed = await seedTable(window)
  await navigateToTable(window, seed.taskId, seed.widgetId)

  await clickCell(window, seed.widgetId, 0, 0)
  // Shift+ArrowRight should extend the selection anchor (0,0) → focus (0,1).
  await window.keyboard.press('Shift+ArrowRight')
  await window.waitForTimeout(100)

  // Both (0,0) and (0,1) should now have the bg-accent highlight.
  const rangeInfo = await window.evaluate(({ wid }: { wid: string }) => {
    const widget = document.querySelector(`[data-widget-id="${wid}"]`)
    if (!widget) return { count: 0 }
    // The highlighted cells use bg-accent/[0.12] class.
    const cells = Array.from(widget.querySelectorAll('td[class*="bg-accent"]'))
    return {
      count: cells.length,
      ids: cells.map((td) => td.getAttribute('data-testid') ?? '')
    }
  }, { wid: seed.widgetId })

  console.log('C11 highlighted cells:', rangeInfo.ids)
  expect(rangeInfo.count, 'at least two cells highlighted after Shift+ArrowRight').toBeGreaterThanOrEqual(2)
})
