import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

// Minimap dedup self-heal — verifies the Canvas.tsx fix that ensures
// exactly one minimap widget exists per task at all times, regardless of
// how many extras accumulated in SQLite before the desk was opened.
//
// Four scenarios:
//   1. Exactly one on normal open.
//   2. Pre-existing duplicates are healed when the desk opens.
//   3. Adding widgets doesn't create extra minimaps.
//   4. Window reload doesn't accumulate a second minimap.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Create a task and return its id. Does NOT open the desk. */
async function createTask(window: LaunchedApp['window'], title: string): Promise<string> {
  return window.evaluate(async (t: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: t })
    return task.id
  }, title)
}

/** Re-read all minimap widgets for a task from SQLite via IPC. */
async function listMinimaps(
  window: LaunchedApp['window'],
  taskId: string
): Promise<Array<{ id: string; createdAt: number }>> {
  return window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const widgets = await api.widgets.listByTask(tid)
    return widgets
      .filter((w) => w.kind === 'minimap')
      .map((w) => ({ id: w.id, createdAt: w.createdAt }))
  }, taskId)
}

/** Open a task's desk by clicking its title card, then wait for the canvas surface. */
async function openDesk(window: LaunchedApp['window'], title: string): Promise<void> {
  await window.getByRole('button', { name: title }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
}

/**
 * Poll `listMinimaps` until the count equals `target` or `timeoutMs` elapses.
 * Returns the final array regardless of whether the target was reached.
 */
async function pollUntilMinimapCount(
  window: LaunchedApp['window'],
  taskId: string,
  target: number,
  timeoutMs = 5_000
): Promise<Array<{ id: string; createdAt: number }>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const minimaps = await listMinimaps(window, taskId)
    if (minimaps.length === target) return minimaps
    await window.waitForTimeout(150)
  }
  return listMinimaps(window, taskId)
}

// ── Test 1: exactly one minimap on normal open ──────────────────────────────

test('exactly one minimap exists after opening a fresh task desk', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const taskId = await createTask(window, 'Dedup-T1')

  // Reload so the task card appears in the sidebar list.
  await window.reload()
  await waitForReady(window)

  await openDesk(window, 'Dedup-T1')

  // Give the auto-create effect time to run and IPC to round-trip.
  const minimaps = await pollUntilMinimapCount(window, taskId, 1, 4_000)

  expect(minimaps.length).toBe(1)
})

// ── Test 2: self-heal pre-existing duplicates ───────────────────────────────

test('self-heal: pre-existing duplicate minimaps are reduced to exactly one on desk open', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const taskId = await createTask(window, 'Dedup-T2')

  // Inject 3 extra minimap widgets directly via IPC while the desk is still
  // closed, simulating the old bug's accumulated duplicates.
  const injectedIds = await window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const w = await api.widgets.create({
        taskId: tid,
        kind: 'minimap',
        title: '',
        content: '',
        x: 0,
        y: 0,
        width: 220,
        height: 160,
        pinned: true,
        pinnedZone: 'br'
      })
      ids.push(w.id)
    }
    return ids
  }, taskId)

  // Verify 3 minimaps exist before opening the desk (the injected state).
  const before = await listMinimaps(window, taskId)
  expect(before.length).toBe(3)

  // Capture the oldest id so we can verify the fix kept it.
  // `listMinimaps` returns the raw SQLite order; sort ascending by createdAt.
  const sorted = [...before].sort((a, b) => a.createdAt - b.createdAt)
  const oldestId = sorted[0].id

  // Reload so the task shows in the sidebar, then open the desk.
  await window.reload()
  await waitForReady(window)

  await openDesk(window, 'Dedup-T2')

  // Poll until the dedup effect fires and reduces to exactly one.
  const after = await pollUntilMinimapCount(window, taskId, 1, 6_000)

  expect(after.length).toBe(1)

  // The surviving minimap must be the oldest (lowest createdAt) of the set.
  // This verifies the fix's sort-and-keep-first logic.
  expect(after[0].id).toBe(oldestId)

  // Silence the linter — injectedIds is used for documentation only.
  void injectedIds
})

// ── Test 3: no duplicate on adding widgets ──────────────────────────────────

test('adding widgets after desk open does not create extra minimaps', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const taskId = await createTask(window, 'Dedup-T3')

  await window.reload()
  await waitForReady(window)

  await openDesk(window, 'Dedup-T3')

  // Wait for the initial auto-create to settle at exactly one.
  const initial = await pollUntilMinimapCount(window, taskId, 1, 4_000)
  expect(initial.length).toBe(1)

  // Add 3 sticky widgets — each add touches widgetIds and re-triggers the
  // minimap effect. The dedup path should keep the count at 1.
  await window.evaluate(async (tid: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    for (let i = 0; i < 3; i++) {
      await api.widgets.create({
        taskId: tid,
        kind: 'sticky',
        title: `note-${i}`,
        content: `sticky ${i}`,
        x: 100 + i * 60,
        y: 100,
        width: 220,
        height: 160
      })
    }
  }, taskId)

  // Allow the effect to run after each widget creation.
  await window.waitForTimeout(600)

  const after = await listMinimaps(window, taskId)
  expect(after.length).toBe(1)
})

// ── Test 4: no duplicate across window reload ────────────────────────────────

test('reloading the window does not accumulate a second minimap', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const taskId = await createTask(window, 'Dedup-T4')

  // First load: open the desk and confirm one minimap is created.
  await window.reload()
  await waitForReady(window)

  await openDesk(window, 'Dedup-T4')
  const first = await pollUntilMinimapCount(window, taskId, 1, 4_000)
  expect(first.length).toBe(1)

  // Reload the window (simulates user pressing Cmd+R or the app auto-reloading).
  await window.reload()
  await waitForReady(window)

  // Re-open the same task — the minimap was already in SQLite, and the
  // auto-create effect must NOT add another one.
  await openDesk(window, 'Dedup-T4')

  // Wait long enough for both the auto-create guard and dedup to settle.
  const after = await pollUntilMinimapCount(window, taskId, 1, 4_000)

  expect(after.length).toBe(1)
})
