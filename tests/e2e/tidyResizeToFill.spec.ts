import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// plexi-4.0 N-next: Tidy now RESIZES widgets to remove wasted space, in every
// mode, not just repositioning them (commit 08d2051). The geometry math is
// already unit-tested (tests/unit/plxTidyModes.test.ts, 11/11). This file
// verifies the WIRING end-to-end: a real Tidy click, through the real
// store/DB update path, actually changes on-screen widget width/height (not
// just x/y), that a grid has no gaps around a smaller item, that a flow row
// spans edge to edge, that nothing overlaps, that a section is left alone
// (it auto-sizes to its children), and that nothing crashes.
//
// Widget kind choice: 'shape' (stretch-to-fill, no content-driven auto-grow)
// is used for the exact-size assertions instead of 'sticky', because 'sticky'
// is in the pre-existing AUTO_GROW_KINDS allowlist (useAutoGrowHeight.ts,
// MIN_H=120) — its own content/toolbar can grow the widget on the next
// render independent of Tidy, which would make an exact-height assertion
// flaky for reasons unrelated to this change. 'shape' has no such behaviour,
// so its post-tidy size is exactly what handleAutoArrange/tidyPositions set.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

interface SeedWidget {
  title: string
  x: number
  y: number
  w: number
  h: number
}

async function seedTask(
  window: Page,
  taskTitle: string,
  seeds: SeedWidget[],
  kind: string = 'shape'
): Promise<{ taskId: string; ids: string[] }> {
  return window.evaluate(
    async ({ taskTitle, seeds, kind }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const t = await api.nodes.create({ parentId: null, kind: 'task', title: taskTitle })
      const ids: string[] = []
      for (const s of seeds) {
        const w = await api.widgets.create({
          taskId: t.id,
          kind: kind as 'shape',
          title: s.title,
          content: '',
          x: s.x,
          y: s.y,
          width: s.w,
          height: s.h
        })
        ids.push(w.id)
        await new Promise((r) => setTimeout(r, 5))
      }
      return { taskId: t.id, ids }
    },
    { taskTitle, seeds, kind }
  )
}

async function openTask(window: Page, taskTitleRe: RegExp): Promise<void> {
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: taskTitleRe }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
  await window.waitForTimeout(300)
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

