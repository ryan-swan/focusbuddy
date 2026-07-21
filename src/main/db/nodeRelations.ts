import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'

// User-driven desk relatedness. Two desks (nodes) are related only because the
// user linked them, never because they share an org. The brain reads these edges
// to scope what it looks at for a desk. Relations are undirected and stored once
// with the ids ordered, so (a,b) and (b,a) are the same row.

function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export function relateNodes(a: string, b: string): void {
  if (!a || !b || a === b) return
  const [na, nb] = ordered(a, b)
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO fb_node_relations (id, node_a, node_b, org_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(randomUUID(), na, nb, getActiveOrgId(), Date.now())
}

export function unrelateNodes(a: string, b: string): void {
  if (!a || !b) return
  const [na, nb] = ordered(a, b)
  getDb().prepare('DELETE FROM fb_node_relations WHERE node_a = ? AND node_b = ?').run(na, nb)
}

// The ids of every desk the user has explicitly related to this one (org-scoped).
export function listRelatedNodeIds(nodeId: string): string[] {
  if (!nodeId) return []
  const org = getActiveOrgId()
  const rows = getDb()
    .prepare(
      `SELECT node_a, node_b FROM fb_node_relations
       WHERE org_id = ? AND (node_a = ? OR node_b = ?)`
    )
    .all(org, nodeId, nodeId) as Array<{ node_a: string; node_b: string }>
  const out = new Set<string>()
  for (const r of rows) out.add(r.node_a === nodeId ? r.node_b : r.node_a)
  return [...out]
}

// The retrieval scope for a desk: the desk itself plus every desk explicitly
// related to it. This is what the brain reads by default, instead of the whole
// org. An empty/undefined node yields an empty scope so the caller can decide to
// fall back to an org-wide search only when the user asks for it.
export function relatedScopeIds(nodeId: string | null | undefined): string[] {
  if (!nodeId) return []
  return [nodeId, ...listRelatedNodeIds(nodeId)]
}
