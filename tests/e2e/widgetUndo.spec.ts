import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// The widget soft-delete + restore contract that canvas undo relies on: deleting
// a widget hides it from its task's list (recoverable) without hard-cascading,
// and restore brings it back. Driven through window.api so it's deterministic.

test('WIDGET-UNDO — delete soft-hides a widget and restore brings it back', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const r = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      type W = { id: string; kind: string }
      const task = (await api.nodes.create({ parentId: null, kind: 'task', title: 'Widget Undo Task' })) as { id: string }
      const w = (await api.widgets.create({
        taskId: task.id,
        kind: 'sticky',
        title: '',
        content: 'undo me',
        x: 40,
        y: 40,
        width: 200,
        height: 160
      })) as W

      const has = (list: W[], id: string): boolean => list.some((x) => x.id === id)
      const before = (await api.widgets.listByTask(task.id)) as W[]

      const deleted = await api.widgets.delete(w.id)
      const afterDelete = (await api.widgets.listByTask(task.id)) as W[]

      const restored = await api.widgets.restore(w.id)
      const afterRestore = (await api.widgets.listByTask(task.id)) as W[]

      // Clean up the task (soft) — its widget goes with it.
      await api.nodes.delete(task.id)

      return {
        widgetId: w.id,
        present: has(before, w.id),
        deleted,
        goneAfterDelete: !has(afterDelete, w.id),
        restored,
        backAfterRestore: has(afterRestore, w.id)
      }
    })

    expect(r.present).toBe(true)
    expect(r.deleted).toBe(true)
    expect(r.goneAfterDelete).toBe(true)
    expect(r.restored).toBe(true)
    expect(r.backAfterRestore).toBe(true)
  } finally {
    await dispose()
  }
})
