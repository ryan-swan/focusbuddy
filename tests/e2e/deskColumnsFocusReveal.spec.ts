import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

// Verifies commit 323bc68 ("fix drop registration + make focus behave like the
// canvas"), the parts drivable with real clicks in this harness:
//   1. column-focus-<id> opens WidgetFocusMode OVER the Columns view (not an
//      escape to the plain canvas), and Escape returns to Columns (not canvas).
//   2. column-reveal-<id> is the separate, intentional escape-to-canvas action.
//   3. Regression: click-to-move still works with a real click; all 8 group-by
//      modes still render without crashing.
// The HTML5 drag-drop fix (drop registration while a card body is interactive)
// is out of scope here — this CDP harness cannot reliably drive native HTML5
// DnD (documented in deskColumnsStatusBoard.spec.ts), so that half of the
// commit is not re-litigated in this spec.

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
}> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Focus/Reveal Test Desk' })
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
    return { taskId: task.id, stickyId: sticky.id, noteId: note.id }
  })
}

async function goToDesk(window: import('@playwright/test').Page, taskId: string): Promise<void> {
  await window.evaluate((id) => {
    const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
    w.__fbView?.getState().goTask(id)
  }, taskId)
  await window.waitForTimeout(500)
}

test('Columns focus-from-columns stays in columns on exit; reveal-on-canvas is a separate escape; move + all modes still work', async () => {
  test.setTimeout(120_000)
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId, stickyId, noteId } = await setupDeskWithWidgets(window)
  await window.reload()
  await waitForReady(window)
  await goToDesk(window, taskId)
  await expect(window.locator('text=Something went wrong')).toHaveCount(0)

  await window.locator('[data-testid="view-selector-btn"]').click()
  await window.locator('[data-testid="view-opt-columns"]').click()
  await expect(window.locator('[data-testid="columns-view"]')).toBeVisible()
  await window.locator('[data-testid="columns-groupby-status"]').click()
  await window.waitForTimeout(300)

  // ── 1. Focus from Columns: opens WidgetFocusMode over columns, Escape
  // returns to Columns (not the canvas). ─────────────────────────────────
  const focusBtn = window.locator(`[data-testid="column-focus-${stickyId}"]`)
  await expect(focusBtn).toBeVisible()
  await focusBtn.click()

  const focusOverlay = window.locator('[data-testid="widget-focus-mode"]')
  await expect(focusOverlay).toBeVisible({ timeout: 5000 })
  console.log('[focus-from-columns] widget-focus-mode became visible on real click of column-focus button.')

  // Columns view should still be mounted underneath (focus is an overlay, not
  // a view-mode switch) — confirms it did not escape to the plain canvas.
  await expect(window.locator('[data-testid="columns-view"]')).toBeVisible()

  await window.keyboard.press('Escape')
  await window.waitForTimeout(300)
  await expect(focusOverlay).toHaveCount(0)
  await expect(window.locator('[data-testid="columns-view"]')).toBeVisible()
  console.log('[focus-from-columns] Escape closed focus mode and left the user back in Columns view (not canvas).')

  // Deskview mode itself must still read 'columns' (not silently flipped to
  // canvas by the focus round-trip).
  const modesAfterFocusExit = await window.evaluate(() => {
    const raw = localStorage.getItem('fb.deskView.v1')
    return raw ? JSON.parse(raw) : null
  })
  expect(modesAfterFocusExit?.[taskId]).toBe('columns')

  // ── 2. Reveal on canvas: separate, intentional escape ───────────────────
  const revealBtn = window.locator(`[data-testid="column-reveal-${stickyId}"]`)
  await expect(revealBtn).toBeVisible()
  await revealBtn.click()
  await window.waitForTimeout(300)
  await expect(window.locator('[data-testid="columns-view"]')).toHaveCount(0)
  await expect(window.locator(`[data-widget-id="${stickyId}"]`)).toBeVisible({ timeout: 5000 })
  console.log('[reveal-on-canvas] real click on column-reveal switched the desk to the canvas and shows the widget there.')

  const modesAfterReveal = await window.evaluate(() => {
    const raw = localStorage.getItem('fb.deskView.v1')
    return raw ? JSON.parse(raw) : null
  })
  expect(modesAfterReveal?.[taskId]).toBe('canvas')

  // ── 3. Regression: click-to-move still works with a real click ─────────
  await window.locator('[data-testid="view-selector-btn"]').click()
  await window.locator('[data-testid="view-opt-columns"]').click()
  await window.waitForTimeout(300)
  await window.locator('[data-testid="columns-groupby-status"]').click()
  await window.waitForTimeout(300)

  const moveBtn = window.locator(`[data-testid="column-move-${noteId}"]`)
  await expect(moveBtn).toBeVisible()
  await moveBtn.click()
  const menu = window.locator('[role="menu"][data-canvas-ctx-menu]')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: /move to done/i }).click()
  await window.waitForTimeout(300)
  await expect(
    window.locator(`[data-testid="column-done"] [data-testid="column-card-${noteId}"]`)
  ).toBeVisible()
  console.log('[regression] click-to-move still moves a card via a real menuitem click.')

  // ── 3b. Regression: all 8 group-by modes still render without crashing ─
  const modes = ['freeform', 'status', 'kind', 'color', 'connections', 'section', 'recency', 'topic'] as const
  for (const mode of modes) {
    const btn = window.locator(`[data-testid="columns-groupby-${mode}"]`)
    await btn.click()
    await window.waitForTimeout(mode === 'topic' ? 800 : 300)
    await expect(window.locator('text=Something went wrong')).toHaveCount(0)
    const cols = window.locator('[data-testid^="column-"]')
    expect(await cols.count()).toBeGreaterThanOrEqual(1)
  }
  console.log('[regression] all 8 group-by modes rendered without crashing.')
})
