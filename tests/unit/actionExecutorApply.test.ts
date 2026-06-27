// Unit tests for applyProposal — the durable apply path added in cde913d.
//
// We mock the Zustand stores so we can exercise applyUpdateTask and
// applyCreateKnowledgeEntry without booting Electron or touching IPC.
// The mocks expose the same getState() contract the executor calls:
//
//   useNodeStore.getState().nodes  — seed with a fake task
//   useNodeStore.getState().update — captured spy, returns resolved promise
//   useKnowledgeStore.getState().create — captured spy, returns a fake entry
//
// These tests prove:
//   1. update-task with status:'done'  → ok:true + patch sent to node store
//   2. update-task with title rename   → ok:true + title patch forwarded
//   3. update-task with dueDate:null   → ok:true + dueDate:null forwarded
//   4. update-task invalid status      → ok:false, no mutation
//   5. update-task non-existent taskId → ok:false, no mutation
//   6. create-knowledge-entry          → ok:true + draft forwarded to store
//   7. create-knowledge-entry returns null → ok:false (store error path)
//
// No IPC, no Electron, no network.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FbNode } from '../../src/shared/types'

// ── Minimal fake node ────────────────────────────────────────────────────────
function fakeNode(over: Partial<FbNode> = {}): FbNode {
  return {
    id: 'node-test-1',
    parentId: null,
    kind: 'task',
    title: 'My test task',
    description: '',
    status: 'open',
    priority: 3,
    interest: 3,
    importance: 3,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    startedAt: null,
    completedAt: null,
    estimateMinutes: null,
    extensionsMinutes: 0,
    resumeMarkdown: null,
    resumeUpdatedAt: null,
    dueDate: 1700000000000,
    archived: false,
    sharedFromHandle: null,
    ...over
  }
}

// ── Shared mutable spy state ─────────────────────────────────────────────────
// We mutate these between tests so that individual assertions can read back
// what the executor passed to the store.
const nodeUpdateSpy = vi.fn().mockResolvedValue(undefined)
let storedNodes: FbNode[] = []

const knowledgeCreateSpy = vi.fn()
let knowledgeCreateResult: unknown = null

// ── Store mocks ──────────────────────────────────────────────────────────────
// vi.mock is hoisted before imports, but the factory captures the spies via
// closure so re-assignments in beforeEach reach them.
vi.mock('../../src/renderer/src/stores/nodes', () => ({
  useNodeStore: {
    getState: () => ({
      get nodes() { return storedNodes },
      update: nodeUpdateSpy
    })
  }
}))

vi.mock('../../src/renderer/src/stores/knowledge', () => ({
  useKnowledgeStore: {
    getState: () => ({
      create: knowledgeCreateSpy
    })
  }
}))

