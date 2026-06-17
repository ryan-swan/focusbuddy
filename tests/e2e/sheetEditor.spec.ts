/**
 * E2E tests for the Excel-class spreadsheet editor (SheetEditor / SheetGrid).
 *
 * Coverage (13 scenarios):
 *  SE-1  Blank spreadsheet opens with toolbar + grid + tab strip.
 *  SE-2  Enter a value via the formula bar; it shows in the grid and persists.
 *  SE-3  Formula: 10 + 20, =SUM(...) computes; bad formula shows #ERR.
 *  SE-4  Number format: select Currency from sheet-number-format; cell displays $1,234.00.
 *  SE-5  Cell formatting: bold a cell via toolbar; fontWeight is bold + body formats map persists.
 *  SE-6  Structural ops: insert a row and column; grid dimensions change and persist.
 *  SE-7  Undo/redo: make an edit, Ctrl/Cmd+Z reverts it, redo reapplies.
 *  SE-8  Keyboard nav: arrow keys move the active cell; typing starts inline edit.
 *  SE-9  Charts: select a range, insert bar chart, data-testid="sheet-chart" renders (SVG present).
 *  SE-10 Tabs: add sheet, switch, rename, delete; body.sheets length changes + persists.
 *  SE-11 xlsx interop: stub sheet:import → fixed SheetBodyV2; assert grid loads it; stub
 *        sheet:export and assert sheet-status shows the path.
 *  SE-12 AI fill: stub ai:fillSheetRange → fixed matrix; open panel, generate, preview shows,
 *        Apply writes matrix into grid.
 *  SE-13 Backward compat: legacy v1 body normalizes and renders on open.
 *
 * IPC stubs follow the exact pattern from docEditor.spec.ts — app.evaluate → ipcMain so
 * no live Anthropic calls and no native file dialogs are involved.
 *
 * Interaction model for the sheet editor:
 *   - Click cell-{r}-{c} sets focus there (anchor + focus move, no inline edit).
 *   - The formula bar <input> (placeholder "Select a cell…") shows the raw value
 *     and directly sets it via onChange — so typing in the formula bar + clicking
 *     another cell is the most reliable way to enter a value.
 *   - Double-clicking a cell starts the inline floating input.
 *   - Arrow keys on the focused grid wrapper move the selection; Enter/F2 opens
 *     inline edit.
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// ── Shared navigation helpers ─────────────────────────────────────────────────

async function openDocumentsHub(window: Page): Promise<void> {
  await window.getByRole('button', { name: /^Documents$/i }).click()
  await expect(window.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible({
    timeout: 8_000
  })
}

async function startBlankSpreadsheet(window: Page): Promise<void> {
  const blankRow = window.locator('text=Or start blank:').locator('..')
  await blankRow.locator('button', { hasText: 'Spreadsheet' }).first().click()
  // Formula bar is the definitive signal that the sheet editor is mounted.
  await expect(window.locator('input[placeholder*="Select a cell"]')).toBeVisible({
    timeout: 8_000
  })
}

/** Click a grid cell by its data-testid. The click sets focus/anchor; the cell
 *  is NOT in inline-edit mode (that requires a double-click or Enter/F2).
 */
async function clickCell(window: Page, r: number, c: number): Promise<void> {
  await window.locator(`[data-testid="cell-${r}-${c}"]`).click()
}

/** Return the formula bar input. */
function formulaBar(window: Page): import('@playwright/test').Locator {
  return window.locator('input[placeholder*="Select a cell"]')
}

/** Enter a value into the focused cell by typing into the formula bar then
 *  clicking the target-cell to blur (which triggers commitEdit 'none' on the
 *  inline editor and also represents a real user workflow). After blurring we
 *  click cell-0-0 as a safe "another cell" unless we are already there.
 */
