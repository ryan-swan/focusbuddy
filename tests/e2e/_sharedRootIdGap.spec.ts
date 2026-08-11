import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null
test.afterEach(async () => { if (launched) { await launched.dispose(); launched = null } })

test('regression: a widget created on a desk AFTER it was shared is picked up for shared sync', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const deskId = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const node = await api.nodes.create({ parentId: null, kind: 'task', title: 'gap repro' } as never)
    return (node as unknown as { id: string }).id
  })

  // Simulate "already shared" (what stampSharedDesk does at share time).
  const stamped = await window.evaluate(async (rootId) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.stampSharedDesk(rootId)
  }, deskId)
  expect(stamped).toContain(deskId)

  // Mark the initial push as "done" (mimic a completed sync cycle) so the next
  // pending-collect only reflects NEW activity, matching the live-test conditions.
  const pendingBefore = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.pendingShared()
  })
  for (const u of (pendingBefore as { upserts: Array<{ id: string; itemType: string }> }).upserts) {
    await window.evaluate(async ({ id, itemType }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      return api.workspaceSync.markPushed(itemType as never, id, 1)
    }, u)
  }

  // NOW create a widget on the already-shared desk, exactly like A did after
  // sharing in the live two-window test.
  const widgetId = await window.evaluate(async (taskId) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const w = await api.widgets.create({ taskId, kind: 'note', content: 'new after share', x: 0, y: 0, width: 200, height: 100 } as never)
    return (w as unknown as { id: string }).id
  }, deskId)

  const pendingAfter = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.pendingShared()
  })
  const upserts = (pendingAfter as { upserts: Array<{ id: string; itemType: string; rootId?: string | null }> }).upserts
  const found = upserts.find((u) => u.id === widgetId)

  // The fix: collectPendingShared runs reconcileSharedDescendants first, which tags
  // any post-share descendant with the desk's shared_root_id. So a widget added
  // AFTER the share must now appear in the shared collect, bound to the desk — this
  // is what makes "changes as they happen" hold for new content, in both directions.
  expect(found, 'a widget created after sharing must be collected for shared sync').toBeTruthy()
  expect(found?.rootId).toBe(deskId)
})
