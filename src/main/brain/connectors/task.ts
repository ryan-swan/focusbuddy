// Connector #3 — tasks (nodes.kind='task'): title + description. The body of
// collectSources()'s third hardcoded arm, moved behind the Connector contract unchanged.
// Emission is byte-identical to pre-I2 (the commit-1 gate).
//
// listNodes() is already trashed-filtered and org-scoped, so a trashed task simply is not
// here — the container-liveness that the delete path (I0b) depends on. A task's parent
// folder IS its room, so `roomId: n.parentId` is the aperture stamp (already correct
// pre-I2; only documents were NULL-room — see the document connector / F-11).
//
// Pre-I2 this and the widget connector shared one listNodes() call. Self-contained
// connectors call it independently now — a redundant local read, byte-identical output;
// the graph passes already re-scan the corpus several times (F-12), and collapsing those
// is I2b's efficiency work, not the registry inversion's.
//
// I2b: `collect` and `collectOne` share the single `toDoc` below so the whole-corpus scan
// and the live per-source path cannot describe a task differently. `collectOne` resolves
// liveness through getLiveNode, which applies listNodes()'s exact trashed + org filter.

import { listNodes, getLiveNode } from '../../db/nodes'
import type { FbNode } from '@shared/types'
import type { Connector, SourceDoc } from './types'

// The ONE definition of "what a task looks like as a SourceDoc". Null for a non-task
// node or a task with no text — the same skips `collect` has always applied.
function toDoc(n: FbNode): SourceDoc | null {
  if (n.kind !== 'task') return null
  const text = `${n.title}\n${n.description ?? ''}`.trim()
  if (!text) return null
  return {
    sourceType: 'task',
    sourceId: n.id,
    title: n.title || 'Untitled task',
    text,
    roomId: n.parentId,
    chunkDate: n.updatedAt,
    sourceKind: 'task'
  }
}

export const taskConnector: Connector = {
  id: 'internal:task',
  kind: 'internal',
  sourceType: 'task',
  label: 'Tasks',
  collect(emit) {
    for (const n of listNodes()) {
      const doc = toDoc(n)
      if (doc) emit(doc)
    }
  },
  collectOne(sourceId) {
    const n = getLiveNode(sourceId)
    return n ? toDoc(n) : null
  }
}