async function setViaFormulaBar(
  window: Page,
  r: number,
  c: number,
  value: string,
  blurTo: [number, number] = [0, 0]
): Promise<void> {
  await clickCell(window, r, c)
  const bar = formulaBar(window)
  await bar.click()
  // Clear whatever the formula bar holds, then type the value.
  await bar.fill(value)
  // Blur by clicking another cell; SheetEditor updates the cell on onChange of
  // the formula bar (no separate commit step), so blurring is just for focus.
  const [br, bc] = blurTo
  if (br !== r || bc !== c) {
    await clickCell(window, br, bc)
  }
  await window.waitForTimeout(150)
}

/** Read the displayed text of a cell (the inner div text, not the input value). */
async function cellText(window: Page, r: number, c: number): Promise<string> {
  const cell = window.locator(`[data-testid="cell-${r}-${c}"]`)
  // When not in inline-edit mode the cell renders a <div> with the displayed value.
  const div = cell.locator('div').first()
  return (await div.textContent()) ?? ''
}

// ── IPC stubs (main process) ──────────────────────────────────────────────────

async function stubSheetImport(
  app: LaunchedApp['app'],
  body: object,
  name = 'test.xlsx'
): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, { b, n }: { b: object; n: string }) => {
      ipcMain.removeHandler('sheet:import')
      ipcMain.handle('sheet:import', async () => ({ ok: true, body: b, name: n }))
    },
    { b: body, n: name }
  )
}

async function stubSheetExport(app: LaunchedApp['app'], path: string): Promise<void> {
  await app.evaluate(({ ipcMain }, p: string) => {
    ipcMain.removeHandler('sheet:export')
    ipcMain.handle('sheet:export', async () => ({ ok: true, path: p }))
  }, path)
}

async function stubAiFill(app: LaunchedApp['app'], rows: string[][]): Promise<void> {
  await app.evaluate(({ ipcMain }, r: string[][]) => {
    ipcMain.removeHandler('ai:fillSheetRange')
    ipcMain.handle('ai:fillSheetRange', async () => ({ ok: true, rows: r }))
  }, rows)
}

// ── SE-1: Basic layout ────────────────────────────────────────────────────────

test('SE-1 — blank spreadsheet opens with toolbar, grid and tab strip', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    await expect(window.locator('[data-testid="sheet-toolbar"]')).toBeVisible()
    await expect(window.locator('[data-testid="sheet-grid"]')).toBeVisible()
    await expect(window.locator('[data-testid="sheet-tab-strip"]')).toBeVisible()

    // Formula bar present with correct placeholder
    await expect(formulaBar(window)).toBeVisible()
    await expect(formulaBar(window)).toHaveAttribute('placeholder', /Select a cell/)

    // Undo and Redo buttons present (disabled on fresh sheet)
    const toolbar = window.locator('[data-testid="sheet-toolbar"]')
    await expect(toolbar.getByTitle('Undo')).toBeVisible()
    await expect(toolbar.getByTitle('Redo')).toBeVisible()
    await expect(toolbar.getByTitle('Bold')).toBeVisible()

    // Default tab is "Sheet 1"
    await expect(window.locator('[data-testid="sheet-tab-strip"]').locator('text=Sheet 1')).toBeVisible()

    // Grid has cells — cell-0-0 is present (0-indexed)
    await expect(window.locator('[data-testid="cell-0-0"]')).toBeVisible()
  } finally {
    await dispose()
  }
})

// ── SE-2: Value entry + persistence ──────────────────────────────────────────

test('SE-2 — enter value via formula bar; it shows in the grid and persists', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Enter "Hello" into cell (0,0)
    await setViaFormulaBar(window, 0, 0, 'Hello', [0, 1])

    // The cell display div should show "Hello"
    const shown = await cellText(window, 0, 0)
    expect(shown).toBe('Hello')

    // Wait for autosave debounce (600 ms + generous buffer)
    await window.waitForTimeout(1_500)

    // Read the persisted body back from the store
    const stored = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const latest = docs[0]
      const doc = await api.documents.get(latest.id)
      return doc?.body
    })

    const body = stored as { version: number; sheets: Array<{ rows: string[][] }> }
    expect(body.version, 'body is v2').toBe(2)
    expect(body.sheets[0].rows[0][0], 'cell (0,0) value persisted').toBe('Hello')
  } finally {
    await dispose()
  }
})

