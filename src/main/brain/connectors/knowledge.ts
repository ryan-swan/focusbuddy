// Connector #1 — knowledge entries (fb_knowledge): curated truth. The body of what was
// collectSources()'s first hardcoded arm (indexer.ts), moved behind the Connector
// contract unchanged. Emission is byte-identical to pre-I2 — the I2 commit-1 gate.
//
// I2b: `collect` and `collectOne` both go through the single builder below, so the
// whole-corpus scan and the live per-source path cannot describe a source differently.

import { listKnowledge, getLiveKnowledge } from '../../db/knowledge'
import type { KnowledgeEntry } from '@shared/knowledge'
import type { Connector, SourceDoc } from './types'

// The ONE definition of "what a knowledge entry looks like as a SourceDoc".
// Returns null for an entry with no text — the same skip `collect` has always applied.
//
// ── M2: MIRROR IMMUNITY ────────────────────────────────────────────────────────────
// ONE OBJECT, ONE PATH INTO THE INDEX.
//
// main/brainIngest.ts syncs the whole workspace — every desk, document, note/page and
// Drive file — into fb_knowledge, firing from three renderer call sites (fileManager,
// CommandCenter's navigate-to-Brain, BrainMapView on open). Measured on the operator's
// live DB the first time the merged app opened the Brain Map: fb_knowledge 5 -> 273 rows
// (180 document + 43 node + 40 widget + 5 file mirrors over 5 hand-authored survivors).
//
// Those rows are MIRRORS of objects that already have their own source table and their
// own connector. Index both and a document enters the corpus twice with different text
// (his path caps bodies at 8,000 chars; ours chunks the full extraction) — two copies of
// one object competing inside a single RRF fusion. fb_knowledge is for CURATED TRUTH
// somebody authored; a copy is not truth.
//
// We do NOT disable his ingest. Editing main's call sites on this branch would conflict
// on every future merge, and would not even work — the operator runs the main-branch app
// against this same database, so those rows appear regardless of what this branch does.
// A skip at OUR door is immune to whatever main writes, with nothing to re-litigate per
// merge.
//
// The rule is PROVENANCE, not a kind allowlist: anything not hand-authored is skipped,
// including object types main's ingest grows later. Locked (red-first, each assertion
// validated by planting the regression it guards) in
// tests/unit/knowledgeMirrorImmunity.test.ts.
//
// Exported so that lock can exercise the predicate directly rather than through the DB.
export function knowledgeEntryToSourceDoc(k: KnowledgeEntry): SourceDoc | null {
  if (k.sourceKind !== null) return null
  const text = `${k.title}\n${k.tags.join(' ')}\n${k.body}`.trim()
  if (!text) return null
  return {
    sourceType: 'knowledge',
    sourceId: k.id,
    title: k.title,
    text,
    roomId: null,
    chunkDate: k.updatedAt,
    sourceKind: 'knowledge'
  }
}

export const knowledgeConnector: Connector = {
  id: 'internal:knowledge',
  kind: 'internal',
  sourceType: 'knowledge',
  label: 'Knowledge entries',
  collect(emit) {
    for (const k of listKnowledge()) {
      const doc = knowledgeEntryToSourceDoc(k)
      if (doc) emit(doc)
    }
  },
  collectOne(sourceId) {
    // getLiveKnowledge applies listKnowledge's org filter; getKnowledge deliberately
    // does not (it serves write read-backs), so it cannot be reused here.
    const k = getLiveKnowledge(sourceId)
    return k ? knowledgeEntryToSourceDoc(k) : null
  }
}
