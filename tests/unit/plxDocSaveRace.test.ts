import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The documents store debounces body saves. It used to keep a single module-global
// timer, so editing document A then switching to document B within the debounce
// window cancelled A's pending save and the flush's "still the same doc?" guard
// then skipped it entirely — A's last edit was silently lost. This proves the
// per-document timers fix: BOTH documents' edits reach disk.

vi.mock('@renderer/lib/cloudDocsSync', () => ({
  pushCloudDoc: vi.fn(async () => ({ conflictedTo: undefined })),
  pullCloudDocs: vi.fn(async () => []),
  pushCloudDelete: vi.fn(async () => undefined)
}))
vi.mock('@renderer/lib/syncNudge', () => ({ nudgeSync: vi.fn() }))
vi.mock('@renderer/stores/actionHistory', () => ({
  recordActionWithToast: vi.fn(),
  useActionHistory: { getState: () => ({}) }
}))
vi.mock('@renderer/stores/messaging', () => ({
  useMessagingStore: { getState: () => ({ refreshConversations: vi.fn() }) }
}))

import { useDocumentsStore } from '@renderer/stores/documents'
import type { FbDocument } from '@shared/types'

const doc = (id: string, body: unknown): FbDocument =>
  ({ id, docType: 'doc', title: id, body, rev: 1, createdAt: 0, updatedAt: 0 }) as unknown as FbDocument

describe('documents.saveBody — per-document debounce', () => {
  let updates: Array<{ id: string; body: unknown }>

  beforeEach(() => {
    vi.useFakeTimers()
    updates = []
    ;(globalThis as unknown as { window: unknown }).window = {
      api: { documents: { update: vi.fn(async (id: string, patch: { body: unknown }) => { updates.push({ id, body: patch.body }) }) } }
    }
  })
  afterEach(() => {
    vi.useRealTimers()
    useDocumentsStore.setState({ active: null })
  })

  it('does NOT drop document A when you switch to B within the debounce window', async () => {
    const s = useDocumentsStore.getState()

    useDocumentsStore.setState({ active: doc('A', { v: 0 }) })
    s.saveBody({ v: 'a-edit' })

    // Switch to B and edit it, all within A's 600ms debounce.
    useDocumentsStore.setState({ active: doc('B', { v: 0 }) })
    s.saveBody({ v: 'b-edit' })

    await vi.advanceTimersByTimeAsync(700)

    const ids = updates.map((u) => u.id).sort()
    expect(ids).toEqual(['A', 'B']) // both flushed; A not dropped
    expect(updates.find((u) => u.id === 'A')?.body).toEqual({ v: 'a-edit' })
    expect(updates.find((u) => u.id === 'B')?.body).toEqual({ v: 'b-edit' })
  })

  it('coalesces rapid edits to the same document into one write of the latest body', async () => {
    const s = useDocumentsStore.getState()
    useDocumentsStore.setState({ active: doc('A', { v: 0 }) })
    s.saveBody({ v: 1 })
    s.saveBody({ v: 2 })
    s.saveBody({ v: 3 })
    await vi.advanceTimersByTimeAsync(700)
    const forA = updates.filter((u) => u.id === 'A')
    expect(forA).toHaveLength(1)
    expect(forA[0].body).toEqual({ v: 3 })
  })
})
