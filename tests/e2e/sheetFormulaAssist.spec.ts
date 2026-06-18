/**
 * E2E tests for the spreadsheet formula-assist feature shipped in
 * the 2026-06-18 batch.
 *
 * SFA-1  Function menu appears when "=" is typed into a cell, and picking
 *        sheet-func-SUM replaces the typed prefix with "SUM(".
 *
 * SFA-2  End-to-end: put 10, 20, 30 in A1:A3, start editing B1, type "=",
 *        pick SUM from the menu, click-drag A1→A3 to insert the range ref
 *        "A1:A3", type ")" and Enter. Assert B1 displays 60.
 *
 * SFA-3  Single-cell reference insertion while editing a formula: edit a
 *        cell, type "=", click cell-0-0 (A1). Verify the formula text
 *        becomes "=A1" (or starts with it). Type "+5", Enter. Assert the
 *        result is 15 (A1 holds 10).
 *
 * SFA-4  Regression — no first-keystroke duplication: type "123" into an
 *        empty cell, press Enter, assert the cell shows "123" not "1123".
 *
 * All tests use an isolated userData dir (fresh SQLite DB) via launchApp().
 * No live AI calls are made (ANTHROPIC_API_KEY is stripped by _helpers.ts).
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

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
  await expect(window.locator('input[placeholder*="Select a cell"]')).toBeVisible({
    timeout: 8_000
  })
}

/** Click a cell by its data-testid (sets selection, no inline edit). */
async function clickCell(window: Page, r: number, c: number): Promise<void> {
  await window.locator(`[data-testid="cell-${r}-${c}"]`).click()
}

/** Read the displayed text of a cell (the inner div, not an inline input). */
async function cellText(window: Page, r: number, c: number): Promise<string> {
  const cell = window.locator(`[data-testid="cell-${r}-${c}"]`)
  const div = cell.locator('div').first()
  return (await div.textContent()) ?? ''
}

/** Enter a value via the formula bar and blur by clicking another cell. */
async function setViaFormulaBar(
  window: Page,
  r: number,
  c: number,
  value: string,
  blurTo: [number, number] = [0, 0]
): Promise<void> {
  await clickCell(window, r, c)
  const bar = window.locator('input[placeholder*="Select a cell"]')
  await bar.click()
  await bar.fill(value)
  const [br, bc] = blurTo
  if (br !== r || bc !== c) {
    await clickCell(window, br, bc)
  }
  await window.waitForTimeout(150)
}

// ── SFA-1: Function menu appears; picking SUM inserts "SUM(" ─────────────────

test('SFA-1 — typing "=" opens sheet-formula-menu; clicking sheet-func-SUM inserts "SUM("', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Double-click cell-0-0 to open inline edit.
    await window.locator('[data-testid="cell-0-0"]').dblclick()
    await window.waitForTimeout(150)

    // The inline input should now be visible.
    const inlineInput = window.locator('[data-testid="cell-0-0"] input')
    await expect(inlineInput).toBeVisible({ timeout: 3_000 })

    // Type "=" — this should trigger the formula menu.
    await inlineInput.type('=')
    await window.waitForTimeout(200)

    // The formula menu must be visible.
    const menu = window.locator('[data-testid="sheet-formula-menu"]')
    await expect(menu).toBeVisible({ timeout: 3_000 })

    // SUM must appear in the menu.
    const sumBtn = window.locator('[data-testid="sheet-func-SUM"]')
    await expect(sumBtn).toBeVisible({ timeout: 2_000 })

    // Click the SUM button. Uses onMouseDown + preventDefault so the input
    // should NOT blur. The edit text should become "=SUM(". We trigger mousedown
    // explicitly (which is what the component listens to) to match the real click
    // path; then wait for React to re-render.
    await sumBtn.dispatchEvent('mousedown')
    await window.waitForTimeout(300)

    // Verify the inline input value is "=SUM(". The menu will re-evaluate
    // computeFuncMenu("=SUM(") and return null (trailing "(" is not an operator
    // match and not an ident suffix), so it should close too — but the key
    // assertion is the input value.
    const afterPick = await inlineInput.inputValue()
    expect(afterPick, 'after picking SUM, edit text becomes "=SUM("').toBe('=SUM(')

    // Cancel the edit. If the formula menu was visible, Escape first dismisses it
    // (stopPropagation in the funcMenu handler) and a second Escape cancels the
    // inline editor. Press twice to handle both cases.
    await window.keyboard.press('Escape')
    await window.waitForTimeout(100)
    await window.keyboard.press('Escape')
    await expect(inlineInput).not.toBeVisible({ timeout: 3_000 })
  } finally {
    await dispose()
  }
})

