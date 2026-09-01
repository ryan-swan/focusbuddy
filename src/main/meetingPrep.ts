// M5 (SPEC-003 P5) — meeting prep + series memory.
//
// A meeting born from a booked calendar block carries series_id (DEC-103's
// sibling column work, stamped at wrap-up), and that identity is what makes
// prep an INDEXED LOOKUP rather than a guess:
//   - the previous instance = latest fb_meetings row in the same series
//   - "carried from last time" = the still-active work_items that instance
//     filed (source_type 'meeting', source_ref = its id) — M3's own output,
//     read back
//   - attendee items = active work_items whose mentions name an invitee
// External-calendar series matching is DEFERRED by plan: a Google/Outlook
// recurrence has no seriesId here, and title-matching would fake a memory
// the store does not have. Manual merge only, later.
//
// Structural ChunkDb interface, the chunkIndex/segmentRecall precedent: the
// unit suite runs these queries against real SQLite via node:sqlite.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDb } from './db/database'
import { getActiveOrgId } from './db/activeOrg'
import type { ChunkDb } from './chunkIndex'
import { ACTIVE_WORK_ITEM_STATES } from '@shared/workItems'
import type { MeetingPrep, CarriedItem, AttendeeItems } from '@shared/meetings'

const ACTIVE_IN = ACTIVE_WORK_ITEM_STATES.map((s) => `'${s}'`).join(', ')

interface PrevRow {
  id: string
  title: string
  created_at: number
}

