import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import { deleteEmbedding } from './embeddings'
import { rankKnowledge } from '@shared/knowledge'
import type { KnowledgeEntry, KnowledgeDraft, KnowledgePatch } from '@shared/knowledge'

// ── fb_knowledge (PlexiBrain) ────────────────────────────────────────────────
// CRUD plus a small relevance search used by both the PlexiBrain view and the
// AI grounding path. Mirrors the fb_tables store's shape exactly.

interface KnowledgeRow {
  id: string
  title: string
  body: string
  tags_json: string
  pinned: number
  created_at: number
  updated_at: number
}

function parseTags(raw: string): string[] {
  try {
    const t = JSON.parse(raw)
    return Array.isArray(t) ? (t as string[]) : []
  } catch {
    return []
  }
}

function rowToEntry(row: KnowledgeRow): KnowledgeEntry {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags: parseTags(row.tags_json),
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listKnowledge(): KnowledgeEntry[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM fb_knowledge WHERE org_id = ? ORDER BY pinned DESC, updated_at DESC')
    .all(getActiveOrgId()) as KnowledgeRow[]
  return rows.map(rowToEntry)
}

export function getKnowledge(id: string): KnowledgeEntry | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM fb_knowledge WHERE id = ?').get(id) as KnowledgeRow | undefined
  return row ? rowToEntry(row) : null
}

export function createKnowledge(draft: KnowledgeDraft): KnowledgeEntry {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO fb_knowledge (id, title, body, tags_json, pinned, created_at, updated_at, org_id)
     VALUES (@id, @title, @body, @tags, @pinned, @now, @now, @orgId)`
  ).run({
    id,
    title: draft.title ?? 'Untitled entry',
    body: draft.body ?? '',
    tags: JSON.stringify(draft.tags ?? []),
    pinned: draft.pinned ? 1 : 0,
    orgId: getActiveOrgId(),
    now
  })
  return getKnowledge(id) as KnowledgeEntry
}

// Insert-or-update a brain entry keyed by its workspace source (kind + id), so
// syncing the workspace into the brain is idempotent: re-running refreshes the
// existing entry for that desk/document/widget/file instead of duplicating it.
// Returns whether a new entry was created (vs an existing one updated).
export function upsertKnowledgeBySource(
  sourceKind: string,
  sourceId: string,
  draft: KnowledgeDraft
): { created: boolean } {
  const db = getDb()
  const org = getActiveOrgId()
  const now = Date.now()
  const existing = db
    .prepare('SELECT id FROM fb_knowledge WHERE org_id = ? AND source_kind = ? AND source_id = ?')
    .get(org, sourceKind, sourceId) as { id: string } | undefined
  if (existing) {
    db.prepare(
      `UPDATE fb_knowledge SET title = @title, body = @body, tags_json = @tags, updated_at = @now WHERE id = @id`
    ).run({
      id: existing.id,
      title: draft.title ?? 'Untitled entry',
      body: draft.body ?? '',
      tags: JSON.stringify(draft.tags ?? []),
      now
    })
    return { created: false }
  }
  db.prepare(
    `INSERT INTO fb_knowledge (id, title, body, tags_json, pinned, created_at, updated_at, org_id, source_kind, source_id)
     VALUES (@id, @title, @body, @tags, 0, @now, @now, @org, @sk, @si)`
  ).run({
    id: randomUUID(),
    title: draft.title ?? 'Untitled entry',
    body: draft.body ?? '',
    tags: JSON.stringify(draft.tags ?? []),
    now,
    org,
    sk: sourceKind,
    si: sourceId
  })
  return { created: true }
}

// Whether a brain entry already exists for a workspace source (used to skip
// re-extracting immutable files on every re-sync).
export function hasKnowledgeSource(sourceKind: string, sourceId: string): boolean {
  const db = getDb()
  const row = db
    .prepare('SELECT 1 FROM fb_knowledge WHERE org_id = ? AND source_kind = ? AND source_id = ? LIMIT 1')
    .get(getActiveOrgId(), sourceKind, sourceId)
  return !!row
}

// Remove source-tagged brain entries whose object no longer exists in the
// workspace, so a re-sync is a true sync (add + update + REMOVE). `liveKeys` holds
// "kind:id" for every object still present. Manually-authored entries (no source)
// are never touched. Returns how many were pruned.
export function pruneKnowledgeSources(liveKeys: Set<string>): number {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, source_kind, source_id FROM fb_knowledge WHERE org_id = ? AND source_kind IS NOT NULL'
    )
    .all(getActiveOrgId()) as Array<{ id: string; source_kind: string; source_id: string }>
  let removed = 0
  for (const r of rows) {
    if (!liveKeys.has(`${r.source_kind}:${r.source_id}`)) {
      if (deleteKnowledge(r.id)) removed++
    }
  }
  return removed
}

export function updateKnowledge(id: string, patch: KnowledgePatch): KnowledgeEntry | null {
  const db = getDb()
  const existing = getKnowledge(id)
  if (!existing) return null
  const next = {
    title: patch.title ?? existing.title,
    body: patch.body ?? existing.body,
    tags: JSON.stringify(patch.tags ?? existing.tags),
    pinned: (patch.pinned ?? existing.pinned) ? 1 : 0,
    updated_at: Date.now(),
    id
  }
  db.prepare(
    `UPDATE fb_knowledge SET title = @title, body = @body, tags_json = @tags,
       pinned = @pinned, updated_at = @updated_at WHERE id = @id`
  ).run(next)
  return getKnowledge(id)
}

export function deleteKnowledge(id: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM fb_knowledge WHERE id = ?').run(id)
  // Clean up the semantic vector here too, so deleting an entry by any route
  // never leaves an orphaned embedding that keeps semantic search "active".
  if (r.changes > 0) deleteEmbedding('knowledge', id)
  return r.changes > 0
}

// Lightweight relevance search over title, body and tags. Title and tag matches
// weigh more than body matches; pinned entries get a small boost. Returns real
// entries only, ranked, never invented. An empty query returns the full list in
// its natural (pinned-first) order.
export function searchKnowledge(query: string, limit = 20): KnowledgeEntry[] {
  return rankKnowledge(listKnowledge(), query, limit)
}

// ONE entry, under EXACTLY the filter listKnowledge() applies (org). plexi-brain I2b —
// getKnowledge() below is deliberately un-scoped (it is used on write read-backs), so the
// ingest path cannot reuse it without silently indexing another org's entry.
export function getLiveKnowledge(id: string): KnowledgeEntry | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM fb_knowledge WHERE id = ? AND org_id = ?')
    .get(id, getActiveOrgId()) as KnowledgeRow | undefined
  return row ? rowToEntry(row) : null
}
