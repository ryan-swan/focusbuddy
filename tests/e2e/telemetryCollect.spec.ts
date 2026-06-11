import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// The telemetry collector reports REAL local counts: widgets by kind, task and
// folder counts. Seed a known set and confirm the snapshot matches.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('TEL-1 — telemetry:collect reports real widget/task/folder counts', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed: 1 folder, 2 tasks, and a known mix of widgets.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const folder = await api.nodes.create({ parentId: null, kind: 'folder', title: 'TelFolder' })
    const t1 = await api.nodes.create({ parentId: folder.id, kind: 'task', title: 'TelTask1' })
    const t2 = await api.nodes.create({ parentId: folder.id, kind: 'task', title: 'TelTask2' })
    const mk = (taskId: string, kind: string) =>
      api.widgets.create({ taskId, kind: kind as never, title: '', content: '', x: 0, y: 0, width: 200, height: 200 })
    await mk(t1.id, 'sticky')
    await mk(t1.id, 'sticky')
    await mk(t1.id, 'note')
    await mk(t2.id, 'table')
  })

  const snap = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.ai.collectTelemetry()
  })

  console.log('[TEL-1] snapshot:', JSON.stringify(snap))
  expect(snap.taskCount).toBe(2)
  expect(snap.folderCount).toBe(1)
  expect(snap.widgetTotal).toBe(4)
  expect(snap.widgetsByKind.sticky).toBe(2)
  expect(snap.widgetsByKind.note).toBe(1)
  expect(snap.widgetsByKind.table).toBe(1)
  expect(typeof snap.aiCalls).toBe('number')
  expect(['mac', 'windows', 'linux']).toContain(snap.platform)
  expect(snap.appVersion).toMatch(/^\d+\.\d+\.\d+/)
})
