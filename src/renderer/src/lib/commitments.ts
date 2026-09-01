// M3 (SPEC-003 §3.6) — commitment validation, pure. The renderer is the
// authority on anchors: a commitment whose segmentId does not resolve keeps
// its content but loses its claim to the moment (anchored: false — rendered
// as the machine's guess). Ownership decides the checkbox: your commitments
// and unowned ones arrive CHECKED; someone else's arrive UNCHECKED with the
// owner carried as a person MENTION — a reference, never a send (the
// SPEC-027 boundary, ruled in C7).

import type { TranscriptSegment } from '@shared/meetings'
import { canonicalIntentClass } from '@shared/workItems'

export interface ValidatedCommitment {
  title: string
  ownerAccountId: string | null
  ownerName: string | null
  dueAt: string | null
  intentClass: string
  anchored: boolean
  segment: { id: string; startMs: number; speakerName: string; text: string } | null
  /** Is this the reader's own commitment (or nobody's)? Drives the default. */
  mine: boolean
  checked: boolean
}

export function validateCommitments(
  raw: Array<{
    title?: unknown
    ownerAccountId?: unknown
    ownerName?: unknown
    dueAt?: unknown
    intentClass?: unknown
    segmentId?: unknown
  }>,
  segments: TranscriptSegment[],
  selfAccountId: string
): ValidatedCommitment[] {
  const byId = new Map(segments.map((s) => [s.id, s] as const))
  const out: ValidatedCommitment[] = []
  for (const r of raw) {
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    if (!title) continue
    const seg = typeof r.segmentId === 'string' ? byId.get(r.segmentId) : undefined
    const ownerAccountId = typeof r.ownerAccountId === 'string' && r.ownerAccountId.trim() ? r.ownerAccountId : null
    const ownerName = typeof r.ownerName === 'string' && r.ownerName.trim() ? r.ownerName.trim() : null
    const dueAt = typeof r.dueAt === 'string' && !Number.isNaN(Date.parse(r.dueAt)) ? r.dueAt : null
    const mine = ownerAccountId === null || ownerAccountId === selfAccountId
    out.push({
      title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
      ownerAccountId,
      ownerName,
      dueAt,
      intentClass: canonicalIntentClass(r.intentClass) ?? 'to_do',
      anchored: !!seg,
      segment: seg ? { id: seg.id, startMs: seg.startMs, speakerName: seg.speakerName, text: seg.text } : null,
      mine,
      // §3.6, ruled: items owned by OTHER people are unchecked by default —
      // assigning work to someone from a transcript without telling them is
      // how this feature becomes hated.
      checked: mine
    })
  }
  return out
}

export const fmtAnchor = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
