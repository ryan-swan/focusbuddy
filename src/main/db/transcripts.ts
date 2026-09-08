import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { TranscriptSegment, TranscriptSegmentDraft } from '@shared/meetings'

// ── fb_transcript_segments (M2, SPEC-003) ───────────────────────────────────
// The transcript as data: attributed, timestamped spans. Write-once per
// meeting (a re-run replaces the set atomically — segments are derived from
// the audio takes, not user-edited here; speaker corrections arrive with the
// Thread rendering in M2b and patch individual rows).

interface SegRow {
  id: string
  meeting_id: string
  speaker_account_id: string | null
  speaker_name: string
  start_ms: number
  end_ms: number
  text: string
  confidence: number | null
}

function rowToSegment(r: SegRow): TranscriptSegment {
  return {
    id: r.id,
    meetingId: r.meeting_id,
    speakerAccountId: r.speaker_account_id,
    speakerName: r.speaker_name,
    startMs: r.start_ms,
    endMs: r.end_ms,
    text: r.text,
    confidence: r.confidence
  }
}

/** Replace a meeting's segment set atomically (derived data). */
export function saveTranscriptSegments(
  meetingId: string,
  segments: TranscriptSegmentDraft[]
): TranscriptSegment[] {
  const db = getDb()
  const now = Date.now()
  const del = db.prepare('DELETE FROM fb_transcript_segments WHERE meeting_id = ?')
  const ins = db.prepare(
    `INSERT INTO fb_transcript_segments
       (id, meeting_id, speaker_account_id, speaker_name, start_ms, end_ms, text, confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const run = db.transaction(() => {
    del.run(meetingId)
    for (const s of segments) {
      ins.run(
        randomUUID(),
        meetingId,
        s.speakerAccountId,
        s.speakerName,
        Math.round(s.startMs),
        Math.round(s.endMs),
        s.text,
        s.confidence,
        now
      )
    }
  })
  run()
  return listTranscriptSegments(meetingId)
}

export function listTranscriptSegments(meetingId: string): TranscriptSegment[] {
  const rows = getDb()
    .prepare('SELECT * FROM fb_transcript_segments WHERE meeting_id = ? ORDER BY start_ms ASC')
    .all(meetingId) as SegRow[]
  return rows.map(rowToSegment)
}
