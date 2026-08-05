import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { MemoryItem, MemoryKind } from '@shared/types'

// The self-building memory store (fb_memory). Durable facts / preferences /
// commitments about the user and their work, injected into the assistant's
// context so it stops starting cold. Deduped by a normalised text key so the same
// thing isn't stored twice (re-seeing it just refreshes confidence/recency).

interface MemoryRow {
  id: string
  kind: MemoryKind
  text: string
  subject: string
  due: string
  source: 'user' | 'extracted'
  source_ref: string
  confidence: number
  active: number
  dedup_key: string
  created_at: number
  updated_at: number
}

function rowToItem(r: MemoryRow): MemoryItem {
  return {
    id: r.id,
    kind: r.kind,
    text: r.text,
    subject: r.subject,
    due: r.due,
    source: r.source,
    sourceRef: r.source_ref,
    confidence: r.confidence,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// Normalised form used to detect "the same memory" — lowercased, punctuation and
// runs of whitespace collapsed, so trivial rewordings don't create duplicates.
export function memoryDedupKey(kind: MemoryKind, text: string, subject: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  return `${kind}:${norm(subject)}:${norm(text)}`
}

// Add (or refresh) a memory. On a dedup-key hit, updates the existing row (keeps
// its id, bumps recency and the higher confidence) rather than inserting a
// duplicate. Returns the stored item. Empty text is rejected (returns null).
export function addMemory(input: {
  kind: MemoryKind
  text: string
  subject?: string
  due?: string
  source?: 'user' | 'extracted'
  sourceRef?: string
  confidence?: number
}): MemoryItem | null {
  const text = input.text.trim()
  if (!text) return null
  const subject = (input.subject ?? '').trim()
  const dedup = memoryDedupKey(input.kind, text, subject)
  const now = Date.now()
  const db = getDb()
  const existing = db.prepare('SELECT * FROM fb_memory WHERE dedup_key = ?').get(dedup) as MemoryRow | undefined
  if (existing) {
    const confidence = Math.max(existing.confidence, input.confidence ?? existing.confidence)
    db.prepare(
      'UPDATE fb_memory SET due = ?, source_ref = ?, confidence = ?, active = 1, updated_at = ? WHERE id = ?'
    ).run(input.due?.trim() ?? existing.due, input.sourceRef ?? existing.source_ref, confidence, now, existing.id)
    return rowToItem(db.prepare('SELECT * FROM fb_memory WHERE id = ?').get(existing.id) as MemoryRow)
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO fb_memory (id, kind, text, subject, due, source, source_ref, confidence, active, dedup_key, created_at, updated_at)
     VALUES (@id, @kind, @text, @subject, @due, @source, @sourceRef, @confidence, 1, @dedup, @now, @now)`
  ).run({
    id,
    kind: input.kind,
    text,
    subject,
    due: input.due?.trim() ?? '',
    source: input.source ?? 'user',
    sourceRef: input.sourceRef ?? '',
    confidence: input.confidence ?? 1,
    dedup,
    now
  })
  return rowToItem(db.prepare('SELECT * FROM fb_memory WHERE id = ?').get(id) as MemoryRow)
}

// Active memories, commitments first (they're time-sensitive), then by recency.
export function listMemories(limit = 100): MemoryItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM fb_memory WHERE active = 1
       ORDER BY (kind = 'commitment') DESC, updated_at DESC
       LIMIT ?`
    )
    .all(limit) as MemoryRow[]
  return rows.map(rowToItem)
}

// Soft-forget: keeps the audit row but drops it from injection + listings.
export function forgetMemory(id: string): boolean {
  const r = getDb().prepare('UPDATE fb_memory SET active = 0, updated_at = ? WHERE id = ?').run(Date.now(), id)
  return r.changes > 0
}
