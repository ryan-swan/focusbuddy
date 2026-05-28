import { create } from 'zustand'
import type { FbNode, NodeDraft, NodePatch } from '@shared/types'
import { recordTrail } from '../lib/trail'
import { taskComplete } from '../lib/audioBeep'
import { hapticSuccess } from '../lib/haptics'

interface NodeStore {
  nodes: FbNode[]
  activeTaskId: string | null
  expanded: Record<string, boolean>
  loading: boolean
  refresh: () => Promise<void>
  create: (draft: NodeDraft) => Promise<FbNode>
  update: (id: string, patch: NodePatch) => Promise<void>
  remove: (id: string) => Promise<void>
  // Atomic reparent + reorder. beforeId=null appends to end of new parent.
  move: (id: string, newParentId: string | null, beforeId: string | null) => Promise<void>
  setActive: (id: string | null) => void
  toggleExpand: (id: string) => void
  expand: (id: string, on: boolean) => void
}

export const useNodeStore = create<NodeStore>((set, get) => ({
  nodes: [],
  activeTaskId: null,
  expanded: {},
  loading: false,
  refresh: async () => {
    set({ loading: true })
    const nodes = await window.api.nodes.list()
    set({ nodes, loading: false })
  },
  create: async (draft) => {
    const node = await window.api.nodes.create(draft)
    set({ nodes: [...get().nodes, node] })
    if (draft.parentId) set({ expanded: { ...get().expanded, [draft.parentId]: true } })
    return node
  },
  update: async (id, patch) => {
    const prev = get().nodes.find((n) => n.id === id) ?? null
    const updated = await window.api.nodes.update(id, patch)
    if (!updated) return
    set({ nodes: get().nodes.map((n) => (n.id === id ? updated : n)) })
    // Triumphant chime on task completion — fire only on the open→done transition
    if (
      prev &&
      prev.kind === 'task' &&
      prev.status !== 'done' &&
      updated.status === 'done'
    ) {
      taskComplete()
      hapticSuccess()
    }
  },
  remove: async (id) => {
    await window.api.nodes.delete(id)
    set({
      nodes: get().nodes.filter((n) => n.id !== id && !descendantOf(get().nodes, n.id, id)),
      activeTaskId: get().activeTaskId === id ? null : get().activeTaskId
    })
  },
  move: async (id, newParentId, beforeId) => {
    const updated = await window.api.nodes.move(id, newParentId, beforeId)
    if (!updated) return // rejected (cycle or missing) — leave state untouched
    // Refresh from server so sort_order on every sibling is correct in one fetch
    const fresh = await window.api.nodes.list()
    set({ nodes: fresh })
    // Auto-expand the destination parent so the moved node is visible after drop
    if (newParentId) set({ expanded: { ...get().expanded, [newParentId]: true } })
  },
  setActive: (id) => {
    const prev = get().activeTaskId
    if (prev !== id) {
      const fromNode = prev ? get().nodes.find((n) => n.id === prev) : null
      const toNode = id ? get().nodes.find((n) => n.id === id) : null
      recordTrail('task_switched', id, {
        fromTaskId: prev,
        toTaskId: id,
        fromTitle: fromNode?.title ?? null,
        toTitle: toNode?.title ?? null
      })
    }
    set({ activeTaskId: id })
  },
  toggleExpand: (id) =>
    set({ expanded: { ...get().expanded, [id]: !get().expanded[id] } }),
  expand: (id, on) => set({ expanded: { ...get().expanded, [id]: on } })
}))

function descendantOf(nodes: FbNode[], candidate: string, ancestor: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let cur: string | null = candidate
  while (cur) {
    const node = byId.get(cur)
    if (!node || !node.parentId) return false
    if (node.parentId === ancestor) return true
    cur = node.parentId
  }
  return false
}