// ── SFA-2: Full end-to-end: menu + click-drag range + real computation ────────

test('SFA-2 — full e2e: =SUM(A1:A3) entered via menu + drag, B1 shows 60', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Put 10, 20, 30 in A1, A2, A3 (rows 0, 1, 2 of column 0).
    await setViaFormulaBar(window, 0, 0, '10', [0, 1])
    await setViaFormulaBar(window, 1, 0, '20', [0, 1])
    await setViaFormulaBar(window, 2, 0, '30', [0, 1])

    // Verify the seed values are visible.
    expect(await cellText(window, 0, 0), 'A1 = 10').toBe('10')
    expect(await cellText(window, 1, 0), 'A2 = 20').toBe('20')
    expect(await cellText(window, 2, 0), 'A3 = 30').toBe('30')

    // Double-click B1 (row 0, col 1) to start editing.
    await window.locator('[data-testid="cell-0-1"]').dblclick()
    await window.waitForTimeout(150)

    const editInput = window.locator('[data-testid="cell-0-1"] input')
    await expect(editInput).toBeVisible({ timeout: 3_000 })

    // Type "=" to trigger the formula menu.
    await editInput.type('=')
    await window.waitForTimeout(200)

    // Menu must appear.
    await expect(window.locator('[data-testid="sheet-formula-menu"]')).toBeVisible({ timeout: 3_000 })

    // Pick SUM from the menu — should produce "=SUM(".
    const sumBtn = window.locator('[data-testid="sheet-func-SUM"]')
    await expect(sumBtn).toBeVisible({ timeout: 2_000 })
    await sumBtn.click()
    await window.waitForTimeout(200)

    // Confirm edit text is "=SUM(" so far.
    const afterSumPick = await editInput.inputValue()
    expect(afterSumPick, 'edit value after SUM pick is "=SUM("').toBe('=SUM(')

    // Now click-drag from A1 (cell-0-0) to A3 (cell-2-0) to insert the range ref.
    // We're in formula ref mode because editValue starts with "=". The mousedown
    // on the target cell fires onCellMouseDown which detects formulaRefMode and
    // starts a refDrag instead of moving selection, then mouseup writes the ref.
    const cell00 = window.locator('[data-testid="cell-0-0"]')
    const cell20 = window.locator('[data-testid="cell-2-0"]')

    const box00 = await cell00.boundingBox()
    const box20 = await cell20.boundingBox()
    if (!box00 || !box20) throw new Error('Could not get cell bounding boxes')

    const startX = box00.x + box00.width / 2
    const startY = box00.y + box00.height / 2
    const endX = box20.x + box20.width / 2
    const endY = box20.y + box20.height / 2

    await window.mouse.move(startX, startY)
    await window.mouse.down()
    await window.waitForTimeout(80)
    await window.mouse.move(endX, endY, { steps: 5 })
    await window.waitForTimeout(80)
    await window.mouse.up()
    await window.waitForTimeout(300)

    // After the drag, the edit value should include "A1:A3".
    const afterDrag = await editInput.inputValue()
    expect(afterDrag, 'range ref A1:A3 inserted into formula').toContain('A1:A3')

    // Type closing ")" and press Enter to commit.
    await editInput.type(')')
    await window.keyboard.press('Enter')
    await window.waitForTimeout(300)

    // B1 should now display 60 (10 + 20 + 30).
    const b1 = await cellText(window, 0, 1)
    expect(b1, 'B1 displays 60 (=SUM(A1:A3) computed)').toBe('60')
  } finally {
    await dispose()
  }
})

