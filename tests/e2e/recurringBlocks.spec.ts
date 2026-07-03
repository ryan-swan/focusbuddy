// E2E: recurring time blocks (weekly recurrence) materialise real occurrence
// rows through window.api.timeBlocks, share one seriesId, are idempotent to
// re-list, and a series-scoped delete from the first occurrence clears the
// whole series.
//
// Backing contract (src/main/db/timeBlocks.ts):
//   - createTimeBlock() with draft.recurrence set anchors seriesId = its own
//     id, then calls materializeRecurringBlocks() which extends the series
//     out to a 60-day rolling horizon in one synchronous pass — so occurrences
//     already exist immediately after create(), no extra ticks needed.
//   - listBlocksInRange() is a plain SELECT — calling it twice cannot itself
//     create duplicates, proving idempotency of the read path.
//   - deleteTimeBlock(id, 'series') deletes every row in the series with
//     start_ms >= the given row's start_ms. Called on the first (earliest)
//     occurrence, that clears the entire series.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// A fixed next-Monday-10:00-UTC anchor, deterministic regardless of when the
// suite runs (only requires the anchor be in the future relative to "now" is
// NOT required — timeBlocks has no such constraint — but a fixed constant
// keeps the test hermetic across timezones).
const NEXT_MONDAY_10AM_UTC = (() => {
  const d = new Date('2026-08-03T10:00:00.000Z') // a known Monday
  return d.getTime()
})()

test('weekly recurring block materialises 4+ occurrences sharing one seriesId, idempotently, and series-delete clears the window', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const start = NEXT_MONDAY_10AM_UTC
  const fourWeeksMs = 28 * 24 * 60 * 60 * 1000

  const result = await window.evaluate(async ({ start, fourWeeksMs }) => {
    const api = (window as unknown as { api: typeof window.api }).api

    const created = await api.timeBlocks.create({
      taskId: null,
      title: 'R',
      startMs: start,
      durationMin: 30,
      recurrence: 'weekly'
    } as never)

    const windowEnd = start + fourWeeksMs
    const firstList = await api.timeBlocks.list(start, windowEnd)
    const secondList = await api.timeBlocks.list(start, windowEnd)

    const seriesIds = new Set(firstList.map((b) => (b as unknown as { seriesId: string | null }).seriesId))

    const deleted = await api.timeBlocks.delete(created.id, 'series')
    const afterDelete = await api.timeBlocks.list(start, windowEnd)

    return {
      createdId: created.id,
      createdSeriesId: (created as unknown as { seriesId: string | null }).seriesId,
      firstCount: firstList.length,
      secondCount: secondList.length,
      distinctSeriesIds: [...seriesIds],
      deleted,
      afterDeleteCount: afterDelete.length
    }
  }, { start, fourWeeksMs })

  expect(result.createdId).toBeTruthy()
  expect(result.createdSeriesId).toBe(result.createdId) // first occurrence anchors its own series

  // 4-week window at 30 min weekly cadence starting exactly on the window
  // start yields exactly 4 occurrences (week 0, 1, 2, 3) — assert >= 4 per
  // the brief, but the exact contract is 4.
  expect(result.firstCount).toBeGreaterThanOrEqual(4)

  // Idempotent: re-listing the identical window returns the identical count.
  expect(result.secondCount).toBe(result.firstCount)

  // Every occurrence in the window shares the same seriesId.
  expect(result.distinctSeriesIds).toEqual([result.createdSeriesId])

  // Series-scoped delete from the first occurrence clears the whole window.
  expect(result.deleted).toBe(true)
  expect(result.afterDeleteCount).toBe(0)
})