// ── SE-3: Formulas and #ERR ───────────────────────────────────────────────────

test('SE-3 — formula: SUM of two cells computes; bad formula shows #ERR', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // A1 = 10
    await setViaFormulaBar(window, 0, 0, '10', [0, 1])
    // B1 = 20
    await setViaFormulaBar(window, 0, 1, '20', [1, 0])
    // A2 = =SUM(A1:B1)
    await setViaFormulaBar(window, 1, 0, '=SUM(A1:B1)', [0, 0])

    const sumShown = await cellText(window, 1, 0)
    expect(sumShown, '=SUM(A1:B1) should compute to 30').toBe('30')

    // A3 = bad formula
    await setViaFormulaBar(window, 2, 0, '=2+', [0, 0])
    const errShown = await cellText(window, 2, 0)
    expect(errShown, 'broken formula should show #ERR').toBe('#ERR')
  } finally {
    await dispose()
  }
})

// ── SE-4: Number format ───────────────────────────────────────────────────────

test('SE-4 — number format: select Currency from sheet-number-format; cell displays $1,234.00', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Put 1234 in A1
    await setViaFormulaBar(window, 0, 0, '1234', [0, 1])

    // Click A1 to select it (focus must be there before applying format)
    await clickCell(window, 0, 0)
    await window.waitForTimeout(100)

    // The NUMBER_FORMATS array in SheetToolbar: index 3 = Currency ($), decimals 2
    const fmtSelect = window.locator('[data-testid="sheet-number-format"]')
    await fmtSelect.selectOption('3')
    await window.waitForTimeout(200)

    const shown = await cellText(window, 0, 0)
    // formatValue for { kind: 'currency', decimals: 2, symbol: '$' } of 1234 → "$1,234.00"
    expect(shown, 'currency format should show $1,234.00').toMatch(/^\$1[,.]?234\.00$/)
  } finally {
    await dispose()
  }
})

// ── SE-5: Cell formatting (bold) + format persistence ────────────────────────

test('SE-5 — bold a cell via toolbar; rendered fontWeight is bold and body.formats persists', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Put a value in A1 so we can see it
    await setViaFormulaBar(window, 0, 0, 'BoldTest', [0, 1])

    // Select A1 then click Bold in the toolbar
    await clickCell(window, 0, 0)
    await window.locator('[data-testid="sheet-toolbar"]').getByTitle('Bold').click()
    await window.waitForTimeout(200)

    // The cell's display div should have font-weight: 700 (bold)
    const cell = window.locator('[data-testid="cell-0-0"]')
    const fontWeight = await cell.locator('div').first().evaluate(
      (el) => window.getComputedStyle(el).fontWeight
    )
    expect(fontWeight, 'cell should be bold (fontWeight 700)').toBe('700')

    // Wait for autosave
    await window.waitForTimeout(1_500)

    // Verify body.formats['0,0'].bold === true
    const stored = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const doc = await api.documents.get(docs[0].id)
      return doc?.body
    })
    const body = stored as { version: number; sheets: Array<{ formats?: Record<string, { bold?: boolean }> }> }
    expect(body.sheets[0].formats?.['0,0']?.bold, 'bold format persisted to body.formats').toBe(true)
  } finally {
    await dispose()
  }
})

// ── SE-6: Structural ops (insert row + column) ────────────────────────────────

