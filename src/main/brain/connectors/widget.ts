// Connector #4 — canvas widgets (widgets): the text-bearing kinds (P2.5, Layer 1).
// Anything the user writes on a sticky / note / markdown / page / living-doc / card is
// semantically indexed. The body of collectSources()'s fourth hardcoded arm, moved behind
// the Connector contract unchanged. Emission is byte-identical to pre-I2 (the commit-1 gate).
//
// ── THE CONTAINER RULE (I0b — load-bearing for the delete path) ─────────────────────
// deleteNode() trashes a desk but deliberately leaves its widgets un-trashed so a restore
// brings the canvas back intact — which means listWidgetsByKind (filtered only on the
// widget's OWN trashed_at) keeps returning the contents of desks the user deleted. The
// user cannot reach a trashed desk anywhere in the app, so the brain must not answer from
// it either: a widget is indexable only while its container node is live. Measured at I0b:
// 31 widgets / 58 chunks sat on 6 trashed desks, fully retrievable. Same liveness test the
// projector applies. widgetText() returns '' for a non-text kind, so the guard skips it —
// never index UI-state / media noise.
//
// ── I2b ─────────────────────────────────────────────────────────────────────────────
// `collect` and `collectOne` share the single `toDoc` below so the whole-corpus scan and
// the live per-source path cannot describe a widget differently. The container rule is
// the part most at risk of divergence, so it lives INSIDE `toDoc` as a required argument:
// a caller cannot build a widget SourceDoc without having resolved its container first.

import { listNodes, getLiveNode, getNode } from '../../db/nodes'
import { listWidgetsByKind, getLiveWidget } from '../../db/widgets'
import { widgetText } from '../../workspaceExtras'
import type { Widget } from '@shared/types'
import type { Connector, SourceDoc } from './types'

// The kinds that DO carry ingestible prose. Grounded in
// 05-ARCHITECTURE/03-CONTENT-EXTRACTION-INVENTORY.md.
const INDEXED_WIDGET_KINDS = ['note', 'sticky', 'markdown', 'page', 'living-doc', 'card'] as const

/** True when this widget kind carries ingestible prose at all. */
function isIndexedKind(kind: string): boolean {
  return (INDEXED_WIDGET_KINDS as readonly string[]).includes(kind)
}

// The ONE definition of "what a widget looks like as a SourceDoc".
//
// `containerLive` is passed in rather than resolved here because the two callers prove it
// differently and both proofs are correct: the whole-corpus scan builds the live-node SET
// once and tests membership (one query for all widgets), while the live path resolves the
// single container by id. Requiring it as an argument makes the container rule impossible
// to forget without a type error.
//
// `resolveRoom` is a thunk, not a value, so the room lookup still happens only AFTER every
// skip has passed — preserving the pre-I2b read pattern exactly (the whole-corpus scan
// must not gain a getNode() call per empty widget).
function toDoc(w: Widget, containerLive: boolean, resolveRoom: () => string | null): SourceDoc | null {
  if (!isIndexedKind(w.kind)) return null
  if (!containerLive) return null // container trashed / gone / other org
  const text = widgetText(w.kind, w.content || '').trim()
  if (!text) return null
  return {
    sourceType: 'widget',
    sourceId: w.id,
    title: w.title || text.slice(0, 60),
    text,
    roomId: resolveRoom(),
    chunkDate: w.updatedAt,
    sourceKind: w.kind,
    // I3 (DEC-022): a 'markdown' widget stores raw markdown SOURCE, so its headings are real
    // section boundaries — the 'markdown' ladder splits on them (falling back to prose when a
    // widget has none, so short/heading-free ones stay byte-identical). The tiptap-derived
    // kinds (page/living-doc/card/note/sticky) are already plain prose text → 'prose'.
    chunkStrategy: w.kind === 'markdown' ? 'markdown' : 'prose'
  }
}

export const widgetConnector: Connector = {
  id: 'internal:widget',
  kind: 'internal',
  sourceType: 'widget',
  label: 'Canvas widgets',
  collect(emit) {
    // The LIVE-container set (any kind), so a widget on a trashed desk is skipped. Same
    // set the pre-I2 collector built once and shared with the task arm.
    const liveNodeIds = new Set(listNodes().map((n) => n.id))
    for (const kind of INDEXED_WIDGET_KINDS) {
      for (const w of listWidgetsByKind(kind)) {
        // desk (task) → its parent folder is the room; null-safe for an orphan widget.
        const doc = toDoc(w, liveNodeIds.has(w.taskId), () => getNode(w.taskId)?.parentId ?? null)
        if (doc) emit(doc)
      }
    }
  },
  collectOne(sourceId) {
    const w = getLiveWidget(sourceId)
    if (!w) return null
    // getLiveNode applies listNodes()'s exact trashed + org filter, so "resolves" here
    // means exactly what "is in liveNodeIds" means in collect() above.
    const desk = getLiveNode(w.taskId)
    return toDoc(w, desk !== null, () => desk?.parentId ?? null)
  }
}
