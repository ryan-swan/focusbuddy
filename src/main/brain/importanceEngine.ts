// The importance-derivation DRIVER (plexi-brain P1 — DEC-014). Gathers each node's
// raw signals (degree from brain_edges, liveness from updated_at, history from
// brain_change_log) and writes the derived importance via setDerivedImportance.
// Runs AFTER projection (increment 2) each index pass — degree is the top signal, so
// the edges must exist before importance is derived.
//
// The formula is the pure src/shared/importance.ts; this driver is the only
// DB-touching part. Local + formula-only (no AI) — importance feeds the render/zoom
// path, so it must stay off the network (I1).
//
// ⚠ DEC-014: this driver reads STRUCTURE (edges, type, timestamps, change-log) —
// never a manual importance column, never a domain label. The `nodes.importance`
// 3-axis field the base app carries is DELIBERATELY ignored (the real corpus has it
// untuned at the default 3, the prototype's Job-1 finding); importance is DERIVED.

import { listBrainNodes, setDerivedImportance } from '../db/brainNodes'
import { nodeDegree } from '../db/brainEdges'
import { getDb } from '../db/database'
import { getActiveOrgId } from '../db/activeOrg'
import { deriveImportance, type ImportanceContext, type ImportanceSignals } from '@shared/importance'

export interface ImportanceResult {
  nodesScored: number
  maxDegree: number
  // A tiny legibility sample: the top few derived-important nodes (the P4 pillars
  // preview) — proves the derivation produces a sensible ranking, not noise.
  topByImportance: Array<{ id: string; type: string; title: string; importance: number }>
}

// Change-log counts per node for the active org, in one query (cheaper than N).
function changeCounts(): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT cl.node_id AS id, COUNT(*) AS n
       FROM brain_change_log cl
       JOIN brain_nodes n ON n.id = cl.node_id
       WHERE n.org_id = ?
       GROUP BY cl.node_id`
    )
    .all(getActiveOrgId()) as Array<{ id: string; n: number }>
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.id, r.n)
  return m
}

// Derive + persist importance for every node in the active org. Two passes: gather
// all signals (to compute the corpus-wide maxima the normalization needs), then
// write each node's score. Idempotent — re-running with an unchanged graph writes the
// same scores (setDerivedImportance skips a no-op change, so no spurious change-log).
export function deriveAllImportance(): ImportanceResult {
  const nodes = listBrainNodes()
  if (nodes.length === 0) {
    return { nodesScored: 0, maxDegree: 0, topByImportance: [] }
  }
  const changes = changeCounts()

  // Pass 1 — gather signals + corpus maxima.
  const signals = new Map<string, ImportanceSignals>()
  let maxDegree = 0
  let maxChange = 0
  for (const n of nodes) {
    const deg = nodeDegree(n.id)
    const changeCount = changes.get(n.id) ?? 0
    signals.set(n.id, {
      type: n.type,
      degreeIn: deg.in,
      degreeOut: deg.out,
      updatedAt: n.updatedAt,
      changeCount
    })
    maxDegree = Math.max(maxDegree, deg.in + deg.out)
    maxChange = Math.max(maxChange, changeCount)
  }
  const ctx: ImportanceContext = { maxDegree, maxChange, now: Date.now() }

  // Pass 2 — derive + persist. setDerivedImportance logs only real changes.
  for (const n of nodes) {
    const sig = signals.get(n.id)!
    setDerivedImportance(n.id, deriveImportance(sig, ctx))
  }

  // Legibility sample: the current top-5 by derived importance (the pillars preview).
  const top = listBrainNodes()
    .slice()
    .sort((a, b) => b.importanceDerived - a.importanceDerived)
    .slice(0, 5)
    .map((n) => ({ id: n.id, type: n.type, title: n.title, importance: Number(n.importanceDerived.toFixed(3)) }))

  return { nodesScored: nodes.length, maxDegree, topByImportance: top }
}
