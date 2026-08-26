// D2 purge machinery (DEC-021; TRACK-LIFECYCLE L2 step 7). When the operator
// chooses "Delete everything permanently" for a desk, the desk's MEMORY dies
// with it: fb_memory rows referencing the subtree, brain-ingested chunk
// derivations (fb_chunks + extraction ledger) scoped to the subtree's rooms,
// widgets, and node-sourced documents, and context review-point artifacts.
//
// Scope discipline (the adversarial contract this module is tested against):
// ONLY rows provably linked to the given ids are removed — matching is by
// exact id (subject / object_id / room_id / source_id) or by the
// `<type>:<id>` source_ref convention. Everything else stays bit-identical.
// The preserve path never calls this module at all — that IS today's
// behavior, now stated in UI copy.
//
// Every DELETE is table-guarded: a database without one of these tables
// (older profile, test fixture) purges what it has and reports zero for the
// rest — purge must never crash a delete mid-transaction.

export interface PurgeDb {
  prepare(sql: string): {
    run(...args: unknown[]): unknown
    get(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
  }
}

export interface MemoryPurgeSummary {
  memoryRows: number
  chunkRows: number
  ledgerRows: number
  reviewPoints: number
}

function hasTable(d: PurgeDb, name: string): boolean {
  try {
    return !!d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name)
  } catch {
    return false
  }
}

function changes(res: unknown): number {
  return (res as { changes?: number })?.changes ?? 0
}

/**
 * Remove every memory artifact linked to the given subjects. `nodeIds` is the
 * purged subtree (desks/rooms and their descendants); `widgetIds` are the
 * widgets that lived on them (captured BEFORE the node delete cascades them
 * away, or the chunk linkage is unrecoverable).
 */
export function purgeMemoryForSubjects(
  d: PurgeDb,
  subjects: { nodeIds: string[]; widgetIds: string[] }
): MemoryPurgeSummary {
  const out: MemoryPurgeSummary = { memoryRows: 0, chunkRows: 0, ledgerRows: 0, reviewPoints: 0 }
  const nodeIds = [...new Set(subjects.nodeIds)].filter(Boolean)
  const widgetIds = [...new Set(subjects.widgetIds)].filter(Boolean)
  if (!nodeIds.length && !widgetIds.length) return out

  // fb_memory: subject holds a bare id for entity-scoped facts; source_ref
  // holds `<type>:<id>` provenance. Both match by exact id only.
  if (hasTable(d, 'fb_memory')) {
    const del = d.prepare('DELETE FROM fb_memory WHERE subject = ? OR source_ref = ? OR source_ref LIKE ?')
    for (const id of nodeIds) out.memoryRows += changes(del.run(id, id, `%:${id}`))
  }

  // fb_chunks: room-scoped derivations die with their room; widget-sourced
  // chunks die with their widget; chunks whose source IS a purged node
  // (documents living on the desk index under their own ids — those survive
  // unless the document itself is deleted elsewhere; we take only node- and
  // widget-keyed rows, never guessing at document ownership).
  if (hasTable(d, 'fb_chunks')) {
    const byRoom = d.prepare('DELETE FROM fb_chunks WHERE room_id = ?')
    const bySource = d.prepare('DELETE FROM fb_chunks WHERE source_id = ?')
    for (const id of nodeIds) {
      out.chunkRows += changes(byRoom.run(id))
      out.chunkRows += changes(bySource.run(id))
    }
    for (const id of widgetIds) out.chunkRows += changes(bySource.run(id))
  }
  if (hasTable(d, 'fb_chunk_ledger')) {
    const del = d.prepare('DELETE FROM fb_chunk_ledger WHERE source_id = ?')
    for (const id of [...nodeIds, ...widgetIds]) out.ledgerRows += changes(del.run(id))
  }

  // Context artifacts: review points keyed by object id.
  if (hasTable(d, 'context_review_points')) {
    const del = d.prepare('DELETE FROM context_review_points WHERE object_id = ?')
    for (const id of nodeIds) out.reviewPoints += changes(del.run(id))
  }

  return out
}
