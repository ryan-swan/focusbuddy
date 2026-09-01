import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import { deleteAudioFor } from '../meetingAudio'
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
  record_json: string | null
  desk_node_id: string | null
  created_at: number
  updated_at: number
}

function parseRecord(raw: string | null): Meeting['record'] {
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as Meeting['record']
    return r && Array.isArray(r.spans) ? r : null
  } catch {
    return null
  }
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
    record: parseRecord(row.record_json),
    deskNodeId: row.desk_node_id ?? null,
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
    record:
      patch.record !== undefined
        ? patch.record
          ? JSON.stringify(patch.record)
          : null
        : existing.record
          ? JSON.stringify(existing.record)
          : null,
    desk_node: patch.deskNodeId !== undefined ? patch.deskNodeId : existing.deskNodeId,
    updated_at: Date.now(),
    id
  }
  db.prepare(
    `UPDATE fb_meetings SET title = @title, transcript = @transcript, summary = @summary,
       action_items_json = @items, duration_sec = @duration, record_json = @record,
       desk_node_id = @desk_node, updated_at = @updated_at WHERE id = @id`
  ).run(next)
  return getMeeting(id)
}

export function deleteMeeting(id: string): boolean {
  // M2 — a meeting's segments die with it (no FK cascade in this schema;
  // the delete is explicit so a removed meeting never leaves orphaned
  // attributed speech lying in the store).
  getDb().prepare('DELETE FROM fb_transcript_segments WHERE meeting_id = ?').run(id)
  // M2c — and its audio takes go with it (CR-13's own cascade).
  deleteAudioFor(id)
  const db = getDb()
  const r = db.prepare('DELETE FROM fb_meetings WHERE id = ?').run(id)
  return r.changes > 0
}