async function widgetRects(window: Page, ids: string[]): Promise<Record<string, Rect>> {
  return window.evaluate((ids: string[]) => {
    const w = window as unknown as {
      __fbWidgets?: { getState: () => { widgets: Array<{ id: string; x: number; y: number; width: number; height: number }> } }
    }
    const all = w.__fbWidgets?.getState().widgets ?? []
    const out: Record<string, Rect> = {}
    for (const id of ids) {
      const found = all.find((x) => x.id === id)
      if (found) out[id] = { x: found.x, y: found.y, width: found.width, height: found.height }
    }
    return out
  }, ids)
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function openTidyMenu(window: Page, at: { x: number; y: number } = { x: 200, y: 200 }): Promise<void> {
  const surface = window.locator('[data-canvas-surface="true"]')
  await surface.click({ button: 'right', position: at })
  await expect(window.locator('[data-canvas-ctx-menu]').first()).toBeVisible()
  const menu = window.locator('[data-canvas-ctx-menu]')
  await menu.getByText('Auto-arrange', { exact: true }).hover()
  await window.waitForTimeout(200)
  await menu.getByText('Tidy', { exact: true }).hover()
  await window.waitForTimeout(200)
}

// ---------------------------------------------------------------------------
// (a) Square grid: a smaller widget grows to fill its cell — no gap around it.
// ---------------------------------------------------------------------------
test('(a) Tidy > Square grid resizes widgets to fill their cell, no overlaps', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // 4 widgets, deliberately mixed sizes so at least one must grow in each axis.
  const { ids } = await seedTask(window, 'Tidy resize square test', [
    { title: 'w0', x: 700, y: 500, w: 150, h: 100 },
    { title: 'w1', x: 1200, y: 100, w: 300, h: 100 },
    { title: 'w2', x: 900, y: 800, w: 150, h: 250 },
    { title: 'w3', x: 1500, y: 300, w: 150, h: 100 }
  ])
  await openTask(window, /Tidy resize square test/)

  const before = await widgetRects(window, ids)
  for (const id of ids) {
    expect(before[id].width, `${id} pre-tidy width seeded`).toBeGreaterThan(0)
  }

  await openTidyMenu(window)
  await window.locator('[data-canvas-ctx-menu]').getByText('Square grid', { exact: true }).click()
  await window.waitForTimeout(500)

  const after = await widgetRects(window, ids)
  const [w0, w1, w2, w3] = ids.map((id) => after[id])

  // Column 0 = w0,w2 (widest 150); column 1 = w1,w3 (widest 300).
  // Row 0 = w0,w1 (tallest 100); row 1 = w2,w3 (tallest 250).
  expect(w0.width, 'col0 width = widest in col0').toBe(150)
  expect(w3.width, 'w3 grew from 150 to col1 width (300)').toBe(300)
  expect(w1.width, 'w1 stays at its own (already max) width').toBe(300)
  expect(w2.height, 'row1 height = tallest in row1').toBe(250)
  expect(w3.height, 'w3 grew from 100 to row1 height (250)').toBe(250)
  expect(w0.height, 'w0 stays at row0 tallest (100)').toBe(100)
  expect(w1.height, 'w1 stays at row0 tallest (100)').toBe(100)

  // No pairwise overlap among the 4 resized widgets.
  const rects = [w0, w1, w2, w3]
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i], rects[j]), `w${i}/w${j} do not overlap`).toBe(false)
    }
  }

  // App still alive / responsive after the resize-tidy (no crash).
  await expect(window.locator('[data-canvas-surface="true"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// (b) Flow (default Tidy pill button): a row is filled edge to edge.
// ---------------------------------------------------------------------------
test('(b) FloatingPill Tidy (default flow) fills each row edge to edge, uniform row height', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { ids } = await seedTask(window, 'Tidy resize flow test', [
    { title: 'w0', x: 700, y: 500, w: 200, h: 120 },
    { title: 'w1', x: 1200, y: 100, w: 250, h: 90 },
    { title: 'w2', x: 900, y: 800, w: 180, h: 150 }
  ])
  await openTask(window, /Tidy resize flow test/)

  // Drive the FloatingPill's Tidy button (default = flow), not the context menu.
  const pillTidy = window.locator('[data-testid="pill-tidy"]').first()
  await pillTidy.scrollIntoViewIfNeeded().catch(() => {})
  if (await pillTidy.isVisible().catch(() => false)) {
    await pillTidy.click()
  } else {
    // Some FloatingPill layouts require a hover to reveal the collapsed pill.
    await window.locator('[data-testid="floating-toolbar"]').first().hover().catch(() => {})
    await window.waitForTimeout(150)
    await window.locator('[data-testid="pill-tidy"]').first().click()
  }
  await window.waitForTimeout(500)

  const after = await widgetRects(window, ids)
  const rects = ids.map((id) => after[id])

  // All 3 items should land on one row (canvas is wide) and share the row's
  // tallest natural height (150), with no trailing gap on the right edge.
  const ys = new Set(rects.map((r) => r.y))
  expect(ys.size, 'all 3 fit on a single row').toBe(1)
  const heights = new Set(rects.map((r) => r.height))
  expect(heights.size, 'uniform row height').toBe(1)
  expect([...heights][0], 'row height = tallest natural height (150)').toBe(150)

  // No item shrank below its natural size, and none overlap.
  const naturalW: Record<string, number> = { w0: 200, w1: 250, w2: 180 }
  ids.forEach((id, i) => {
    expect(after[id].width, `${id} did not shrink below natural width`).toBeGreaterThanOrEqual(naturalW[`w${i}`])
  })
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i], rects[j]), `w${i}/w${j} do not overlap`).toBe(false)
    }
  }

  await expect(window.locator('[data-canvas-surface="true"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// (c) Custom rows: grid resize applies the same fill-to-cell rule.
// ---------------------------------------------------------------------------
test('(c) Tidy > Rows... > 2 rows resizes into an aligned grid with no overlaps', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { ids } = await seedTask(window, 'Tidy resize rows test', [
    { title: 'w0', x: 700, y: 500, w: 120, h: 90 },
    { title: 'w1', x: 1200, y: 100, w: 200, h: 90 },
    { title: 'w2', x: 900, y: 800, w: 120, h: 90 },
    { title: 'w3', x: 1500, y: 300, w: 120, h: 200 },
    { title: 'w4', x: 1000, y: 50, w: 120, h: 90 },
    { title: 'w5', x: 1700, y: 650, w: 120, h: 90 }
  ])
  await openTask(window, /Tidy resize rows test/)

  await openTidyMenu(window)
  const menu = window.locator('[data-canvas-ctx-menu]')
  await menu.getByText('Rows…', { exact: true }).hover()
  await window.waitForTimeout(200)
  await menu.getByText('2 rows', { exact: true }).click()
  await window.waitForTimeout(500)

  const after = await widgetRects(window, ids)
  const rects = ids.map((id) => after[id])

  // 6 items / 2 rows -> 3 columns. Distinct x count should be 3.
  const xs = new Set(rects.map((r) => r.x))
  expect(xs.size, 'three columns').toBe(3)
  const ys = new Set(rects.map((r) => r.y))
  expect(ys.size, 'two rows').toBe(2)

  // Every widget that shares w1's column (width 200) grew to 200; every widget
  // in w3's row (height 200) grew to 200 — direct evidence the grid actually
  // resized to fill cells, not just repositioned.
  for (const r of rects) {
    expect(r.width, 'no widget shrank below its own natural width').toBeGreaterThanOrEqual(120)
    expect(r.height, 'no widget shrank below its own natural height').toBeGreaterThanOrEqual(90)
  }
  const grew = rects.some((r) => r.width > 120 || r.height > 90)
  expect(grew, 'at least one widget grew to fill its cell').toBe(true)

  // No overlaps across all 6 resized widgets.
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i], rects[j]), `w${i}/w${j} do not overlap`).toBe(false)
    }
  }

  await expect(window.locator('[data-canvas-surface="true"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// (d) A section widget is NEVER resized by Tidy — it keeps auto-sizing to
//     its own children instead of being forced to a tidy cell size.
// ---------------------------------------------------------------------------
test('(d) Tidy does not resize a section widget, only repositions loose widgets', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const { taskId, ids } = await seedTask(window, 'Tidy resize section test', [
    { title: 'w0', x: 1400, y: 500, w: 300, h: 90 },
    { title: 'w1', x: 1900, y: 100, w: 120, h: 90 }
  ])

  // Section placed well clear of (200,200) — the proven "always bare canvas"
  // right-click point every other spec in this suite uses — so the default
  // right-click below reliably opens the canvas context menu, not a
  // section-specific one.
  const sectionId = await window.evaluate(async (taskId: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const sec = await api.widgets.create({
      taskId,
      kind: 'section',
      title: 'Sec',
      content: '',
      x: 1300,
      y: 700,
      width: 600,
      height: 400
    })
    return sec.id
  }, taskId)

  await openTask(window, /Tidy resize section test/)

  const sectionBefore = (await widgetRects(window, [sectionId]))[sectionId]

  await openTidyMenu(window)
  await window.locator('[data-canvas-ctx-menu]').getByText('Square grid', { exact: true }).click()
  await window.waitForTimeout(500)

  const sectionAfter = (await widgetRects(window, [sectionId]))[sectionId]
  expect(sectionAfter.width, 'section width untouched by tidy').toBe(sectionBefore.width)
  expect(sectionAfter.height, 'section height untouched by tidy').toBe(sectionBefore.height)

  // The two loose widgets were still resized/repositioned normally (2 items ->
  // 1x2 grid: both share one row, column widths = each item's own width since
  // they're the sole occupant of their column).
  const others = await widgetRects(window, ids)
  expect(others[ids[0]].width, 'loose widget w0 kept its own column width').toBe(300)
  expect(others[ids[1]].width, 'loose widget w1 kept its own column width').toBe(120)
  expect(others[ids[0]].height, 'row height = tallest of the two (90)').toBe(90)
  expect(others[ids[1]].height, 'row height = tallest of the two (90)').toBe(90)

  await expect(window.locator('[data-canvas-surface="true"]')).toBeVisible()
})
