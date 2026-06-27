// E2E: verify that the two new ActionProposal ops produce durable effects.
//
// Strategy: drive the IPC surface directly from the Playwright renderer context
// using window.api.* (the same interface the Zustand stores call). This avoids
// needing a live Anthropic model. We:
//   1. Create a real task via window.api.nodes.create
//   2. Call window.api.nodes.update with the same patch applyUpdateTask would emit
//      and verify the node comes back mutated (status, title, dueDate).
//   3. Call window.api.knowledge.create and verify the entry is retrievable via
//      window.api.knowledge.list.
//
// This is API-driven, not UI gesture-driven, which is the documented policy for
// cases where the exact code path (store → IPC → SQLite → IPC → store) is the
// risk surface and pointer gestures add noise. We state this explicitly in the
// verdict per the tester instructions.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('update-task apply path: status, title, and dueDate mutations persist', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // 1. Create a task via IPC — mirrors what applyCreateTask does.
    const created = await window.evaluate(async () => {
      return window.api.nodes.create({
        parentId: null,
        kind: 'task',
        title: 'Proposal apply test task',
        description: 'initial notes',
        dueDate: 1700000000000
      })
    })
    expect(created).toBeTruthy()
    expect(created.id).toBeTruthy()
    expect(created.title).toBe('Proposal apply test task')
    expect(created.status).toBe('open')

    // 2a. Apply status patch — what applyUpdateTask emits for status:'done'.
    const afterStatus = await window.evaluate(async (id: string) => {
      return window.api.nodes.update(id, { status: 'done' })
    }, created.id)
    expect(afterStatus).toBeTruthy()
    expect(afterStatus.status).toBe('done')

    // 2b. Apply title rename.
    const afterRename = await window.evaluate(async (id: string) => {
      return window.api.nodes.update(id, { title: 'Renamed via proposal' })
    }, created.id)
    expect(afterRename).toBeTruthy()
    expect(afterRename.title).toBe('Renamed via proposal')

    // 2c. Clear dueDate (null patch) — explicit null, not omitted.
    const afterDueDate = await window.evaluate(async (id: string) => {
      return window.api.nodes.update(id, { dueDate: null })
    }, created.id)
    expect(afterDueDate).toBeTruthy()
    expect(afterDueDate.dueDate).toBeNull()

    // 2d. Confirm mutations are durable: re-list and find the node.
    const listed = await window.evaluate(async (id: string) => {
      const all = await window.api.nodes.list()
      return all.find((n: { id: string }) => n.id === id) ?? null
    }, created.id)
    expect(listed).toBeTruthy()
    expect(listed.status).toBe('done')
    expect(listed.title).toBe('Renamed via proposal')
    expect(listed.dueDate).toBeNull()

  } finally {
    await dispose()
  }
})

test('create-knowledge-entry apply path: entry appears in knowledge list', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    // 1. Create the entry via IPC — what applyCreateKnowledgeEntry calls.
    const entry = await window.evaluate(async () => {
      return window.api.knowledge.create({
        title: 'Brand voice rule',
        body: 'We write in first-person plural.',
        tags: ['brand', 'voice'],
        pinned: true
      })
    })
    expect(entry).toBeTruthy()
    expect(entry.id).toBeTruthy()
    expect(entry.title).toBe('Brand voice rule')
    expect(entry.body).toBe('We write in first-person plural.')
    expect(entry.tags).toEqual(['brand', 'voice'])
    expect(entry.pinned).toBe(true)

    // 2. Confirm durable persistence: list all entries and find ours.
    const all = await window.evaluate(async () => {
      return window.api.knowledge.list()
    })
    const found = all.find((e: { id: string }) => e.id === entry.id)
    expect(found).toBeTruthy()
    expect(found.title).toBe('Brand voice rule')
    expect(found.body).toBe('We write in first-person plural.')
    expect(found.pinned).toBe(true)

  } finally {
    await dispose()
  }
})