test('SE-6 — insert row and column; grid dimensions change and persist', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Mark A1 so we can tell the insert happened
    await setViaFormulaBar(window, 0, 0, 'Marker', [0, 1])

    // Read the initial row count (emptyTab default = 12 rows, 4 cols)
    const initialRowCount = await window.locator('[data-testid="sheet-grid"] tbody tr').count()
    const initialColCount = await window.locator('[data-testid="sheet-grid"] thead th').count()
    // thead has: row-number-th + col-headers; count = 1 + numColumns
    const initialDataCols = initialColCount - 1

    // Select A1, insert a row above it
    await clickCell(window, 0, 0)
    await window.locator('[data-testid="sheet-toolbar"]').getByTitle('Insert row above').click()
    await window.waitForTimeout(200)

    const rowsAfterInsert = await window.locator('[data-testid="sheet-grid"] tbody tr').count()
    expect(rowsAfterInsert, 'row count should increase by 1').toBe(initialRowCount + 1)

    // The old A1 "Marker" should now be at A2 (r=1) since a row was inserted above
    const markerCell = await cellText(window, 1, 0)
    expect(markerCell, '"Marker" shifted to row 2 (index 1) after row insert').toBe('Marker')

    // Now insert a column at the current selection (still at 0,0 logical, but row insert
    // put focus still at 0,0); select the original Marker cell to anchor correctly
    await clickCell(window, 0, 0)
    await window.locator('[data-testid="sheet-toolbar"]').getByTitle('Insert column left').click()
    await window.waitForTimeout(200)

    const colsAfterInsert = (await window.locator('[data-testid="sheet-grid"] thead th').count()) - 1
    expect(colsAfterInsert, 'column count should increase by 1').toBe(initialDataCols + 1)

    // Wait for autosave then verify shape persists
    await window.waitForTimeout(1_500)
    const stored = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const doc = await api.documents.get(docs[0].id)
      return doc?.body
    })
    const body = stored as { version: number; sheets: Array<{ rows: string[][]; columns: string[] }> }
    expect(body.sheets[0].rows.length, 'persisted row count increased').toBe(initialRowCount + 1)
    expect(body.sheets[0].columns.length, 'persisted column count increased').toBe(initialDataCols + 1)
  } finally {
    await dispose()
  }
})

// ── SE-7: Undo / redo ─────────────────────────────────────────────────────────

test('SE-7 — undo reverts an edit; redo reapplies it', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Enter a value
    await setViaFormulaBar(window, 0, 0, 'Original', [0, 1])
    let shown = await cellText(window, 0, 0)
    expect(shown, 'value entered').toBe('Original')

    // Enter a second value to create an undo-able step
    await setViaFormulaBar(window, 0, 0, 'Edited', [0, 1])
    shown = await cellText(window, 0, 0)
    expect(shown, 'value changed to Edited').toBe('Edited')

    // Focus the grid wrapper (the tabIndex=0 div that wraps SheetGrid and owns keydown).
    // sheet-grid is the direct child of that div, so the locator going one level up ('..')
    // IS the wrapper; click it directly to give it focus.
    const gridWrap = window.locator('[data-testid="sheet-grid"]').locator('..')
    await gridWrap.click()
    await window.waitForTimeout(100)

    // Undo with Cmd+Z / Ctrl+Z
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await window.keyboard.press(`${mod}+z`)
    await window.waitForTimeout(200)

    // Focus moved — re-check cell text (it may have reverted)
    // After undo the cell content should revert; click cell to read display
    const afterUndo = await cellText(window, 0, 0)
    expect(afterUndo, 'undo should revert to Original').toBe('Original')

    // Redo
    await gridWrap.click()
    await window.keyboard.press(`${mod}+z`)
    // Check redo via toolbar Redo button — some state may be tricky to reach via
    // keyboard after clicking the gridWrap. Use the toolbar Redo button instead.
    // First undo again to get back to "Original" so redo can fire.
    // Actually let us just verify redo via toolbar button:
    // We are now at "Original" (after one undo). Click Redo button.
    const redoBtn = window.locator('[data-testid="sheet-toolbar"]').getByTitle('Redo')
    // The redo button is enabled only if there's something to redo. After one
    // undo from "Edited→Original", redo should re-apply "Edited".
    // But we then pressed Ctrl+Z a second time above — that undid "Original" to
    // the blank-cell state. Let us just test via the toolbar buttons from a
    // clean sequence: set value, then undo, then redo.
    // Re-enter a known value to have a clean undo stack:
    await setViaFormulaBar(window, 1, 0, 'RedoTest', [0, 0])
    shown = await cellText(window, 1, 0)
    expect(shown, 'RedoTest entered').toBe('RedoTest')

    // Undo via toolbar
    const undoBtn = window.locator('[data-testid="sheet-toolbar"]').getByTitle('Undo')
    await undoBtn.click()
    await window.waitForTimeout(200)
    const afterUndoBtn = await cellText(window, 1, 0)
    expect(afterUndoBtn, 'undo via toolbar clears the cell').toBe('')

    // Redo via toolbar
    await redoBtn.click()
    await window.waitForTimeout(200)
    const afterRedoBtn = await cellText(window, 1, 0)
    expect(afterRedoBtn, 'redo via toolbar restores RedoTest').toBe('RedoTest')
  } finally {
    await dispose()
  }
})

