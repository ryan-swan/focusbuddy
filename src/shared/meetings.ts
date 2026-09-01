// PlexiMeet: meetings that turn into actions. A meeting is a recorded or
// note-taken conversation with a transcript, an AI summary, and the action items
// it produced. Stored locally (same SQLite as the rest), so your meeting history
// is searchable and the actions become real tasks beside the work.
//
// Live recording-to-transcript uses the existing transcription pipeline and so
// needs a configured transcription key; meetings can also be captured by hand
// (title plus pasted notes) with no key at all. Nothing is fabricated: with no
// meetings the list is honestly empty, never seeded.

export interface Meeting {
  id: string
  title: string
  transcript: string
  summary: string
  // Plain-text action items distilled from the meeting.
  actionItems: string[]
  durationSec: number | null
  createdAt: number
  updatedAt: number
}

export interface MeetingDraft {
  title?: string
  transcript?: string
  summary?: string
  actionItems?: string[]
  durationSec?: number | null
}

export interface MeetingPatch {
  title?: string
  transcript?: string
  summary?: string
  actionItems?: string[]
  durationSec?: number | null
}

// M2 (SPEC-003 S3-DEC-021) — one attributed, timestamped span of speech.
// speakerAccountId is null only when attribution was genuinely unavailable
// (legacy mixed-blob transcriptions); per-track capture makes it exact for
// native meetings. confidence is the ENGINE's own belief (cloud logprobs),
// or null where the engine exposes none (local) — never fabricated.
export interface TranscriptSegment {
  id: string
  meetingId: string
  speakerAccountId: string | null
  speakerName: string
  startMs: number
  endMs: number
  text: string
  confidence: number | null
}

export interface TranscriptSegmentDraft {
  speakerAccountId: string | null
  speakerName: string
  startMs: number
  endMs: number
  text: string
  confidence: number | null
}
