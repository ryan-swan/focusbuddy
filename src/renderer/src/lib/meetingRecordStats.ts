// The Record's numbers and timeline, as pure functions over the attributed
// segments (M2a). Everything the Analytics tab and the timeline show is
// derived here from database facts — no model call, no estimate — so the
// unit suite can vouch for every figure, and an empty transcript yields
// honest zeros rather than a decorated guess.
//
// One deliberate boundary, from SPEC-003's refusals: this reports WHO SPOKE
// and how much as a neutral distribution. It never ranks people, names a
// "longest speaker" as a headline, or scores anyone — talk-time scoring is
// surveillance dressed as insight, and it stays out.

import type { TranscriptSegment } from '@shared/meetings'

/** Speaker colours, in order of first appearance. Accent leads (it is the
 *  house "this is the one" colour); the rest are the chromatic tones the
 *  plexi kit already uses, so a speaker reads the same on every theme. */
export const SPEAKER_PALETTE = [
  'rgb(var(--accent))',
  'rgb(20 184 166)',
  'rgb(217 119 6)',
  'rgb(14 165 233)',
  'rgb(139 92 246)',
  'rgb(225 29 72)'
] as const

export const UNKNOWN_SPEAKER = 'Speaker'

function nameOf(s: Pick<TranscriptSegment, 'speakerName'>): string {
  return s.speakerName?.trim() || UNKNOWN_SPEAKER
}

/** Distinct speakers in order of first appearance. */
export function speakerOrder(segments: ReadonlyArray<Pick<TranscriptSegment, 'speakerName'>>): string[] {
  const out: string[] = []
  for (const s of segments) {
    const n = nameOf(s)
    if (!out.includes(n)) out.push(n)
  }
  return out
}

export function speakerColor(name: string, order: ReadonlyArray<string>): string {
  const i = Math.max(0, order.indexOf(name))
  return SPEAKER_PALETTE[i % SPEAKER_PALETTE.length]
}

export function speakerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Milliseconds each speaker's segments cover, keyed by display name. */
export function spokenMsBySpeaker(
  segments: ReadonlyArray<Pick<TranscriptSegment, 'speakerName' | 'startMs' | 'endMs'>>
): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of segments) {
    const n = nameOf(s)
    m.set(n, (m.get(n) ?? 0) + Math.max(0, s.endMs - s.startMs))
  }
  return m
}

/** How many times the floor changed hands (consecutive segments, different speaker). */
export function speakerChanges(segments: ReadonlyArray<Pick<TranscriptSegment, 'speakerName'>>): number {
  let n = 0
  for (let i = 1; i < segments.length; i++) {
    if (nameOf(segments[i]) !== nameOf(segments[i - 1])) n++
  }
  return n
}

/** Segments that ask something — a question mark is the honest, model-free signal. */
export function questionCount(segments: ReadonlyArray<Pick<TranscriptSegment, 'text'>>): number {
  return segments.filter((s) => s.text.includes('?')).length
}

/** The clock span the transcript covers: the latest segment end. */
export function transcriptSpanMs(segments: ReadonlyArray<Pick<TranscriptSegment, 'endMs'>>): number {
  return segments.reduce((max, s) => Math.max(max, s.endMs), 0)
}

export interface TimelineBand {
  id: string
  speaker: string
  leftPct: number
  widthPct: number
  startMs: number
}

/** Proportional speaker bands for the timeline. A very short segment still
 *  paints a sliver (MIN_PCT) so a one-word interjection is not invisible. */
export function timelineBands(
  segments: ReadonlyArray<Pick<TranscriptSegment, 'id' | 'speakerName' | 'startMs' | 'endMs'>>,
  totalMs: number
): TimelineBand[] {
  if (totalMs <= 0) return []
  const MIN_PCT = 0.4
  return segments.map((s) => ({
    id: s.id,
    speaker: nameOf(s),
    startMs: s.startMs,
    leftPct: Math.min(100, (s.startMs / totalMs) * 100),
    widthPct: Math.max(MIN_PCT, ((s.endMs - s.startMs) / totalMs) * 100)
  }))
}

/** The segment playing at `ms`: the one containing it, else the nearest by start. */
export function segmentAtMs<T extends Pick<TranscriptSegment, 'startMs' | 'endMs'>>(
  segments: ReadonlyArray<T>,
  ms: number
): T | null {
  if (segments.length === 0) return null
  const inside = segments.find((s) => ms >= s.startMs && ms < s.endMs)
  if (inside) return inside
  let best = segments[0]
  for (const s of segments) if (Math.abs(s.startMs - ms) < Math.abs(best.startMs - ms)) best = s
  return best
}

/** Speaker + free-text filter for the transcript panel. Case-insensitive;
 *  an empty query and no speaker return the whole list unchanged. */
export function filterSegments<T extends Pick<TranscriptSegment, 'speakerName' | 'text'>>(
  segments: ReadonlyArray<T>,
  opts: { speaker?: string | null; query?: string }
): T[] {
  const q = (opts.query ?? '').trim().toLowerCase()
  return segments.filter((s) => {
    if (opts.speaker && nameOf(s) !== opts.speaker) return false
    if (q && !s.text.toLowerCase().includes(q)) return false
    return true
  })
}

/** m:ss for a clock offset. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "24 s" / "42 min" / "1 h 05 min" for a duration — a sub-minute call
 *  says its seconds rather than rounding to an untrue "0 min". */
export function fmtDuration(ms: number): string {
  const totalS = Math.max(0, Math.round(ms / 1000))
  if (totalS < 60) return `${totalS} s`
  const m = Math.round(totalS / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
