import type { SqlDb } from '../db/eventStore'

// "Work Completed / What changed" — the workspace-wide, look-back half of the
// assistant catch-up duo (the look-forward half is Resume, src/main/resume). It
// reuses the same append-only `events` log Resume reads, but instead of one desk
// since your last visit, it reports what got DONE across the workspace over a
// window, scoped to you (personal), your org (team), or everything (local).
//
// Deterministic by construction: it only reports events that actually exist in the
// log. An AI layer summarises it later (additive, never inventing completions), and
// the renderer resolves object_id -> a human title. This module stays pure + DB-only
// so it's unit-testable and never fabricates a "done" that didn't happen.

// Whose completions to report. The events log carries `actor` and `organisation_id`,
// so scope is a straight filter — no ownership graph needed.
export type WorkScope =
  | { kind: 'personal'; actor: string } // what I completed
  | { kind: 'team'; organisationId: string } // what the org completed
  | { kind: 'all' } // everything (single-user / local desk)

export type ChangeKind = 'created' | 'completed' | 'updated' | 'deleted' | 'other'

export interface CompletedItem {
  eventId: string
  objectId: string | null
  deskId: string | null
  eventType: string
  // The event's own human summary if it carried one; the renderer prefers a
  // resolved object title and falls back to this.
  summary: string | null
  at: string // recorded_at (ISO)
  rowid: number
}

export interface WorkCompletedDigest {
  scope: WorkScope
  // Incremental cursor model, identical to Resume: this digest covers events with
  // rowid in (fromCursor, toCursor]. Persist toCursor as the next run's fromCursor.
  fromCursor: number
  toCursor: number
  completed: CompletedItem[]
  // Context counts for the same window, so the digest can say "6 done, 3 created,
  // 4 updated" without dumping every non-completion event.
  createdCount: number
  updatedCount: number
  deletedCount: number
  // Deterministic one-liner; the AI summary augments, never replaces it.
  summaryLine: string
}

// Same classification Resume uses, kept local so this module has no cross-dependency
// on the Resume internals (which are per-desk).
export function classifyEvent(eventType: string): ChangeKind {
  const t = (eventType || '').toLowerCase()
  if (t.includes('created')) return 'created'
  if (t.includes('completed')) return 'completed'
  if (t.includes('deleted')) return 'deleted'
  if (t.includes('updated')) return 'updated'
  return 'other'
}

// Low-signal event types that shouldn't count as "changes" in a digest (mirrors
// Resume's LOW_VALUE_EVENT_TYPES). Completions are never dropped.
const LOW_VALUE_EVENT_TYPES = new Set(['ContextHealthChanged', 'MaterialityScored', 'PresenceChanged'])

interface EventRow {
  rowid: number
  id: string
  event_type: string
  desk_id: string | null
  object_id: string | null
  change_summary: string | null
  recorded_at: string
}

// The only DB-touching stage: events beyond the cursor, scoped, oldest-first by the
// global rowid cursor (same ordering guarantee as Resume's collectEvents).
export function collectSince(db: SqlDb, sinceCursor: number, scope: WorkScope): EventRow[] {
  const where: string[] = ['rowid > ?']
  const params: unknown[] = [sinceCursor]
  if (scope.kind === 'personal') {
    where.push('actor = ?')
    params.push(scope.actor)
  } else if (scope.kind === 'team') {
    where.push('organisation_id = ?')
    params.push(scope.organisationId)
  }
  const rows = db
    .prepare(
      `SELECT rowid, id, event_type, desk_id, object_id, change_summary, recorded_at
       FROM events WHERE ${where.join(' AND ')} ORDER BY rowid ASC`
    )
    .all(...params) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    rowid: r.rowid as number,
    id: r.id as string,
    event_type: r.event_type as string,
    desk_id: (r.desk_id as string) ?? null,
    object_id: (r.object_id as string) ?? null,
    change_summary: (r.change_summary as string) ?? null,
    recorded_at: r.recorded_at as string
  }))
}

// Build the digest for events in (sinceCursor, now]. Deterministic: every entry
// maps to a real logged event. `limit` caps the completed list for display; the
// counts still reflect the full window.
export function generateWorkCompleted(
  db: SqlDb,
  input: { sinceCursor: number; scope: WorkScope; limit?: number }
): WorkCompletedDigest {
  const rows = collectSince(db, input.sinceCursor, input.scope)
  let toCursor = input.sinceCursor
  const completed: CompletedItem[] = []
  let createdCount = 0
  let updatedCount = 0
  let deletedCount = 0

  for (const r of rows) {
    if (r.rowid > toCursor) toCursor = r.rowid
    if (LOW_VALUE_EVENT_TYPES.has(r.event_type)) continue
    const kind = classifyEvent(r.event_type)
    if (kind === 'completed') {
      completed.push({
        eventId: r.id,
        objectId: r.object_id,
        deskId: r.desk_id,
        eventType: r.event_type,
        summary: r.change_summary,
        at: r.recorded_at,
        rowid: r.rowid
      })
    } else if (kind === 'created') createdCount++
    else if (kind === 'updated') updatedCount++
    else if (kind === 'deleted') deletedCount++
  }

  // Newest-completed first for display; cap to `limit` if given (counts unaffected).
  completed.sort((a, b) => b.rowid - a.rowid)
  const shown = input.limit != null ? completed.slice(0, input.limit) : completed

  return {
    scope: input.scope,
    fromCursor: input.sinceCursor,
    toCursor,
    completed: shown,
    createdCount,
    updatedCount,
    deletedCount,
    summaryLine: buildSummaryLine(completed.length, createdCount, updatedCount, deletedCount)
  }
}

function buildSummaryLine(done: number, created: number, updated: number, deleted: number): string {
  if (done === 0 && created === 0 && updated === 0 && deleted === 0) {
    return 'Nothing new since the last digest.'
  }
  const parts: string[] = []
  parts.push(`${done} ${done === 1 ? 'task' : 'tasks'} completed`)
  if (created) parts.push(`${created} created`)
  if (updated) parts.push(`${updated} updated`)
  if (deleted) parts.push(`${deleted} removed`)
  return parts.join(', ')
}
