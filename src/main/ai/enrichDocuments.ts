// Document enrichment: distil a document into structured metadata using the
// LOCAL model (Ollama), then store it for retrieval + grounding to use. Runs at
// rest and for free, so it can process the whole workspace without spending cloud
// credit. Honest by construction: if the local model is unavailable or returns
// something unparseable, NOTHING is written — a doc simply stays un-enriched and
// the AI falls back to its prior (title + body) behaviour.

import { listDocuments, getDocument } from '../db/documents'
import { extractDocText } from '../workspaceRank'
import { localChat, localModelStatus } from './localModel'
import { setDocMetadata, hasDocMetadata } from '../db/docMetadata'
import {
  ENRICH_SYSTEM,
  buildEnrichPrompt,
  parseEnrichResponse,
  verifyAgainstSource,
  countWords
} from './enrichParse'

// Enrich a single document. Returns why it couldn't when it couldn't, so the UI
// and the backfill stay honest.
export async function enrichDocument(
  docId: string
): Promise<{ ok: boolean; reason?: 'not_found' | 'empty' | 'no_local_model' | 'parse_failed' }> {
  const full = getDocument(docId)
  if (!full) return { ok: false, reason: 'not_found' }
  const title = listDocuments().find((m) => m.id === docId)?.title ?? ''
  const text = extractDocText(full.docType, full.body)
  if (text.trim().length === 0) return { ok: false, reason: 'empty' }
  const raw = await localChat({ system: ENRICH_SYSTEM, prompt: buildEnrichPrompt(title, text), json: true })
  if (!raw) return { ok: false, reason: 'no_local_model' }
  const parsed = parseEnrichResponse(raw)
  if (!parsed) return { ok: false, reason: 'parse_failed' }
  // Ground the header facts: drop any entity/date the model produced that isn't
  // actually in the document, so the grounding header can never assert something
  // the source doesn't contain. Summary (the one allowed generated line) stays.
  const verified = verifyAgainstSource(parsed, text)
  const status = await localModelStatus()
  setDocMetadata({ docId, ...verified, wordCount: countWords(text), model: status.chatModel ?? 'local' })
  return { ok: true }
}

// Backfill enrichment across the document pool. Skips already-enriched docs unless
// forced. Bails honestly up front when no local model is available so it never
// pretends to have processed anything.
export async function enrichAllDocuments(
  force = false
): Promise<{ enriched: number; skipped: number; failed: number; reason?: 'no_local_model' }> {
  const status = await localModelStatus()
  if (!status.available || !status.chatModel) {
    return { enriched: 0, skipped: 0, failed: 0, reason: 'no_local_model' }
  }
  let enriched = 0
  let skipped = 0
  let failed = 0
  for (const m of listDocuments()) {
    if (!force && hasDocMetadata(m.id)) {
      skipped++
      continue
    }
    const r = await enrichDocument(m.id)
    if (r.ok) enriched++
    else failed++
  }
  return { enriched, skipped, failed }
}
