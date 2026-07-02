import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import type { Meeting, MeetingDraft, MeetingPatch } from '@shared/meetings'

// ── fb_meetings (PlexiMeet) ──────────────────────────────────────────────────
// CRUD over recorded / noted meetings. action_items_json is a JSON string array.
// Mirrors the other local stores' shape.

interface MeetingRow {
  id: string
  title: string
  transcript: string
  summary: string
  action_items_json: string
  duration_sec: number | null
  created_at: number
  updated_at: number
}

function parseItems(raw: string): string[] {
  try {
    const a = JSON.parse(raw)
    return Array.isArray(a) ? (a as string[]) : []
  } catch {
    return []
  }
}

function rowToMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    transcript: row.transcript,
    summary: row.summary,
    actionItems: parseItems(row.action_items_json),
    durationSec: row.duration_sec,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listMeetings(): Meeting[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM fb_meetings WHERE org_id = ? ORDER BY created_at DESC').all(getActiveOrgId()) as MeetingRow[]
  return rows.map(rowToMeeting)
}

export function getMeeting(id: string): Meeting | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM fb_meetings WHERE id = ?').get(id) as MeetingRow | undefined
  return row ? rowToMeeting(row) : null
}

export function createMeeting(draft: MeetingDraft): Meeting {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO fb_meetings (id, title, transcript, summary, action_items_json, duration_sec, created_at, updated_at, org_id)
     VALUES (@id, @title, @transcript, @summary, @items, @duration, @now, @now, @orgId)`
  ).run({
    id,
    title: draft.title ?? 'Untitled meeting',
    transcript: draft.transcript ?? '',
    summary: draft.summary ?? '',
    items: JSON.stringify(draft.actionItems ?? []),
    duration: draft.durationSec ?? null,
    now,
    orgId: getActiveOrgId()
  })
  return getMeeting(id) as Meeting
}

export function updateMeeting(id: string, patch: MeetingPatch): Meeting | null {
  const db = getDb()
  const existing = getMeeting(id)
  if (!existing) return null
  const next = {
    title: patch.title ?? existing.title,
    transcript: patch.transcript ?? existing.transcript,
    summary: patch.summary ?? existing.summary,
    items: JSON.stringify(patch.actionItems ?? existing.actionItems),
    duration: patch.durationSec !== undefined ? patch.durationSec : existing.durationSec,
    updated_at: Date.now(),
    id
  }
  db.prepare(
    `UPDATE fb_meetings SET title = @title, transcript = @transcript, summary = @summary,
       action_items_json = @items, duration_sec = @duration, updated_at = @updated_at WHERE id = @id`
  ).run(next)
  return getMeeting(id)
}

export function deleteMeeting(id: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM fb_meetings WHERE id = ?').run(id)
  return r.changes > 0
}
