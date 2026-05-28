import type { FbNode } from '@shared/types'

// Dashboard scope — drives which tasks / sessions / activity show up.
//   global   → everything across every project
//   project  → only this project's subtree (descendant projects + tasks)

export type DashboardScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string }

// Walk a project subtree and return every descendant task ID.
// Includes the root project's direct tasks AND tasks under nested sub-projects.
export function descendantTaskIds(nodes: FbNode[], projectId: string): string[] {
  const byParent = new Map<string | null, FbNode[]>()
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  const out: string[] = []
  const walk = (id: string): void => {
    const children = byParent.get(id) ?? []
    for (const c of children) {
      if (c.kind === 'task') out.push(c.id)
      else walk(c.id) // sub-project — recurse
    }
  }
  walk(projectId)
  return out
}

// Inverse — given a scope and the full node list, return the set of task IDs in scope.
export function taskIdsInScope(nodes: FbNode[], scope: DashboardScope): Set<string> {
  if (scope.kind === 'global') {
    return new Set(nodes.filter((n) => n.kind === 'task').map((n) => n.id))
  }
  return new Set(descendantTaskIds(nodes, scope.projectId))
}

// Helper for the "today" filter on task lists
export function isToday(ms: number | null | undefined): boolean {
  if (!ms) return false
  const d = new Date(ms)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function isOverdue(ms: number | null | undefined): boolean {
  if (!ms) return false
  return ms < Date.now() - 1000 * 60 * 60 * 24 // strictly before yesterday end-of-day
}

// Return the chain of project titles from root → this node's parent.
// E.g. task in Client A › Q3 plans → ["Client A", "Q3 plans"]. Empty array for top-level.
export function projectPath(nodes: FbNode[], nodeId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const path: string[] = []
  let cur = byId.get(nodeId)?.parentId ?? null
  while (cur) {
    const parent = byId.get(cur)
    if (!parent) break
    path.unshift(parent.title)
    cur = parent.parentId
  }
  return path
}

// Two-axis priority model — Urgency × Importance + due-date boost + in-progress momentum.
// Interest was DROPPED as a reward signal (rewarding interesting tasks creates avoidance
// of boring-but-important work — see POSITIONING.md §11.5 for the reframe).
// The DB still stores Interest for forward-compat; UI just doesn't surface it.
export function priorityScore(node: FbNode): number {
  let s = node.priority * 1.2 + node.importance * 1.0
  if (node.dueDate) {
    const daysLeft = (node.dueDate - Date.now()) / 86_400_000
    if (daysLeft < 0) s += 5 // overdue
    else if (daysLeft < 1) s += 3 // today
    else if (daysLeft < 3) s += 1.5
  }
  if (node.status === 'in_progress') s += 1 // continue what's already started
  return s
}
