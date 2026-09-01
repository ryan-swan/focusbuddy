// M4 (SPEC-003 P4) — Recall over the transcript corpus.
//
// The meeting record's payoff: every attributed, timestamped segment (M2)
// becomes a searchable corpus. An FTS5 mirror over fb_transcript_segments —
// the same trigger-synced pattern as fb_chunks_fts — keeps SEGMENT identity
// intact where the chunk index would flatten it into paragraphs: a Recall
// answer is a speaker + a timestamp + a door into the Thread, and a passage
// chunk can carry none of those.
//
// Two consumers:
//   - searchSegmentsDb: raw hits for the Meet view's Recall box (pure FTS,
//     no AI — the citation IS the answer).
//   - meetingRecallSources: the meetings pool for retrieveSources, so the
//     assistant grounds on what was actually said, with the attribution
//     baked into the grounding text the model reads.
//
// Written against the same structural ChunkDb interface as chunkIndex so the
// unit suite runs REAL FTS5 MATCH queries through node:sqlite.

import { getDb } from './db/database'
import { getActiveOrgId } from './db/activeOrg'
import { ftsQuery, type ChunkDb } from './chunkIndex'
import type { WorkspaceSource } from './workspaceRank'

export interface SegmentHit {
  segmentId: string
  meetingId: string
  meetingTitle: string
  speakerAccountId: string | null
  speakerName: string
  startMs: number
  endMs: number
  text: string
  /** BM25 rank — lower is better. */
  rank: number
}

// ── Schema ─────────────────────────────────────────────────────────────────

export function ensureSegmentFts(db: ChunkDb): void {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fb_segments_fts USING fts5(
      segment_id UNINDEXED, meeting_id UNINDEXED, text
    )`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS fb_segments_fts_ai AFTER INSERT ON fb_transcript_segments BEGIN
      INSERT INTO fb_segments_fts(segment_id, meeting_id, text)
        VALUES (new.id, new.meeting_id, new.text);
    END`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS fb_segments_fts_ad AFTER DELETE ON fb_transcript_segments BEGIN
      DELETE FROM fb_segments_fts WHERE segment_id = old.id;
    END`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS fb_segments_fts_au AFTER UPDATE ON fb_transcript_segments BEGIN
      DELETE FROM fb_segments_fts WHERE segment_id = old.id;
      INSERT INTO fb_segments_fts(segment_id, meeting_id, text)
        VALUES (new.id, new.meeting_id, new.text);
    END`)
  // Backfill: segments written before this build predate the triggers. Runs
  // once per missing row; a fully-mirrored table is a no-op SELECT.
  db.exec(`INSERT INTO fb_segments_fts(segment_id, meeting_id, text)
      SELECT s.id, s.meeting_id, s.text FROM fb_transcript_segments s
      WHERE NOT EXISTS (SELECT 1 FROM fb_segments_fts f WHERE f.segment_id = s.id)`)
}

// ── Search ─────────────────────────────────────────────────────────────────

// Segment-level search across every meeting. Reuses ftsQuery (prefix
// variants, OR semantics) so Recall and the workspace index speak the same
// query language. perMeeting caps how many lines one meeting can claim so a
// long meeting cannot monopolise the hit list.
export function searchSegmentsDb(
  db: ChunkDb,
  query: string,
  opts: { limit?: number; perMeeting?: number; orgId?: string } = {}
): SegmentHit[] {
  ensureSegmentFts(db)
  const match = ftsQuery(query)
  if (!match) return []
  const limit = opts.limit ?? 12
  const perMeeting = opts.perMeeting ?? 4
  // INNER JOIN on meetings: an orphaned segment (its meeting deleted out from
  // under it) is not a citable answer. Org scope matches the meetings store —
  // Recall never reads across organisations (ACL rides the meeting row today;
  // per-node ACL arrives with sharing).
  const rows = db
    .prepare(
      `SELECT s.id AS segmentId, s.meeting_id AS meetingId,
              m.title AS meetingTitle,
              s.speaker_account_id AS speakerAccountId, s.speaker_name AS speakerName,
              s.start_ms AS startMs, s.end_ms AS endMs, s.text AS text,
              bm25(fb_segments_fts) AS rank
       FROM fb_segments_fts f
       JOIN fb_transcript_segments s ON s.id = f.segment_id
       JOIN fb_meetings m ON m.id = s.meeting_id${opts.orgId ? ' AND m.org_id = ?' : ''}
       WHERE fb_segments_fts MATCH ?
       ORDER BY rank LIMIT 120`
    )
    .all(...(opts.orgId ? [opts.orgId, match] : [match])) as SegmentHit[]
  const perM = new Map<string, number>()
  const out: SegmentHit[] = []
  for (const r of rows) {
    const n = perM.get(r.meetingId) ?? 0
    if (n >= perMeeting) continue
    perM.set(r.meetingId, n + 1)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

function fmtMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** One hit as the attributed line the UI and the grounding both quote. */
export function attributedLine(h: {
  startMs: number
  speakerName: string
  text: string
}): string {
  const who = h.speakerName || 'Unknown'
  return `[${fmtMs(h.startMs)}] ${who}: ${h.text}`
}

// The meetings pool for retrieveSources: hits grouped back to meetings, the
// grounding text = the matched lines WITH their attribution, so the model
// cites who said it and when rather than paraphrasing a bare string.
export function meetingRecallSourcesDb(
  db: ChunkDb,
  query: string,
  limit = 6,
  orgId?: string
): WorkspaceSource[] {
  const hits = searchSegmentsDb(db, query, { limit: limit * 3, perMeeting: 3, orgId })
  const byMeeting = new Map<string, { title: string; lines: string[]; rank: number }>()
  for (const h of hits) {
    let m = byMeeting.get(h.meetingId)
    if (!m) {
      m = { title: h.meetingTitle || 'Meeting', lines: [], rank: h.rank }
      byMeeting.set(h.meetingId, m)
    }
    m.lines.push(attributedLine(h))
  }
  return [...byMeeting.entries()]
    .sort((a, b) => a[1].rank - b[1].rank)
    .slice(0, limit)
    .map(([meetingId, m], i) => ({
      docId: meetingId,
      title: m.title,
      docType: 'meeting',
      snippet: m.lines[0] ?? '',
      text: m.lines.join('\n'),
      score: 1 - i * 0.01
    }))
}

// ── App-facing wrappers (real getDb) ───────────────────────────────────────

function appDb(): ChunkDb {
  return getDb() as unknown as ChunkDb
}

// All three degrade honestly, the chunkIndexActive precedent: a corpus that
// cannot be reached grounds nothing — it never throws through an ask.

export function ensureSegmentRecall(): void {
  try {
    ensureSegmentFts(appDb())
  } catch {
    /* searches guard themselves; registration must not brick on FTS */
  }
}

export function searchMeetingSegments(query: string, limit = 12): SegmentHit[] {
  try {
    return searchSegmentsDb(appDb(), query, { limit, orgId: getActiveOrgId() })
  } catch {
    return []
  }
}

export function meetingRecallSources(query: string, limit = 6): WorkspaceSource[] {
  try {
    return meetingRecallSourcesDb(appDb(), query, limit, getActiveOrgId())
  } catch {
    return []
  }
}
