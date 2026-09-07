// M2b (SPEC-003 §2.3 / S3-DEC-021) — the Record's provenance rules, pure.
//
// The one rule that makes the middle tier honest: `heard` can never be
// asserted, only PROVEN. A span the model labels heard must carry a
// segmentId that resolves to a real transcript segment; if it doesn't, the
// span is downgraded to `inferred` — no exceptions, no "probably heard".
// And `yours` spans are never model-produced at all: they are built here,
// from the user's notes, verbatim. Your words are never rewritten. Ever.

import type { RecordSpan, TranscriptSegment } from '@shared/meetings'

/** The user's live notes become `yours` spans — one per non-empty line,
 *  byte-for-byte. ⚑ moment lines are kept too; they are the user's marks. */
export function buildYoursSpans(notes: string): RecordSpan[] {
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ tier: 'yours' as const, text, segmentId: null, startMs: null, section: null }))
}

/** Enforce S3-DEC-021 on whatever the model returned. heard without a
 *  resolvable anchor → inferred (anchor nulled, so a downgraded span can
 *  never smuggle a broken reference). `yours` from a MODEL is a forgery —
 *  downgraded to inferred as well; only buildYoursSpans mints yours. The
 *  anchor's startMs is always taken from the SEGMENT, never trusted from
 *  the model. */
export function validateRecordSpans(
  spans: Array<{ tier?: string; text?: unknown; segmentId?: unknown; section?: unknown }>,
  segments: TranscriptSegment[]
): RecordSpan[] {
  const byId = new Map(segments.map((s) => [s.id, s] as const))
  const out: RecordSpan[] = []
  for (const raw of spans) {
    const text = typeof raw.text === 'string' ? raw.text.trim() : ''
    if (!text) continue
    const section = typeof raw.section === 'string' && raw.section.trim() ? raw.section.trim() : null
    const wantsHeard = raw.tier === 'heard'
    const seg = wantsHeard && typeof raw.segmentId === 'string' ? byId.get(raw.segmentId) : undefined
    if (wantsHeard && seg) {
      out.push({ tier: 'heard', text, segmentId: seg.id, startMs: seg.startMs, section })
    } else {
      // inferred, an unprovable heard, or a model-forged yours: all land here.
      out.push({ tier: 'inferred', text, segmentId: null, startMs: null, section })
    }
  }
  return out
}
