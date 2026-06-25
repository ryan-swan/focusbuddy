import { randomUUID } from 'crypto'
import { getDb } from './database'
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
    .prepare('SELECT * FROM fb_knowledge ORDER BY pinned DESC, updated_at DESC')
    .all() as KnowledgeRow[]
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
    `INSERT INTO fb_knowledge (id, title, body, tags_json, pinned, created_at, updated_at)
     VALUES (@id, @title, @body, @tags, @pinned, @now, @now)`
  ).run({
    id,
    title: draft.title ?? 'Untitled entry',
    body: draft.body ?? '',
    tags: JSON.stringify(draft.tags ?? []),
    pinned: draft.pinned ? 1 : 0,
    now
  })
  return getKnowledge(id) as KnowledgeEntry
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
  return r.changes > 0
}

// Lightweight relevance search over title, body and tags. Title and tag matches
// weigh more than body matches; pinned entries get a small boost. Returns real
// entries only, ranked, never invented. An empty query returns the full list in
// its natural (pinned-first) order.
export function searchKnowledge(query: string, limit = 20): KnowledgeEntry[] {
  return rankKnowledge(listKnowledge(), query, limit)
}
