import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// The soft-delete + restore contract that task/folder undo relies on: deleting a
// node trashes its whole subtree (returning the trashed ids) and hides it from
// the tree, and restore brings the subtree back intact. Driven through
// window.api.nodes so it's deterministic, independent of the sidebar UI.

test('NODE-UNDO — delete trashes the subtree and restore brings it back', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    const r = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      type N = { id: string; title: string }
      const folder = (await api.nodes.create({ parentId: null, kind: 'folder', title: 'Undo Folder' })) as N
      const child = (await api.nodes.create({ parentId: folder.id, kind: 'task', title: 'Undo Child' })) as N

      const present = (list: N[], id: string): boolean => list.some((n) => n.id === id)
      const before = (await api.nodes.list()) as N[]

      // Soft-delete the folder → returns the trashed ids (folder + child).
      const trashed = (await api.nodes.delete(folder.id)) as string[]
      const afterDelete = (await api.nodes.list()) as N[]

      // Restore the trashed subtree.
      const restored = await api.nodes.restore(trashed)
      const afterRestore = (await api.nodes.list()) as N[]

      // Single-task delete + restore.
      const t2 = (await api.nodes.create({ parentId: folder.id, kind: 'task', title: 'Solo' })) as N
      const trashed2 = (await api.nodes.delete(t2.id)) as string[]
      const afterT2Delete = (await api.nodes.list()) as N[]
      await api.nodes.restore(trashed2)
      const afterT2Restore = (await api.nodes.list()) as N[]

      // Clean up.
      await api.nodes.delete(folder.id)

      return {
        folderId: folder.id,
        childId: child.id,
        bothBefore: present(before, folder.id) && present(before, child.id),
        trashed,
        goneAfterDelete: !present(afterDelete, folder.id) && !present(afterDelete, child.id),
        backAfterRestore: present(afterRestore, folder.id) && present(afterRestore, child.id),
        restored,
        t2Id: t2.id,
        t2Gone: !present(afterT2Delete, t2.id),
        t2Back: present(afterT2Restore, t2.id)
      }
    })

    expect(r.bothBefore).toBe(true)
    // delete returned the whole subtree (folder + child)
    expect(r.trashed).toContain(r.folderId)
    expect(r.trashed).toContain(r.childId)
    expect(r.goneAfterDelete).toBe(true)
    expect(r.restored).toBe(true)
    expect(r.backAfterRestore).toBe(true)
    // single-node delete/restore round-trips too
    expect(r.trashed2 ?? r.t2Gone).toBeTruthy()
    expect(r.t2Gone).toBe(true)
    expect(r.t2Back).toBe(true)
  } finally {
    await dispose()
  }
})
