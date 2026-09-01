// M2 (SPEC-003) — merging per-track transcriptions into ONE attributed
// timeline, pure and unit-tested. Each track was transcribed independently
// with its own zero; the recorder gave every track an offset on one shared
// clock, so merging is arithmetic, not inference. No model is consulted —
// attribution came from capture (C1, operator-ruled) and stays exact.

export interface TrackTranscription {
  accountId: string
  speakerName: string
  /** ms from the recording's t0 at which this track began. */
  offsetMs: number
  /** Engine segments (track-relative), or null when the engine gave text only. */
  segments: Array<{ startMs: number; endMs: number; text: string; confidence: number | null }> | null
  /** Whole-track text — the fallback when segments are null. */
  text: string
  durationSec: number
}

export interface MergedSegment {
  speakerAccountId: string | null
  speakerName: string
  startMs: number
  endMs: number
  text: string
  confidence: number | null
}

export function fmtOffset(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Merge all tracks onto the shared clock, sorted by when each span was
 *  actually spoken. A track without engine segments degrades to one span
 *  covering its whole take — attribution survives even when timing within
 *  the track is lost. 'me' is a local-only placeholder id, stored as null. */
export function mergeTrackSegments(tracks: TrackTranscription[]): MergedSegment[] {
  const out: MergedSegment[] = []
  for (const t of tracks) {
    const segs =
      t.segments && t.segments.length
        ? t.segments
        : t.text.trim()
          ? [
              {
                startMs: 0,
                endMs: Math.round(t.durationSec * 1000),
                text: t.text.trim(),
                confidence: null
              }
            ]
          : []
    for (const s of segs) {
      if (!s.text.trim()) continue
      out.push({
        speakerAccountId: t.accountId === 'me' ? null : t.accountId,
        speakerName: t.speakerName,
        startMs: s.startMs + t.offsetMs,
        endMs: s.endMs + t.offsetMs,
        text: s.text.trim(),
        confidence: s.confidence
      })
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

/** The attributed plain-text transcript — what the summariser reads and the
 *  transcript document shows: `[m:ss] Name: words`, in spoken order. */
export function formatAttributedTranscript(segments: MergedSegment[]): string {
  return segments.map((s) => `[${fmtOffset(s.startMs)}] ${s.speakerName}: ${s.text}`).join('\n')
}
