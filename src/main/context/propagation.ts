// Dependency propagation (spec §80.2, §51) — the traversal that carries a change
// outward across confirmed Relationships so that "a pricing change lights up the
// proposal that references it" without a human wiring the link. The traversal is
//   - bounded by tenant-configured maximum depth AND maximum fan-out, with any
//     truncation RECORDED and VISIBLE, never silent (PLX-CTX-013 / PLX-CTX-024);
//   - incremental — a BFS from the changed Object only visits its reachable
//     region and never recalculates unaffected regions (PLX-CTX-023);
//   - cycle-safe — the Relationship graph is not acyclic, so a visited-set makes
//     traversal terminate on cyclic paths without re-entry (PLX-CTX-026);
//   - budget-limited — synchronous work is capped at the PLX-PERF-021 budget and
//     the unfinished frontier is handed back for asynchronous continuation
//     (PLX-CTX-025).
// Only CONFIRMED edges are traversed (PLX-UX-022 / PLX-GPH-002); that is the
// caller's HealthGraph contract.

import type { PropagationStep, TruncationRecord } from '../../shared/contextHealth'

export interface PropagationBound {
  maxDepth: number
  maxFanout: number
}

// Tenant-configurable (PLX-CTX-024). These defaults keep synchronous fan-out
// tractable; a tenant may widen or narrow them without code change.
export const DEFAULT_PROPAGATION_BOUND: PropagationBound = { maxDepth: 4, maxFanout: 25 }

// Sync budget (PLX-CTX-025) — the PLX-PERF-021 p99 ceiling. Work beyond it is
// deferred, not dropped.
export const SYNC_PROPAGATION_BUDGET_MS = 500

export interface HealthEdge {
  objectId: string
  relationshipId: string
  strength: number
}

export interface HealthGraph {
  // Confirmed neighbours of an Object, strongest first is not required (we sort).
  neighbours(objectId: string): HealthEdge[]
}

export interface PropagationOptions {
  bound?: PropagationBound
  budgetMs?: number
  now?: () => number // injectable clock; defaults to Date.now (deterministic tests inject their own)
}

export interface PropagationResult {
  origin: string
  affected: PropagationStep[] // reached within bound + budget (excludes origin)
  deferred: string[] // frontier handed to async continuation (PLX-CTX-025)
  truncations: TruncationRecord[] // depth / fan-out truncations (PLX-CTX-013)
  visitedCount: number
  budgetExceeded: boolean
}

export function propagateHealth(origin: string, graph: HealthGraph, opts: PropagationOptions = {}): PropagationResult {
  const bound = opts.bound ?? DEFAULT_PROPAGATION_BOUND
  const budgetMs = opts.budgetMs ?? SYNC_PROPAGATION_BUDGET_MS
  const now = opts.now ?? (() => Date.now())
  const start = now()

  const affected: PropagationStep[] = []
  const truncations: TruncationRecord[] = []
  const deferred: string[] = []
  // Visited set makes traversal cycle-safe: an Object is expanded at most once,
  // so a cyclic path (A DependsOn B, B References A) terminates (PLX-CTX-026).
  const visited = new Set<string>([origin])
  const queue: PropagationStep[] = [{ objectId: origin, depth: 0, viaRelationshipId: null }]
  let budgetExceeded = false

  while (queue.length > 0) {
    // Cap synchronous work; hand the rest of the frontier to async (PLX-CTX-025).
    if (now() - start > budgetMs) {
      budgetExceeded = true
      for (const q of queue) deferred.push(q.objectId)
      break
    }

    const node = queue.shift()!

    // Depth bound: do not expand past the configured maximum. If this node has
    // unvisited neighbours we would have traversed, record the truncation so it
    // is visible in the attention record rather than silently dropped.
    if (node.depth >= bound.maxDepth) {
      const wouldExpand = graph.neighbours(node.objectId).filter((e) => !visited.has(e.objectId))
      if (wouldExpand.length > 0) {
        truncations.push({ reason: 'depth', atObjectId: node.objectId, depth: node.depth, dropped: wouldExpand.length })
      }
      continue
    }

    const neighbours = graph.neighbours(node.objectId).slice().sort((a, b) => b.strength - a.strength)

    // Fan-out bound: traverse the strongest maxFanout edges; record the rest.
    let toTraverse = neighbours
    if (neighbours.length > bound.maxFanout) {
      toTraverse = neighbours.slice(0, bound.maxFanout)
      truncations.push({
        reason: 'fanout',
        atObjectId: node.objectId,
        depth: node.depth,
        dropped: neighbours.length - bound.maxFanout
      })
    }

    for (const edge of toTraverse) {
      if (visited.has(edge.objectId)) continue // cycle / already reached — no re-entry
      visited.add(edge.objectId)
      const step: PropagationStep = { objectId: edge.objectId, depth: node.depth + 1, viaRelationshipId: edge.relationshipId }
      affected.push(step)
      queue.push(step)
    }
  }

  return { origin, affected, deferred, truncations, visitedCount: visited.size, budgetExceeded }
}

// Adapt a RelationshipStore into a HealthGraph. Only confirmed edges surface
// (the store's activeFor already enforces PLX-GPH-002 / PLX-UX-022), so
// propagation never travels a provisional or rejected link.
export function graphFromRelationships(store: {
  activeFor: (entityId: string) => Array<{ id: string; sourceEntityId: string; targetEntityId: string; strength: number }>
}): HealthGraph {
  return {
    neighbours(objectId: string): HealthEdge[] {
      return store.activeFor(objectId).map((r) => ({
        objectId: r.sourceEntityId === objectId ? r.targetEntityId : r.sourceEntityId,
        relationshipId: r.id,
        strength: r.strength
      }))
    }
  }
}
