import type { FbNode } from '@shared/types'

// Shared tree helpers used by every surface that renders a hierarchical
// folder/task view (Sidebar, dashboard FoldersCard, AllTasks views, etc.).
// Keeping these in one place means expand semantics, sort order, and the
// flatten algorithm stay consistent across the app — a user's mental model
// of "how the tree works" never depends on which screen they're on.

export interface TreeItem {
  node: FbNode
  children: TreeItem[]
  depth: number
}

export function buildTree(nodes: FbNode[]): TreeItem[] {
  const byParent = new Map<string | null, FbNode[]>()
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  // Stable sort by sortOrder then createdAt — sortOrder is user-set via
  // drag-drop, createdAt is the fallback for nodes that haven't been
  // explicitly ordered yet.
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  }
  const build = (parentId: string | null, depth: number): TreeItem[] =>
    (byParent.get(parentId) ?? []).map((node) => ({
      node,
      depth,
      children: build(node.id, depth + 1)
    }))
  return build(null, 0)
}

// Walk the tree depth-first, including only children of expanded nodes.
// Returns the flat list of currently-visible rows in render order — the
// shape every keyboard-nav handler needs to compute "next" and "previous".
export function flatten(
  items: TreeItem[],
  expanded: Record<string, boolean>
): TreeItem[] {
  const out: TreeItem[] = []
  const walk = (list: TreeItem[]): void => {
    for (const item of list) {
      out.push(item)
      if (expanded[item.node.id]) walk(item.children)
    }
  }
  walk(items)
  return out
}

// Returns true if `candidateId` is `ancestorId` itself or any descendant —
// used to reject drag-drops that would create a cycle (e.g. dropping a
// folder into its own grandchild).
export function isDescendantOrSelf(
  candidateId: string,
  ancestorId: string,
  nodes: FbNode[]
): boolean {
  if (candidateId === ancestorId) return true
  const childrenOf = new Map<string | null, string[]>()
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) ?? []
    list.push(n.id)
    childrenOf.set(n.parentId, list)
  }
  const stack = [ancestorId]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined) break
    const kids = childrenOf.get(id) ?? []
    for (const kid of kids) {
      if (kid === candidateId) return true
      stack.push(kid)
    }
  }
  return false
}