/** The previous instance of a series, excluding the meeting being wrapped. */
export function prevSeriesMeetingDb(
  db: ChunkDb,
  seriesId: string,
  opts: { excludeMeetingId?: string; orgId?: string } = {}
): { id: string; title: string; createdAt: number } | null {
  const row = db
    .prepare(
      `SELECT id, title, created_at FROM fb_meetings
       WHERE series_id = ?${opts.orgId ? ' AND org_id = ?' : ''}${opts.excludeMeetingId ? ' AND id != ?' : ''}
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(
      ...[seriesId, opts.orgId, opts.excludeMeetingId].filter((v): v is string => v != null)
    ) as PrevRow | undefined
  return row ? { id: row.id, title: row.title, createdAt: row.created_at } : null
}

interface ItemRow {
  id: string
  title: string
  work_item_state: string
  intent_class: string | null
  due_at: number | null
  mentions: string | null
}

function rowToCarried(r: ItemRow): CarriedItem {
  return {
    id: r.id,
    title: r.title,
    state: r.work_item_state,
    intentClass: r.intent_class,
    dueAt: r.due_at
  }
}

/** What the previous instance filed that is STILL open — the crown jewel.
 *  Active states only: a done commitment carried forward would be nagging. */
export function carriedItemsDb(db: ChunkDb, meetingId: string): CarriedItem[] {
  const rows = db
    .prepare(
      `SELECT id, title, work_item_state, intent_class, due_at, mentions FROM nodes
       WHERE kind = 'work_item' AND trashed_at IS NULL
         AND source_type = 'meeting' AND source_ref = ?
         AND work_item_state IN (${ACTIVE_IN})
       ORDER BY due_at IS NULL, due_at ASC, created_at ASC`
    )
    .all(meetingId) as ItemRow[]
  return rows.map(rowToCarried)
}

// One attendee's open items, matched through the mentions column. Matching is
// deliberately humble: an invitee arrives as an email; we match its local
// part (and full address) against the serialized mention names,
// case-insensitively. A miss is a quiet miss — prep suggests, never asserts.
export function attendeeItemsDb(db: ChunkDb, invitees: string[]): AttendeeItems[] {
  const out: AttendeeItems[] = []
  for (const invitee of invitees.slice(0, 12)) {
    const email = invitee.trim().toLowerCase()
    if (!email) continue
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
    const tokens = [email, local].filter((s) => s.length >= 3)
    if (tokens.length === 0) continue
    const rows = db
      .prepare(
        `SELECT id, title, work_item_state, intent_class, due_at, mentions FROM nodes
         WHERE kind = 'work_item' AND trashed_at IS NULL AND mentions IS NOT NULL
           AND work_item_state IN (${ACTIVE_IN})
           AND (${tokens.map(() => 'LOWER(mentions) LIKE ?').join(' OR ')})
         ORDER BY due_at IS NULL, due_at ASC LIMIT 5`
      )
      .all(...tokens.map((tk) => `%${tk}%`)) as ItemRow[]
    if (rows.length > 0) out.push({ invitee, items: rows.map(rowToCarried) })
  }
  return out
}

export function buildMeetingPrepDb(
  db: ChunkDb,
  input: { seriesId?: string | null; excludeMeetingId?: string; invitees?: string[]; agenda?: string | null },
  orgId?: string
): MeetingPrep {
  const prev = input.seriesId
    ? prevSeriesMeetingDb(db, input.seriesId, { excludeMeetingId: input.excludeMeetingId, orgId })
    : null
  return {
    agenda: input.agenda?.trim() || null,
    lastMeeting: prev,
    carried: prev ? carriedItemsDb(db, prev.id) : [],
    attendees: attendeeItemsDb(db, input.invitees ?? [])
  }
}

// ── App-facing wrapper (real getDb; degrades honestly, the recall precedent) ─

export function buildMeetingPrep(input: {
  seriesId?: string | null
  excludeMeetingId?: string
  invitees?: string[]
  agenda?: string | null
}): MeetingPrep {
  try {
    return buildMeetingPrepDb(getDb() as unknown as ChunkDb, input, getActiveOrgId())
  } catch {
    return { agenda: input.agenda?.trim() || null, lastMeeting: null, carried: [], attendees: [] }
  }
}

// ── Q14 — per-series preferences ────────────────────────────────────────────
// One JSON file in userData, the retention-pref precedent. Today it holds a
// single knob: whether the wrap-up mints the host's To Know brief for this
// series (default ON — turning it off silences a series whose briefs are
// noise). Briefs FOR OTHER ATTENDEES stay a named follow-up: they need an
// out-of-room delivery channel (the meetingSignal relay dies with the room,
// and the wrap-up finishes after everyone left).

export interface SeriesPrefs {
  /** Host-side: mint MY To Know brief at wrap-up (DEC-104). Default on. */
  briefs: boolean
  /** Host-side: SEND the brief to the other attendees as a DM after each
   *  meeting of this series (Q14's delivery half). Default OFF — sending is
   *  its own act (the SPEC-027 doctrine); the host turns it on per series. */
  shareBriefs: boolean
  /** Recipient-side: file arriving briefs of this series into Attention.
   *  null = never asked (the first arrival asks); false = leave them as
   *  plain chat messages. Q14's per-series opt-in, held by the RECIPIENT. */
  followBriefs: boolean | null
}

type SeriesPrefsFile = Record<string, Partial<SeriesPrefs>>

function seriesPrefsPath(): string {
  return join(app.getPath('userData'), 'meeting-series-prefs.json')
}

function readSeriesPrefsFile(): SeriesPrefsFile {
  try {
    if (existsSync(seriesPrefsPath())) {
      const parsed = JSON.parse(readFileSync(seriesPrefsPath(), 'utf-8')) as SeriesPrefsFile
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {
    /* corrupted prefs read as defaults; the next write repairs the file */
  }
  return {}
}

export function getSeriesPrefs(seriesId: string): SeriesPrefs {
  const all = readSeriesPrefsFile()
  const p = all[seriesId] ?? {}
  return {
    briefs: p.briefs !== false,
    shareBriefs: p.shareBriefs === true,
    followBriefs: typeof p.followBriefs === 'boolean' ? p.followBriefs : null
  }
}

export function setSeriesPrefs(seriesId: string, patch: Partial<SeriesPrefs>): SeriesPrefs {
  const all = readSeriesPrefsFile()
  all[seriesId] = { ...all[seriesId], ...patch }
  try {
    writeFileSync(seriesPrefsPath(), JSON.stringify(all, null, 2))
  } catch {
    /* a failed write means the default answers next boot — annoying, not fatal */
  }
  return getSeriesPrefs(seriesId)
}
