import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady, gotoView } from './_helpers'

// Google-Calendar-style direct manipulation on week-grid blocks: drag the body
// to move (including across days), drag the bottom edge to extend, drag the top
// edge to start earlier/later. The drag is wired through window pointer events,
// so real Playwright mouse events drive it; we assert on the persisted block
// (real SQLite via api.timeBlocks) rather than pixels, so the proof is truthful.

const HOUR_PX = 44
const DAY_MS = 86_400_000

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// Create a block today at 09:00 local, 60 min, and return its id + startMs.
async function seedBlockToday(window: Page): Promise<{ id: string; startMs: number }> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    const startMs = d.getTime()
    const created = await api.timeBlocks.create({ taskId: null, title: 'Drag me', startMs, durationMin: 60 })
    return { id: created.id, startMs }
  })
}

async function readBlock(window: Page, id: string): Promise<{ startMs: number; durationMin: number } | null> {
  return window.evaluate(async (blockId) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const now = Date.now()
    const list = await api.timeBlocks.list(now - 10 * 86_400_000, now + 10 * 86_400_000)
    const b = list.find((x) => x.id === blockId)
    return b ? { startMs: b.startMs, durationMin: b.durationMin } : null
  }, id)
}

async function openWeek(window: Page): Promise<void> {
  await gotoView(window, 'goCalendar')
  await window.locator('[data-testid="calendar-mode-week"]').click()
  await expect(window.locator('[data-testid="week-time-grid"]')).toBeVisible({ timeout: 6000 })
  await expect(window.locator('[data-testid="time-block"]')).toHaveCount(1, { timeout: 6000 })
}

test('CDR-1 — dragging a block body down by 2 hours reschedules it +2h', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const { id, startMs } = await seedBlockToday(window)
  await window.reload()
  await waitForReady(window)
  await openWeek(window)

  const box = await window.locator('[data-testid="time-block"]').boundingBox()
  expect(box).not.toBeNull()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await window.mouse.move(cx, cy)
    await window.mouse.down()
    await window.mouse.move(cx, cy + 2 * HOUR_PX, { steps: 8 })
    await window.mouse.up()
  }
  await window.waitForTimeout(400)

  const after = await readBlock(window, id)
  // eslint-disable-next-line no-console
  console.log(`[CDR-1] start ${startMs} -> ${after?.startMs} (delta ${(after!.startMs - startMs) / 3_600_000}h)`)
  expect(after).not.toBeNull()
  expect(after!.startMs - startMs).toBe(2 * 3_600_000)
  expect(after!.durationMin).toBe(60)
})

test('CDR-2 — dragging the bottom edge down by 1 hour extends duration to 120', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const { id, startMs } = await seedBlockToday(window)
  await window.reload()
  await waitForReady(window)
  await openWeek(window)

  const box = await window.locator('[data-testid="time-block"]').boundingBox()
  const handle = await window.locator('[data-testid="block-resize-bottom"]').boundingBox()
  expect(box).not.toBeNull()
  expect(handle).not.toBeNull()
  if (handle) {
    const cx = handle.x + handle.width / 2
    const cy = handle.y + handle.height / 2
    await window.mouse.move(cx, cy)
    await window.mouse.down()
    await window.mouse.move(cx, cy + HOUR_PX, { steps: 8 })
    await window.mouse.up()
  }
  await window.waitForTimeout(400)

  const after = await readBlock(window, id)
  // eslint-disable-next-line no-console
  console.log(`[CDR-2] dur 60 -> ${after?.durationMin}, start unchanged ${after?.startMs === startMs}`)
  expect(after).not.toBeNull()
  expect(after!.startMs).toBe(startMs)
  expect(after!.durationMin).toBe(120)
})

test('CDR-3 — dragging the top edge down keeps the end fixed and clamps the start', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const { id, startMs } = await seedBlockToday(window)
  await window.reload()
  await waitForReady(window)
  await openWeek(window)

  const handle = await window.locator('[data-testid="block-resize-top"]').boundingBox()
  expect(handle).not.toBeNull()
  if (handle) {
    const cx = handle.x + handle.width / 2
    const cy = handle.y + handle.height / 2
    await window.mouse.move(cx, cy)
    await window.mouse.down()
    await window.mouse.move(cx, cy + HOUR_PX, { steps: 8 })
    await window.mouse.up()
  }
  await window.waitForTimeout(400)

  const after = await readBlock(window, id)
  // eslint-disable-next-line no-console
  console.log(`[CDR-3] start ${startMs} -> ${after?.startMs} (+${(after!.startMs - startMs) / 3_600_000}h), dur ${after?.durationMin}`)
  expect(after).not.toBeNull()
  // Top edge moves the start later by 1h while the end stays fixed, so a 60-min
  // block becomes a 0-length... clamped: start can go at most end - SNAP_MIN.
  // 09:00-10:00 dragged +1h at the top clamps start to 09:45 (end 10:00, 15 min).
  expect(after!.startMs).toBe(startMs + 45 * 60_000)
  expect(after!.durationMin).toBe(15)
})

test('CDR-4 — dragging a block sideways into the neighbouring day moves it one day', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const { id, startMs } = await seedBlockToday(window)
  await window.reload()
  await waitForReady(window)
  await openWeek(window)

  // Find which day column holds the block, then target a neighbouring column.
  const box = await window.locator('[data-testid="time-block"]').boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

  const colBoxes: Array<{ i: number; x: number; w: number }> = []
  for (let i = 0; i < 7; i++) {
    const cb = await window.locator(`[data-testid="day-col-${i}"]`).boundingBox()
    if (cb) colBoxes.push({ i, x: cb.x, w: cb.width })
  }
  const cur = colBoxes.find((c) => cx >= c.x && cx <= c.x + c.w)
  expect(cur, 'block should sit inside a day column').toBeTruthy()
  const target = cur!.i < 6 ? colBoxes[cur!.i + 1] : colBoxes[cur!.i - 1]
  const dayDelta = target.i - cur!.i // +1 or -1
  const targetX = target.x + target.w / 2

  await window.mouse.move(cx, cy)
  await window.mouse.down()
  await window.mouse.move(targetX, cy, { steps: 10 }) // horizontal only, keep the time-of-day
  await window.mouse.up()
  await window.waitForTimeout(400)

  const after = await readBlock(window, id)
  // eslint-disable-next-line no-console
  console.log(`[CDR-4] dayDelta ${dayDelta} start ${startMs} -> ${after?.startMs} (delta days ${(after!.startMs - startMs) / DAY_MS})`)
  expect(after).not.toBeNull()
  expect(after!.startMs - startMs).toBe(dayDelta * DAY_MS)
  expect(after!.durationMin).toBe(60)
})
