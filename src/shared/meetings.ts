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
  /** M2b — the Record: one object, three renderings (SPEC-003 §3.4). Null
   *  until an Enhance pass has run for this meeting. */
  record: MeetingRecord | null
  createdAt: number
  updatedAt: number
}

// M2b (SPEC-003 §2.3, S3-DEC-021) — the Record's provenance model. Three
// tiers, and the middle one is the rule that makes the model honest:
//   yours    — the user typed it. Verbatim, never rewritten, ever.
//   heard    — carries a resolvable transcript anchor (segmentId). A heard
//              span whose anchor does not resolve is DOWNGRADED to inferred
//              automatically — the tier can never be asserted, only proven.
//   inferred — the model's synthesis. Contestable, and rendered as such.
export type RecordTier = 'yours' | 'heard' | 'inferred'

export interface RecordSpan {
  tier: RecordTier
  text: string
  /** heard only — the segment this claim is drawn from. */
  segmentId: string | null
  /** heard only — the anchor's clock position, for the hover timestamp. */
  startMs: number | null
  /** Brief section heading this span renders under (template-driven). */
  section: string | null
}

export interface MeetingRecord {
  spans: RecordSpan[]
  generatedAt: number
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
  record?: MeetingRecord | null
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