// ── SE-8: Keyboard navigation ─────────────────────────────────────────────────

test('SE-8 — arrow keys move the active cell; typing starts inline edit', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Click cell (0,0) first — this fires onCellMouseDown which both sets the
    // selection (anchor/focus = 0,0) AND calls focusGrid() internally, which gives
    // keyboard focus to the grid wrapper. No need to click the wrapper separately.
    await clickCell(window, 0, 0)
    await window.waitForTimeout(100)

    // Arrow down should move focus to row 1, col 0.
    // The address display span is the <span> that sits just before the formula bar input.
    await window.keyboard.press('ArrowDown')
    await window.waitForTimeout(150)

    const addrAfterDown = await window.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="Select a cell"]')
      const span = inp?.previousElementSibling
      return span?.textContent?.trim() ?? ''
    })
    expect(addrAfterDown, 'after ArrowDown focus is on A2').toBe('A2')

    // Arrow right should move to col 1 (B2)
    await window.keyboard.press('ArrowRight')
    await window.waitForTimeout(150)

    const addrAfterRight = await window.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="Select a cell"]')
      const span = inp?.previousElementSibling
      return span?.textContent?.trim() ?? ''
    })
    expect(addrAfterRight, 'after ArrowRight focus is on B2').toBe('B2')

    // Type a printable character — this should start inline editing on the active cell.
    // The grid wrapper's onKeyDown handler calls startEdit(focus, e.key) for printable
    // keys, seeding the edit value with that key. The key may also be received by the
    // newly-focused inline input, so the value may be 'X' or 'XX' depending on event
    // propagation timing. We assert only that the inline input appeared and contains 'X'.
    await window.keyboard.press('X')
    await window.waitForTimeout(150)
    // cell-1-1 is the current active cell (row 1, col 1 = B2)
    const activeCell = window.locator('[data-testid="cell-1-1"]')
    const inlineInput = activeCell.locator('input')
    await expect(inlineInput, 'typing starts inline edit').toBeVisible({ timeout: 3_000 })
    const inlineVal = await inlineInput.inputValue()
    expect(inlineVal, 'inline input contains the typed key').toMatch(/^X/)

    // Escape cancels the inline edit
    await window.keyboard.press('Escape')
    await expect(inlineInput, 'Escape cancels inline edit').not.toBeVisible({ timeout: 2_000 })
  } finally {
    await dispose()
  }
})

// ── SE-9: Charts ──────────────────────────────────────────────────────────────