// ── SFA-3: Single-cell reference insertion ────────────────────────────────────

test('SFA-3 — click-to-single-reference: "=" then click A1 inserts "=A1"; +5 → 15', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Put 10 in A1 (row 0, col 0).
    await setViaFormulaBar(window, 0, 0, '10', [0, 1])
    expect(await cellText(window, 0, 0), 'A1 = 10').toBe('10')

    // Double-click B1 (row 0, col 1) to open inline edit.
    await window.locator('[data-testid="cell-0-1"]').dblclick()
    await window.waitForTimeout(150)

    const editInput = window.locator('[data-testid="cell-0-1"] input')
    await expect(editInput).toBeVisible({ timeout: 3_000 })

    // Type "=" to enter formula mode. The formula menu should open (may be
    // dismissed or remain open — we just need the ref-mode to be active).
    await editInput.type('=')
    await window.waitForTimeout(200)

    // Dismiss the menu with Escape so it doesn't intercept the cell click.
    // (The formula ref mode stays active because editValue still starts with "=".)
    const menu = window.locator('[data-testid="sheet-formula-menu"]')
    if (await menu.isVisible().catch(() => false)) {
      await window.keyboard.press('Escape')
      await window.waitForTimeout(100)
    }

    // Click cell A1 (row 0, col 0). The SheetGrid is in formulaRefMode (editValue
    // starts with "="), so clicking A1 should insert "A1" at the caret rather than
    // moving the selection. After the click the input value should contain "A1".
    const cell00 = window.locator('[data-testid="cell-0-0"]')
    const box = await cell00.boundingBox()
    if (!box) throw new Error('Could not get cell-0-0 bounding box')
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await window.mouse.down()
    await window.waitForTimeout(50)
    await window.mouse.up()
    await window.waitForTimeout(300)

    // The edit input should now contain "=A1".
    const afterClick = await editInput.inputValue()
    expect(afterClick, 'edit text after clicking A1 in formula mode contains "A1"').toMatch(/A1/)

    // Type "+5" and press Enter.
    await editInput.type('+5')
    await window.keyboard.press('Enter')
    await window.waitForTimeout(300)

    // B1 should display 15 (=A1+5, where A1=10).
    const b1 = await cellText(window, 0, 1)
    expect(b1, 'B1 displays 15 (=A1+5)').toBe('15')
  } finally {
    await dispose()
  }
})

// ── SFA-4: Regression — no first-keystroke duplication ───────────────────────

test('SFA-4 — regression: type "123" into empty cell, Enter → cell shows "123" not "1123"', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    await openDocumentsHub(window)
    await startBlankSpreadsheet(window)

    // Click A1 to give the grid focus (this calls focusGrid() internally).
    await clickCell(window, 0, 0)
    await window.waitForTimeout(100)

    // Press "1" — triggers startEdit(focus, '1') with e.preventDefault(), so the
    // inline input is seeded with '1' and should NOT receive a second '1'.
    await window.keyboard.press('1')
    await window.waitForTimeout(150)

    const inlineInput = window.locator('[data-testid="cell-0-0"] input')
    await expect(inlineInput).toBeVisible({ timeout: 3_000 })

    // Input should contain exactly "1", not "11".
    const afterFirst = await inlineInput.inputValue()
    expect(afterFirst, 'first keystroke: input is "1" not "11"').toBe('1')

    // Type the rest "23" directly into the input.
    await inlineInput.type('23')
    await window.waitForTimeout(100)

    // Commit with Enter.
    await window.keyboard.press('Enter')
    await window.waitForTimeout(200)

    // The cell display should show "123".
    const shown = await cellText(window, 0, 0)
    expect(shown, 'cell displays "123" after typing 1, 23, Enter').toBe('123')
  } finally {
    await dispose()
  }
})
