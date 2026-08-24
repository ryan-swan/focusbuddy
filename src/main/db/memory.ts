import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import { memorySupersedes } from '../ai/memorySupersede'
import type { MemoryItem, MemoryKind } from '@shared/types'

// The self-building memory store (fb_memory). Durable facts / preferences /
// commitments about the user and their work, injected into the assistant's
// context so it stops starting cold. Deduped by a normalised text key so the same
// thing isn't stored twice (re-seeing it just refreshes confidence/recency).
//
// A5 (M4): every read and write is org-scoped (#23 — a fact learned in one
// workspace must NEVER surface in another; a privacy defect, not polish), and
// a new memory supersedes the stale version of the same statement (#25, R23:
// newest wins; the superseded row is archived with a pointer, never deleted).

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
  // A5 (#23): the org this memory belongs to. '' only on pre-A5 legacy rows.
  org_id: string
  // A5 (#25): set when a newer memory replaced this one (active goes 0).
  superseded_by: string | null
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

// Add (or refresh) a memory in the ACTIVE org. On a dedup-key hit (same org),
// updates the existing row (keeps its id, bumps recency and the higher
// confidence) rather than inserting a duplicate. A genuinely new memory then
// archives whichever active memories it supersedes (#25, R23). Returns the
// stored item. Empty text is rejected (returns null).
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
  const org = getActiveOrgId()
  const existing = db
    .prepare('SELECT * FROM fb_memory WHERE dedup_key = ? AND org_id = ?')
    .get(dedup, org) as MemoryRow | undefined
  if (existing) {
    const confidence = Math.max(existing.confidence, input.confidence ?? existing.confidence)
    db.prepare(
      'UPDATE fb_memory SET due = ?, source_ref = ?, confidence = ?, active = 1, updated_at = ? WHERE id = ?'
    ).run(input.due?.trim() ?? existing.due, input.sourceRef ?? existing.source_ref, confidence, now, existing.id)
    return rowToItem(db.prepare('SELECT * FROM fb_memory WHERE id = ?').get(existing.id) as MemoryRow)
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO fb_memory (id, kind, text, subject, due, source, source_ref, confidence, active, dedup_key, created_at, updated_at, org_id)
     VALUES (@id, @kind, @text, @subject, @due, @source, @sourceRef, @confidence, 1, @dedup, @now, @now, @org)`
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
    now,
    org
  })
  // Newest wins (#25): archive the statements this one replaces — same org,
  // same kind, same subject, shared content core. Archived, never deleted:
  // active drops to 0 and superseded_by records the successor.
  const candidates = db
    .prepare(
      `SELECT * FROM fb_memory WHERE org_id = ? AND kind = ? AND active = 1 AND id != ?`
    )
    .all(org, input.kind, id) as MemoryRow[]
  for (const c of candidates) {
    if (memorySupersedes({ kind: input.kind, text, subject }, c)) {
      db.prepare(
        'UPDATE fb_memory SET active = 0, superseded_by = ?, updated_at = ? WHERE id = ?'
      ).run(id, now, c.id)
    }
  }
  return rowToItem(db.prepare('SELECT * FROM fb_memory WHERE id = ?').get(id) as MemoryRow)
}

// Active memories in the ACTIVE org, commitments first (they're
// time-sensitive), then by recency.
export function listMemories(limit = 100): MemoryItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM fb_memory WHERE active = 1 AND org_id = ?
       ORDER BY (kind = 'commitment') DESC, updated_at DESC
       LIMIT ?`
    )
    .all(getActiveOrgId(), limit) as MemoryRow[]
  return rows.map(rowToItem)
}

// The injection listing (#24). The defect: a flat commitments-first LIMIT 12
// meant enough open commitments starved facts and preferences out of the
// prompt entirely. Balanced instead: each kind holds a reserved share
// (commitments 6 / preferences 3 / facts 3 at the default 12), and slots a
// kind cannot fill flow to the others by recency — so twenty commitments no
// longer erase what the user is like.
export function listMemoriesBalanced(limit = 12): MemoryItem[] {
  const all = listMemories(limit * 6)
  const byKind = (k: MemoryKind): MemoryItem[] => all.filter((m) => m.kind === k)
  const commitments = byKind('commitment')
  const preferences = byKind('preference')
  const facts = byKind('fact')
  const quota = {
    commitment: Math.max(1, Math.round(limit * 0.5)),
    preference: Math.max(1, Math.round(limit * 0.25)),
    fact: Math.max(1, Math.round(limit * 0.25))
  }
  const picked: MemoryItem[] = [
    ...commitments.slice(0, quota.commitment),
    ...preferences.slice(0, quota.preference),
    ...facts.slice(0, quota.fact)
  ]
  if (picked.length < limit) {
    const chosen = new Set(picked.map((m) => m.id))
    for (const m of all) {
      if (picked.length >= limit) break
      if (!chosen.has(m.id)) {
        picked.push(m)
        chosen.add(m.id)
      }
    }
  }
  // Stable presentation order: commitments, then preferences, then facts,
  // recency within each — what memoryBlock renders.
  const rank: Record<MemoryKind, number> = { commitment: 0, preference: 1, fact: 2 }
  return picked
    .slice(0, limit)
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.updatedAt - a.updatedAt)
}

// Soft-forget: keeps the audit row but drops it from injection + listings.
// Org-gated like every write — an id from another org changes nothing.
export function forgetMemory(id: string): boolean {
  const r = getDb()
    .prepare('UPDATE fb_memory SET active = 0, updated_at = ? WHERE id = ? AND org_id = ?')
    .run(Date.now(), id, getActiveOrgId())
  return r.changes > 0
}