test('SE-9 — select a range, insert bar chart, sheet-chart node renders', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Seed a small numeric range: A1=10, A2=20, A3=30
    await setViaFormulaBar(window, 0, 0, '10', [0, 1])
    await setViaFormulaBar(window, 1, 0, '20', [0, 1])
    await setViaFormulaBar(window, 2, 0, '30', [0, 1])

    // Select A1 (click), then shift-click A3 to extend selection to rows 0-2, col 0
    await clickCell(window, 0, 0)
    await window.locator('[data-testid="cell-2-0"]').click({ modifiers: ['Shift'] })
    await window.waitForTimeout(100)

    // Click Insert chart button → menu appears
    const toolbar = window.locator('[data-testid="sheet-toolbar"]')
    await toolbar.getByTitle('Insert chart').click()
    await expect(window.locator('text=bar chart')).toBeVisible({ timeout: 3_000 })

    // Click "bar chart"
    await window.locator('text=bar chart').click()
    await window.waitForTimeout(300)

    // The sheet-chart container should now be visible
    await expect(window.locator('[data-testid="sheet-chart"]')).toBeVisible({ timeout: 5_000 })

    // recharts renders SVG; at least one svg element should be inside sheet-chart
    const svgCount = await window.locator('[data-testid="sheet-chart"] svg').count()
    expect(svgCount, 'recharts should render at least one SVG').toBeGreaterThan(0)
  } finally {
    await dispose()
  }
})

// ── SE-10: Tabs ───────────────────────────────────────────────────────────────

test('SE-10 — add tab, switch, rename, delete; body.sheets length changes and persists', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    const tabStrip = window.locator('[data-testid="sheet-tab-strip"]')

    // Initial state: 1 tab named "Sheet 1"
    await expect(tabStrip.locator('text=Sheet 1')).toBeVisible()

    // Add a sheet via the "+" button
    await tabStrip.getByTitle('Add sheet').click()
    await window.waitForTimeout(200)

    // "Sheet 2" tab should appear
    await expect(tabStrip.locator('text=Sheet 2')).toBeVisible({ timeout: 3_000 })

    // Switch to Sheet 2
    await tabStrip.locator('text=Sheet 2').click()
    await window.waitForTimeout(150)

    // Enter a value specific to Sheet 2 so we can confirm we are on the right tab
    await setViaFormulaBar(window, 0, 0, 'Sheet2Data', [0, 1])
    const tab2Cell = await cellText(window, 0, 0)
    expect(tab2Cell, 'Sheet 2 has its own data').toBe('Sheet2Data')

    // Switch back to Sheet 1 — the cell should be blank
    await tabStrip.locator('text=Sheet 1').click()
    await window.waitForTimeout(150)
    const tab1Cell = await cellText(window, 0, 0)
    expect(tab1Cell, 'Sheet 1 A1 is independent (blank)').toBe('')

    // Rename Sheet 2 via double-click
    await tabStrip.locator('text=Sheet 2').dblclick()
    await window.waitForTimeout(100)
    const renameInput = tabStrip.locator('input')
    await renameInput.fill('Renamed')
    await renameInput.press('Enter')
    await window.waitForTimeout(200)
    await expect(tabStrip.locator('text=Renamed')).toBeVisible({ timeout: 3_000 })

    // Wait for autosave and verify persistence
    await window.waitForTimeout(1_500)
    const storedBeforeDelete = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const doc = await api.documents.get(docs[0].id)
      return doc?.body
    })
    const b1 = storedBeforeDelete as { version: number; sheets: Array<{ name: string }> }
    expect(b1.sheets.length, '2 sheets persisted').toBe(2)
    expect(b1.sheets.find((s) => s.name === 'Renamed'), '"Renamed" tab in persisted body').toBeTruthy()

    // Delete "Renamed" tab. The tab is a div whose child span text is "Renamed".
    // The delete button (title="Delete sheet") is also inside that same div.
    // Use JS to find the delete button inside the tab containing "Renamed" and click it,
    // which avoids CSS visibility issues with the hover-only opacity class.
    await window.evaluate(() => {
      const strip = document.querySelector('[data-testid="sheet-tab-strip"]')
      if (!strip) throw new Error('tab strip not found')
      // Find the div that has a span child with exact text "Renamed"
      const tabs = Array.from(strip.querySelectorAll('div'))
      const renamedTab = tabs.find((d) => {
        const spans = Array.from(d.querySelectorAll('span'))
        return spans.some((s) => s.textContent?.trim() === 'Renamed')
      })
      if (!renamedTab) throw new Error('Renamed tab not found')
      const btn = renamedTab.querySelector('button[title="Delete sheet"]') as HTMLButtonElement | null
      if (!btn) throw new Error('Delete sheet button not found in Renamed tab')
      btn.click()
    })
    await window.waitForTimeout(200)

    await expect(tabStrip.locator('text=Renamed')).not.toBeVisible({ timeout: 3_000 })

    // Wait for autosave and verify only 1 sheet remains
    await window.waitForTimeout(1_500)
    const storedAfterDelete = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const docs = await api.documents.list()
      const doc = await api.documents.get(docs[0].id)
      return doc?.body
    })
    const b2 = storedAfterDelete as { version: number; sheets: Array<{ name: string }> }
    expect(b2.sheets.length, '1 sheet persisted after delete').toBe(1)
  } finally {
    await dispose()
  }
})

