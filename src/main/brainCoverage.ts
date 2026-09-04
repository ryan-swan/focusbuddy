import { getDb } from './db/database'
import { getActiveOrgId } from './db/activeOrg'
import { listDocuments, getDocument } from './db/documents'
import { extractDocText } from './workspaceRank'
import { localAiPassCount } from './db/localAiLedger'

// What the assistant can actually see.
//
// Retrieval degrades silently: an answer grounded in half the workspace looks
// exactly like an answer grounded in all of it. Everything else in this codebase
// refuses to fake a result, and this is the number that was missing - so it is
// measured and shown rather than assumed.
//
// "withText" is the honest denominator. A blank document is not a coverage gap,
// and counting it as one would invent a problem; only documents that actually
// contain extractable text can be indexed, embedded or enriched.

export interface BrainCoverage {
  documents: {
    total: number
    withText: number
    indexed: number
    embedded: number
    enriched: number
    memoryScanned: number
  }
  files: { total: number; indexed: number }
  conversations: { total: number; indexed: number }
  knowledge: { total: number }
}

function countDistinctChunkSources(sourceType: string): number {
  try {
    const row = getDb()
      .prepare(
        'SELECT count(DISTINCT source_id) AS c FROM fb_chunks WHERE source_type = ? AND org_id = ?'
      )
      .get(sourceType, getActiveOrgId()) as { c: number }
    return row.c
  } catch {
    return 0
  }
}

function scalar(sql: string, ...params: unknown[]): number {
  try {
    const row = getDb().prepare(sql).get(...(params as never[])) as { c: number } | undefined
    return row?.c ?? 0
  } catch {
    return 0
  }
}

export function brainCoverage(): BrainCoverage {
  const org = getActiveOrgId()
  const metas = listDocuments()
  let withText = 0
  for (const m of metas) {
    const full = getDocument(m.id)
    if (!full) continue
    if (extractDocText(full.docType, full.body).trim()) withText++
  }
  return {
    documents: {
      total: metas.length,
      withText,
      indexed: countDistinctChunkSources('document'),
      embedded: scalar(
        "SELECT count(*) AS c FROM fb_embeddings WHERE item_type = 'document' AND org_id = ?",
        org
      ),
      enriched: scalar('SELECT count(*) AS c FROM fb_document_metadata'),
      memoryScanned: localAiPassCount('memory')
    },
    files: {
      total: scalar('SELECT count(*) AS c FROM fb_files'),
      indexed: countDistinctChunkSources('file')
    },
    conversations: {
      total: scalar('SELECT count(*) AS c FROM ai_chat_conversations'),
      indexed: countDistinctChunkSources('chat')
    },
    knowledge: { total: scalar('SELECT count(*) AS c FROM fb_knowledge') }
  }
}
