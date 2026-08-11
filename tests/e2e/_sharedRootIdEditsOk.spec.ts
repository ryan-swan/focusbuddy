import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null
test.afterEach(async () => { if (launched) { await launched.dispose(); launched = null } })

// Sanity check counterpart to _sharedRootIdGap.spec.ts: an EDIT to content that
// already existed at share time (the desk root node itself, or a widget created
// BEFORE the share) still carries shared_root_id (stamped once by stampSharedDesk)
// and re-fires needs_sync on every update via the existing *_mark_dirty triggers,
// so it correctly reappears in pendingShared. This isolates the gap to
// NEW rows created after the share, not edits to already-shared rows.
test('edit to a widget that existed AT share time still appears in pendingShared', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const deskId = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const node = await api.nodes.create({ parentId: null, kind: 'task', title: 'edits-ok repro' } as never)
    return (node as unknown as { id: string }).id
  })
  // Widget created BEFORE the share.
  const widgetId = await window.evaluate(async (taskId) => {
    const api = (window as unknown as { api: typeof window.api }).api
    const w = await api.widgets.create({ taskId, kind: 'note', content: 'pre-share', x: 0, y: 0, width: 200, height: 100 } as never)
    return (w as unknown as { id: string }).id
  }, deskId)

  const stamped = await window.evaluate(async (rootId) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.stampSharedDesk(rootId)
  }, deskId)
  expect(stamped).toContain(deskId)

  // Clear the initial-push dirty flags (mimic a completed sync cycle).
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

  // Now EDIT the pre-existing widget (not create a new one).
  await window.evaluate(async (id) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.widgets.update(id, { content: 'edited after share' } as never)
  }, widgetId)

  const pendingAfter = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.workspaceSync.pendingShared()
  })
  const upserts = (pendingAfter as { upserts: Array<{ id: string; itemType: string; rootId?: string | null }> }).upserts
  console.log('[EDITS-OK] pendingShared after editing a pre-existing widget:', JSON.stringify(upserts))
  const found = upserts.find((u) => u.id === widgetId)
  expect(found, 'edited pre-existing widget must reappear in pendingShared').toBeTruthy()
  expect(found?.rootId).toBe(deskId)
})
