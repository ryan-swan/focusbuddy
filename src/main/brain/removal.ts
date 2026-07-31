// THE REMOVAL DRIVER (plexi-brain I0b — the delete path). The single place a source
// leaves the brain. Every route into it — a user trashing a widget, a desk delete
// cascading, a hard purge caught by the reconcile pass — lands on `removeSources`, so
// there is exactly one definition of "gone" and no route can implement its own partial
// version of it.
//
// ── What "gone" means, in order ──────────────────────────────────────────────────
//   1. chunks + their embeddings   (deleteChunksForSource — the retrievable copy)
//   2. dangling provenance leaves  (edges naming a source-record that no longer exists)
//   3. the projected node          (a 1:1 shadow of the deleted row; cascades its edges)
//   4. ungrounded entity GC        (a person nothing in the workspace names any more)
//
// Chunks go first and unconditionally: they are the retrievable copy, so if any later
// step throws, the content is already unfindable. The graph steps are best-effort and
// isolated for the same reason the indexer isolates its graph passes — a graph hiccup
// must never leave content retrievable.
//
// ── DEC-012 ─────────────────────────────────────────────────────────────────────
// `removeSources` is the unconditional primitive; the indexer calls it because
// buildIndex is already brain-path-only. Every BASE-APP delete route calls
// `onSourcesRemoved` instead, which is gated on isBrainEnabled() — brain OFF must be
// byte-identical to brain-absent, and a brain-absent app has no delete path to run.
// (Locked by tests/e2e/brainDeletePath.spec.ts LOCK 6.)
//
// ── The tombstone ───────────────────────────────────────────────────────────────
// `RemovedSource` IS the removal event of the Connector contract (spec §5): the same
// (sourceType, sourceId) identity a connector emits for a write, carrying the reason.
// Removals propagate exactly like writes because they are the same shape.

import { deleteChunksForSource, countChunksForSource } from '../db/chunks'
import {
  deleteBrainNodeBySource,
  deleteBrainNode,
  listOrphanedEntityNodeIds
} from '../db/brainNodes'
import { deleteEdgeLeavesForSource } from '../db/brainEdges'
import { listWidgetsByTask } from '../db/widgets'
import { isBrainEnabled } from '../brainPref'
import { SOURCE_TYPE_TO_TABLE } from './spine'
import type { SourceRef } from '@shared/indexReconcile'

/** Why a source left the index. Both are user-initiated; they differ only in whether
 *  the brain heard about it at the time. */
export type RemovalReason =
  /** The app told us at delete time (widget/doc/task trashed or purged). */
  | 'deleted'
  /** The scan found it missing after the fact — a removal that happened with the brain
   *  off, or the 7-day hard purge, which notifies nobody. */
  | 'reconciled'

/** ONE removal event. This is the Connector contract's tombstone payload (spec §5). */
export interface RemovedSource extends SourceRef {
  readonly reason: RemovalReason
}

export interface RemovalResult {
  sourcesRemoved: number
  chunksRemoved: number
  /** Dangling provenance/leaf edges dropped. */
  edgeLeavesRemoved: number
  /** Projected nodes dropped (1:1 shadows of deleted rows). */
  nodesRemoved: number
  /** Entity nodes (person/org) that lost their last grounding. */
  entitiesRemoved: number
  /** The tombstones, in the order they were applied. */
  removed: RemovedSource[]
}

function emptyResult(): RemovalResult {
  return {
    sourcesRemoved: 0,
    chunksRemoved: 0,
    edgeLeavesRemoved: 0,
    nodesRemoved: 0,
    entitiesRemoved: 0,
    removed: []
  }
}

// The table the PROJECTOR stores a node under, per chunk source_type.
//
// SOURCE_TYPE_TO_TABLE (spine.ts) carries knowledge/document/task but deliberately has
// no 'widget' entry, so the mapping is completed locally. It must stay local: adding
// 'widget' to SOURCE_TYPE_TO_TABLE would make resolveSpine() start resolving widget
// candidates to projected nodes, which changes RETRIEVAL RANKING — a behaviour change
// that has no business riding inside a delete-path fix. Logged for the next revision.
const PROJECTION_TABLE: Record<string, string> = { ...SOURCE_TYPE_TO_TABLE, widget: 'widgets' }