// ── SE-11: xlsx interop (stubbed) ─────────────────────────────────────────────

test('SE-11 — sheet:import stub loads a SheetBodyV2; export stub shows path in sheet-status', async () => {
  const { app, window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Build a fixed SheetBodyV2 to inject via the import stub
    const fakeBody = {
      version: 2,
      sheets: [
        {
          id: 'st-test-1',
          name: 'ImportedSheet',
          columns: ['Product', 'Revenue'],
          rows: [
            ['Sprocket', '1200'],
            ['Widget', '450']
          ]
        }
      ],
      activeSheet: 0
    }

    await stubSheetImport(app, fakeBody, 'products.xlsx')

    // Open the IO menu and click Import
    const toolbar = window.locator('[data-testid="sheet-toolbar"]')
    await toolbar.getByTitle('Import / export').click()
    await expect(window.locator('text=Import .xlsx / .csv')).toBeVisible({ timeout: 3_000 })
    await window.locator('text=Import .xlsx / .csv').click()
    await window.waitForTimeout(400)

    // The grid should now show "Sprocket" in cell (0,0)
    const shownA1 = await cellText(window, 0, 0)
    expect(shownA1, 'imported cell A1 = Sprocket').toBe('Sprocket')

    // Cell (0,1) should show "1200" (or "Revenue" if header row is treated as row 0)
    // The body has no header row concept — columns are ['Product','Revenue'] and the
    // rows start at index 0 with data, so row 0 col 0 = 'Sprocket', row 0 col 1 = '1200'.
    const shownB1 = await cellText(window, 0, 1)
    expect(shownB1, 'imported cell B1 = 1200').toBe('1200')

    // The status bar should show the import name
    await expect(window.locator('[data-testid="sheet-status"]')).toContainText('products.xlsx', {
      timeout: 3_000
    })

    // Now stub export and trigger it
    const fakePath = '/tmp/sheet-export.xlsx'
    await stubSheetExport(app, fakePath)

    // Dismiss the import status so we can read the export status cleanly
    await window.locator('[data-testid="sheet-status"] button').click()
    await expect(window.locator('[data-testid="sheet-status"]')).not.toBeVisible({ timeout: 2_000 })

    // Open IO menu and export
    await toolbar.getByTitle('Import / export').click()
    await expect(window.locator('text=Export .xlsx')).toBeVisible({ timeout: 3_000 })
    await window.locator('text=Export .xlsx').click()
    await window.waitForTimeout(300)

    // Status should show the saved path
    await expect(window.locator('[data-testid="sheet-status"]')).toContainText(fakePath, {
      timeout: 5_000
    })
  } finally {
    await dispose()
  }
})

// ── SE-12: AI fill (stubbed) ──────────────────────────────────────────────────

