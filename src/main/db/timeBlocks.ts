import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import type { TimeBlock, TimeBlockDraft, TimeBlockMeeting, TimeBlockPatch } from '@shared/types'

interface TimeBlockRow {
  id: string
  task_id: string | null
  title: string
  start_ms: number
  duration_min: number
  status: TimeBlock['status']
  meeting_json: string | null
  created_at: number
  updated_at: number
}

// The meeting payload is stored as JSON so the block schema stays flat. A
// malformed value resolves to no meeting rather than throwing — a corrupt row
// should never take the whole calendar down.
function parseMeeting(raw: string | null): TimeBlockMeeting | null {
  if (!raw) return null
  try {
    const m = JSON.parse(raw) as TimeBlockMeeting
    if (m && typeof m.roomId === 'string' && Array.isArray(m.invitees)) return m
  } catch {
    /* fall through to null */
  }
  return null
}

function rowToBlock(row: TimeBlockRow): TimeBlock {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    startMs: row.start_ms,
    durationMin: row.duration_min,
    status: row.status,
    meeting: parseMeeting(row.meeting_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// Blocks that OVERLAP the [fromMs, toMs) window — a block counts if it starts
// before the window ends and ends after the window starts, so a long block
// spanning the boundary still shows.
export function listBlocksInRange(fromMs: number, toMs: number): TimeBlock[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM time_blocks
       WHERE org_id = @orgId AND start_ms < @to AND (start_ms + duration_min * 60000) > @from
       ORDER BY start_ms ASC`
    )
    .all({ from: fromMs, to: toMs, orgId: getActiveOrgId() }) as TimeBlockRow[]
  return rows.map(rowToBlock)
}

export function createTimeBlock(draft: TimeBlockDraft): TimeBlock {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  const duration = Math.max(5, Math.round(draft.durationMin))
  db.prepare(
    `INSERT INTO time_blocks (id, task_id, title, start_ms, duration_min, status, meeting_json, created_at, updated_at, org_id)
     VALUES (@id, @taskId, @title, @startMs, @durationMin, 'planned', @meetingJson, @now, @now, @orgId)`
  ).run({
    id,
    taskId: draft.taskId ?? null,
    title: draft.title ?? '',
    startMs: Math.round(draft.startMs),
    durationMin: duration,
    meetingJson: draft.meeting ? JSON.stringify(draft.meeting) : null,
    orgId: getActiveOrgId(),
    now
  })
  const row = db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id) as TimeBlockRow
  return rowToBlock(row)
}

export function updateTimeBlock(id: string, patch: TimeBlockPatch): TimeBlock | null {
  const db = getDb()
  const fields: string[] = []
  const params: Record<string, unknown> = { id, now: Date.now() }
  const cols: Array<[keyof TimeBlockPatch, string, (v: unknown) => unknown]> = [
    ['taskId', 'task_id', (v) => v ?? null],
    ['title', 'title', (v) => v],
    ['startMs', 'start_ms', (v) => Math.round(v as number)],
    ['durationMin', 'duration_min', (v) => Math.max(5, Math.round(v as number))],
    ['status', 'status', (v) => v],
    ['meeting', 'meeting_json', (v) => (v ? JSON.stringify(v) : null)]
  ]
  for (const [key, col, coerce] of cols) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = @${key}`)
      params[key] = coerce(patch[key])
    }
  }
  if (fields.length === 0) {
    const row = db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id) as
      | TimeBlockRow
      | undefined
    return row ? rowToBlock(row) : null
  }
  fields.push('updated_at = @now')
  db.prepare(`UPDATE time_blocks SET ${fields.join(', ')} WHERE id = @id`).run(params)
  const row = db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id) as
    | TimeBlockRow
    | undefined
  return row ? rowToBlock(row) : null
}

export function deleteTimeBlock(id: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM time_blocks WHERE id = ?').run(id)
  return r.changes > 0
}
