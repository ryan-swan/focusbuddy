// Connector #1 — knowledge entries (fb_knowledge): curated truth. The body of what was
// collectSources()'s first hardcoded arm (indexer.ts), moved behind the Connector
// contract unchanged. Emission is byte-identical to pre-I2 — the I2 commit-1 gate.
//
// I2b: `collect` and `collectOne` both go through the single `toDoc` below, so the
// whole-corpus scan and the live per-source path cannot describe a source differently.

import { listKnowledge, getLiveKnowledge } from '../../db/knowledge'
import type { KnowledgeEntry } from '@shared/knowledge'
import type { Connector, SourceDoc } from './types'

// The ONE definition of "what a knowledge entry looks like as a SourceDoc".
// Returns null for an entry with no text — the same skip `collect` has always applied.
function toDoc(k: KnowledgeEntry): SourceDoc | null {
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
      const doc = toDoc(k)
      if (doc) emit(doc)
    }
  },
  collectOne(sourceId) {
    // getLiveKnowledge applies listKnowledge's org filter; getKnowledge deliberately
    // does not (it serves write read-backs), so it cannot be reused here.
    const k = getLiveKnowledge(sourceId)
    return k ? toDoc(k) : null
  }
}
