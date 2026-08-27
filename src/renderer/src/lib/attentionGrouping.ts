import type { FbNode } from '@shared/types'

// DEC-035 — grouping and manual order inside a queue.
//
// The operator's ask: "if I have 2 tasks created at different times but they
// end up being related there should be that six dot icon thing next to the
// tasks that allow me rearrange tasks, move them to other sections, or even
// attach to already existing tasks for grouped tasks/related task or subtask."
//
// Three gestures, one handle. This module owns the two that are pure:
// ORDER (where a row sits) and GROUPING (which rows travel together). Moving
// between sections is just a reclassify and already exists.
//
// The model is a SIBLING reference (`groupId` → the leading item's id), not
// parent nesting: work items are leaf nodes by architecture, and `parentId`
// already means "the desk this lives on". Exactly one level deep — a leader
// never carries a groupId of its own — so a group can never become a tree and
// the queue can never render an unbounded outline.

export interface GroupedRow {
  item: FbNode
  /** true when this row travels under a leader rather than standing alone. */
  isChild: boolean
  /** For a leader: how many children ride with it (0 when it leads nothing). */
  childCount: number
}

/** Manual order beats the ranker ONLY where the operator has actually placed
 *  something. sortOrder 0 means "never dragged", and those keep their
 *  ranked position; anything explicitly placed sorts by its number. */
const placed = (i: FbNode): boolean => (i.sortOrder ?? 0) > 0

/**
 * Order a queue's items, keeping every group together under its leader.
 *
 * Leaders are ordered among themselves (manual placement first, then the
 * caller's ranking); each leader's children follow it immediately, ordered the
 * same way. A child whose leader is absent from this queue — reclassified out,
 * completed, snoozed — is NOT hidden: it is promoted to a leader of its own,
 * because an item silently vanishing because of something that happened to a
 * different item is the one failure mode grouping must never have.
 */
export function orderWithGroups(
  items: FbNode[],
  rank: (i: FbNode) => number
): GroupedRow[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const leaders: FbNode[] = []
  const children = new Map<string, FbNode[]>()

  for (const i of items) {
    const gid = i.groupId ?? null
    // Self-reference, or a leader that is not here, means "stand alone".
    if (!gid || gid === i.id || !byId.has(gid)) {
      leaders.push(i)
      continue
    }
    children.set(gid, [...(children.get(gid) ?? []), i])
  }

  const cmp = (a: FbNode, b: FbNode): number => {
    const ap = placed(a)
    const bp = placed(b)
    if (ap && bp) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    if (ap !== bp) return ap ? -1 : 1
    return rank(b) - rank(a)
  }

  const out: GroupedRow[] = []
  for (const leader of [...leaders].sort(cmp)) {
    const kids = (children.get(leader.id) ?? []).sort(cmp)
    out.push({ item: leader, isChild: false, childCount: kids.length })
    for (const k of kids) out.push({ item: k, isChild: true, childCount: 0 })
  }
  return out
}

export type DropPosition = 'before' | 'after' | 'into'

/**
 * The writes one drag-and-drop produces — computed, not performed, so the rule
 * is testable and the caller stays a thin applier.
 *
 * 'into' groups the dragged item under the target. 'before'/'after' place it
 * next to the target, inheriting the target's group so a row dropped between
 * two children joins their group rather than silently escaping it.
 *
 * Returns an empty list for a no-op (dropping something on itself), and
 * refuses to group a LEADER under anything — that would nest two groups, which
 * the one-level rule forbids. Re-parenting a leader's children is a
 * bigger gesture than a drag and belongs to an explicit "ungroup" action.
 */
export function planDrop(
  draggedId: string,
  targetId: string,
  position: DropPosition,
  ordered: GroupedRow[]
): Array<{ id: string; groupId?: string | null; sortOrder?: number }> {
  if (draggedId === targetId) return []
  const rows = ordered.map((r) => r.item)
  const dragged = rows.find((i) => i.id === draggedId)
  const target = rows.find((i) => i.id === targetId)
  if (!dragged || !target) return []

  // A leader with children cannot be dropped INTO another group (one level).
  const leads = ordered.find((r) => r.item.id === draggedId)?.childCount ?? 0
  if (position === 'into' && leads > 0) return []
  // …and a group's leader is the only legal 'into' target.
  const targetIsChild = !!(target.groupId && target.groupId !== target.id)
  const groupOf = (i: FbNode): string | null =>
    i.groupId && i.groupId !== i.id ? i.groupId : null

  let nextGroup: string | null
  if (position === 'into') {
    nextGroup = targetIsChild ? groupOf(target) : target.id
  } else {
    nextGroup = groupOf(target)
  }
  if (nextGroup === draggedId) return [] // never group an item under itself

  // Rebuild the visible order with the dragged row moved, then renumber every
  // row from 1. Renumbering the whole queue (rather than nudging one value)
  // is what keeps the order stable and free of ties as items come and go.
  const without = rows.filter((i) => i.id !== draggedId)
  const at = without.findIndex((i) => i.id === targetId)
  const insertAt = position === 'before' ? at : at + 1
  const nextRows = [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)]

  const writes: Array<{ id: string; groupId?: string | null; sortOrder?: number }> = []
  nextRows.forEach((i, idx) => {
    const order = idx + 1
    const isDragged = i.id === draggedId
    const groupChanged = isDragged && (i.groupId ?? null) !== nextGroup
    if ((i.sortOrder ?? 0) !== order || groupChanged) {
      writes.push({
        id: i.id,
        sortOrder: order,
        ...(groupChanged ? { groupId: nextGroup } : {})
      })
    }
  })
  return writes
}

/** Detach an item from its group — the explicit escape from a drag. */
export function planUngroup(id: string): Array<{ id: string; groupId: null }> {
  return [{ id, groupId: null }]
}