// Every `dst_source_table` spelling a leaf edge may have used for this source type.
//
// There are TWO writers of provenance and they disagree on the widget spelling: the
// projector writes `widgets` (src/shared/projection.ts), while entityExtract falls back
// to the raw source_type whenever SOURCE_TYPE_TO_TABLE has no entry — and it has none
// for 'widget' — so entity provenance for a widget is written as `widget`. Clearing
// only one spelling would leave half the edges dangling, so the delete path clears
// every spelling that could name this source.
function leafTablesFor(sourceType: string): string[] {
  return [...new Set([PROJECTION_TABLE[sourceType], sourceType].filter(Boolean))]
}

/**
 * Remove sources from the brain. UNCONDITIONAL — callers on a base-app path must use
 * `onSourcesRemoved` so the DEC-012 gate is applied.
 *
 * Idempotent: removing an already-removed source is a no-op that reports zero, so a
 * delete the immediate path already handled costs the reconcile pass nothing.
 */
export function removeSources(refs: readonly RemovedSource[]): RemovalResult {
  const result = emptyResult()
  if (refs.length === 0) return result

  for (const ref of refs) {
    // 1. THE RETRIEVABLE COPY. First and unconditional: after this the content cannot
    //    be surfaced, whatever happens to the graph below.
    const chunks = countChunksForSource(ref.sourceType, ref.sourceId)
    deleteChunksForSource(ref.sourceType, ref.sourceId)
    result.chunksRemoved += chunks
    result.sourcesRemoved++
    result.removed.push(ref)

    // 2-3. THE GRAPH. Isolated per source: a graph hiccup must never abort the loop and
    //      leave a LATER source's chunks retrievable.
    try {
      for (const table of leafTablesFor(ref.sourceType)) {
        result.edgeLeavesRemoved += deleteEdgeLeavesForSource(table, ref.sourceId)
      }
      const projected = PROJECTION_TABLE[ref.sourceType]
      if (projected && deleteBrainNodeBySource(projected, ref.sourceId)) result.nodesRemoved++
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[removal] graph cleanup failed for ${ref.sourceType}:${ref.sourceId}`, err)
    }
  }

  // 4. ORPHANED-ENTITY GC — once, after every edge above is gone, so an entity named by
  //    two removed sources is evaluated on its FINAL state rather than mid-loop. Only
  //    fully-disconnected inferred entities go; a capture-minted person keeps her
  //    `involves` edge to a live task and is left alone (see listOrphanedEntityNodeIds).
  try {
    for (const id of listOrphanedEntityNodeIds()) {
      if (deleteBrainNode(id)) result.entitiesRemoved++
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[removal] orphaned-entity GC failed', err)
  }

  return result
}

/**
 * The base-app entry point: remove sources the user just deleted, IF the brain is on.
 *
 * Called from the delete IPC handlers so a removal is instant rather than waiting for
 * the next index — which matters because today the index only runs when a human clicks
 * Settings (defect D10). Without this, "delete" would mean "delete, eventually, if
 * someone remembers to reindex".
 *
 * Returns null when the brain is off (nothing was touched).
 */
export function onSourcesRemoved(refs: readonly SourceRef[]): RemovalResult | null {
  if (!isBrainEnabled()) return null // brain OFF ⇒ the chunk layer is never touched
  return removeSources(refs.map((r) => ({ ...r, reason: 'deleted' as const })))
}

/**
 * The base-app entry point for a NODE delete — a room, desk or task, plus the subtree
 * `deleteNode` cascaded into the trash.
 *
 * A node delete removes more than the node: `deleteNode` trashes the node itself but
 * deliberately leaves its widgets untrashed so restoring the desk brings its canvas
 * back intact. Those widgets are now unreachable everywhere in the app, so they leave
 * the brain with their container. Expanding that here rather than at the IPC boundary
 * keeps "what a delete costs the brain" in one place.
 *
 * `nodeIds` is exactly what `deleteNode()` returns (the whole trashed subtree). Ids that
 * were never indexed cost nothing — removal is idempotent.
 */
export function onNodesRemoved(nodeIds: readonly string[]): RemovalResult | null {
  if (!isBrainEnabled()) return null
  const refs: SourceRef[] = []
  for (const id of nodeIds) {
    // A node is a chunk source only when it is a task; removing a non-task id is a
    // harmless no-op, so we don't re-read the row just to check its kind.
    refs.push({ sourceType: 'task', sourceId: id })
    for (const w of listWidgetsByTask(id)) refs.push({ sourceType: 'widget', sourceId: w.id })
  }
  return onSourcesRemoved(refs)
}