test('SE-12 — AI fill: stub ai:fillSheetRange; open panel, generate, preview shows, Apply writes matrix', async () => {
  const { app, window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Stub ai:fillSheetRange before opening the panel
    const fakeMatrix = [
      ['Acme Corp', '500000', '=B1*0.1'],
      ['Beta LLC', '250000', '=B2*0.1'],
      ['Gamma Inc', '750000', '=B3*0.1']
    ]
    await stubAiFill(app, fakeMatrix)

    // Select a range: A1:C1 (click A1, shift-click C1)
    await clickCell(window, 0, 0)
    await window.locator('[data-testid="cell-0-2"]').click({ modifiers: ['Shift'] })
    await window.waitForTimeout(100)

    // Open AI fill panel via toolbar button (the "AI fill" button)
    const toolbar = window.locator('[data-testid="sheet-toolbar"]')
    const aiFillBtn = toolbar.locator('button', { hasText: /AI fill/i })
    await aiFillBtn.click()
    await expect(window.locator('[data-testid="sheet-ai-fill"]')).toBeVisible({ timeout: 3_000 })

    // Fill in the prompt textarea
    const aiPanel = window.locator('[data-testid="sheet-ai-fill"]')
    await aiPanel.locator('textarea').fill('SaaS companies with ARR and 10% commission')

    // Click Generate
    await aiPanel.getByRole('button', { name: /^Generate$/i }).click()
    await window.waitForTimeout(500)

    // Preview table should appear inside the AI panel
    const previewTable = aiPanel.locator('table')
    await expect(previewTable).toBeVisible({ timeout: 5_000 })
    await expect(previewTable).toContainText('Acme Corp')

    // Apply via data-testid="sheet-ai-apply"
    await window.locator('[data-testid="sheet-ai-apply"]').click()
    await window.waitForTimeout(300)

    // Panel should close
    await expect(window.locator('[data-testid="sheet-ai-fill"]')).not.toBeVisible({ timeout: 3_000 })

    // The matrix should be written starting at the selection anchor (row 0, col 0)
    const a1 = await cellText(window, 0, 0)
    expect(a1, 'A1 = Acme Corp').toBe('Acme Corp')

    const b1 = await cellText(window, 0, 1)
    expect(b1, 'B1 = 500000').toBe('500000')

    // Row 1 (second data row)
    const a2 = await cellText(window, 1, 0)
    expect(a2, 'A2 = Beta LLC').toBe('Beta LLC')
  } finally {
    await dispose()
  }
})

// ── SE-13: Backward compat (v1 body) ──────────────────────────────────────────

test('SE-13 — backward compat: legacy v1 sheet body normalizes and renders', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)

    // Create a doc with a v1 body directly via the API
    const legacyV1Body = {
      columns: ['Name', 'Score'],
      rows: [
        ['Alice', '95'],
        ['Bob', '87']
      ]
    }
    await window.evaluate(async (body: object) => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.documents.create({
        docType: 'sheet',
        title: 'Legacy v1 Sheet',
        body
      })
    }, legacyV1Body)

    // Reload and navigate back so Recent refreshes
    await window.reload()
    await waitForReady(window)
    await openDocumentsHub(window)

    // The recent list should have "Legacy v1 Sheet"
    await expect(window.locator('text=Legacy v1 Sheet').first()).toBeVisible({ timeout: 5_000 })
    await window.locator('text=Legacy v1 Sheet').first().click()

    // Wait for the sheet editor to mount
    await expect(window.locator('input[placeholder*="Select a cell"]')).toBeVisible({ timeout: 8_000 })
    await expect(window.locator('[data-testid="sheet-grid"]')).toBeVisible()

    // After normalization the v1 data should be at cell (0,0)="Alice", (0,1)="95"
    const cellA1 = await cellText(window, 0, 0)
    expect(cellA1, 'v1 row[0][0] lifted to A1').toBe('Alice')

    const cellB1 = await cellText(window, 0, 1)
    expect(cellB1, 'v1 row[0][1] lifted to B1').toBe('95')

    // The tab strip should show "Sheet 1" (the default name normalizeBody assigns)
    await expect(
      window.locator('[data-testid="sheet-tab-strip"]').locator('text=Sheet 1')
    ).toBeVisible()
  } finally {
    await dispose()
  }
})