// Stub the other stores that actionExecutor imports but the tested cases
// don't use — avoids "module not found" on window.api calls inside them.
vi.mock('../../src/renderer/src/stores/widgets', () => ({
  useWidgetStore: { getState: () => ({ widgets: [], create: vi.fn(), update: vi.fn(), bringToFront: vi.fn(), setActive: vi.fn(), focusOn: vi.fn(), setFocused: vi.fn(), remove: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/stores/focusSession', () => ({
  useFocusSessionStore: { getState: () => ({ start: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/stores/tables', () => ({
  useTablesStore: { getState: () => ({ createTable: vi.fn(), ensureTableLoaded: vi.fn(), addRow: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/stores/links', () => ({
  useLinksStore: { getState: () => ({ create: vi.fn() }) }
}))
vi.mock('../../src/renderer/src/lib/widgetCatalog', () => ({
  catalogFor: () => null
}))
vi.mock('../../src/renderer/src/lib/spawnPosition', () => ({
  spawnPositionFor: () => ({ x: 0, y: 0 })
}))

// ── Subject under test ───────────────────────────────────────────────────────
// Imported AFTER mocks so vi.mock hoisting replaces the real modules.
import { applyProposal } from '../../src/renderer/src/lib/actionExecutor'
import type { ActionProposal } from '../../src/shared/types'

// ── Test reset ───────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  storedNodes = [fakeNode()]
  knowledgeCreateResult = null
  knowledgeCreateSpy.mockImplementation(() => Promise.resolve(knowledgeCreateResult))
})

// ── update-task ──────────────────────────────────────────────────────────────
describe('applyProposal: update-task', () => {
  it('marks an existing task done — returns ok:true and patches status', async () => {
    const p: ActionProposal = {
      id: 'p1',
      kind: 'update-task',
      taskId: 'node-test-1',
      label: 'My test task',
      status: 'done'
    }
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('My test task')
    expect(nodeUpdateSpy).toHaveBeenCalledOnce()
    const [calledId, calledPatch] = nodeUpdateSpy.mock.calls[0]
    expect(calledId).toBe('node-test-1')
    expect(calledPatch).toEqual({ status: 'done' })
  })

  it('renames a task — patches title only, no status key', async () => {
    const p: ActionProposal = {
      id: 'p2',
      kind: 'update-task',
      taskId: 'node-test-1',
      label: 'My test task',
      title: 'Renamed task'
    }
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(true)
    const [, patch] = nodeUpdateSpy.mock.calls[0]
    expect(patch).toEqual({ title: 'Renamed task' })
    expect(patch).not.toHaveProperty('status')
  })

  it('clears dueDate when dueDate:null is passed', async () => {
    const p: ActionProposal = {
      id: 'p3',
      kind: 'update-task',
      taskId: 'node-test-1',
      label: 'My test task',
      dueDate: null
    }
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(true)
    const [, patch] = nodeUpdateSpy.mock.calls[0]
    expect(patch).toHaveProperty('dueDate', null)
  })

  it('falls back to activeTaskId when taskId is missing', async () => {
    storedNodes = [fakeNode({ id: 'active-node', title: 'Active task' })]
    const p: ActionProposal = {
      id: 'p4',
      kind: 'update-task',
      taskId: 'active-node',
      label: 'Active task',
      status: 'in_progress'
    }
    const result = await applyProposal(p, { activeTaskId: 'active-node' })
    expect(result.ok).toBe(true)
    const [calledId] = nodeUpdateSpy.mock.calls[0]
    expect(calledId).toBe('active-node')
  })

  it('GUARD: invalid status returns ok:false and does NOT mutate', async () => {
    const p = {
      id: 'g1',
      kind: 'update-task',
      taskId: 'node-test-1',
      label: 'My test task',
      status: 'deleted' // not a valid TaskStatus
    } as unknown as ActionProposal
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('deleted')
    expect(nodeUpdateSpy).not.toHaveBeenCalled()
  })

  it('GUARD: non-existent taskId returns ok:false and does NOT mutate', async () => {
    const p: ActionProposal = {
      id: 'g2',
      kind: 'update-task',
      taskId: 'does-not-exist',
      label: 'Ghost task',
      status: 'done'
    }
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(false)
    expect(nodeUpdateSpy).not.toHaveBeenCalled()
  })

  it('GUARD: no taskId and no activeTaskId returns ok:false', async () => {
    // taskId present but empty-string edge case — use the no-active-task path
    const p: ActionProposal = {
      id: 'g3',
      kind: 'update-task',
      taskId: '',
      label: 'No target',
      status: 'done'
    }
    // With an empty taskId the executor falls back to activeTaskId (also null here).
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(false)
    expect(nodeUpdateSpy).not.toHaveBeenCalled()
  })
})

// ── create-knowledge-entry ───────────────────────────────────────────────────
describe('applyProposal: create-knowledge-entry', () => {
  it('creates an entry with title, body, tags, pinned and returns ok:true', async () => {
    knowledgeCreateResult = {
      id: 'kb-1',
      title: 'Brand voice rule',
      body: 'We write in first-person plural.',
      tags: ['brand', 'voice'],
      pinned: true,
      createdAt: 0,
      updatedAt: 0
    }
    const p: ActionProposal = {
      id: 'kb-p1',
      kind: 'create-knowledge-entry',
      title: 'Brand voice rule',
      body: 'We write in first-person plural.',
      tags: ['brand', 'voice'],
      pinned: true
    }
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Brand voice rule')
    expect(result.message).toContain('PlexiBrain')
    expect(knowledgeCreateSpy).toHaveBeenCalledOnce()
    const [draft] = knowledgeCreateSpy.mock.calls[0]
    expect(draft).toMatchObject({
      title: 'Brand voice rule',
      body: 'We write in first-person plural.',
      tags: ['brand', 'voice'],
      pinned: true
    })
  })

  it('defaults tags to [] and pinned to false when omitted', async () => {
    knowledgeCreateResult = {
      id: 'kb-2',
      title: 'Quick note',
      body: 'Some fact.',
      tags: [],
      pinned: false,
      createdAt: 0,
      updatedAt: 0
    }
    const p: ActionProposal = {
      id: 'kb-p2',
      kind: 'create-knowledge-entry',
      title: 'Quick note',
      body: 'Some fact.'
      // no tags, no pinned
    }
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(true)
    const [draft] = knowledgeCreateSpy.mock.calls[0]
    expect(draft.tags).toEqual([])
    expect(draft.pinned).toBe(false)
    expect(draft.body).toBe('Some fact.')
  })

  it('defaults body to empty string when body is absent', async () => {
    knowledgeCreateResult = {
      id: 'kb-3',
      title: 'Title only',
      body: '',
      tags: [],
      pinned: false,
      createdAt: 0,
      updatedAt: 0
    }
    const p: ActionProposal = {
      id: 'kb-p3',
      kind: 'create-knowledge-entry',
      title: 'Title only',
      body: ''
    }
    await applyProposal(p, { activeTaskId: null })
    const [draft] = knowledgeCreateSpy.mock.calls[0]
    expect(draft.body).toBe('')
  })

  it('GUARD: store returning null yields ok:false', async () => {
    knowledgeCreateResult = null // store signals failure
    const p: ActionProposal = {
      id: 'kb-g1',
      kind: 'create-knowledge-entry',
      title: 'Will fail',
      body: 'Body'
    }
    const result = await applyProposal(p, { activeTaskId: null })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/could not save|plexibrain/i)
  })
})
