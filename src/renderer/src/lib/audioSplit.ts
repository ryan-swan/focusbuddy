// DEC-130 — cutting audio at its own pauses, and knowing when it has sound.
//
// The on-device engine (whisper-base) decodes a take as ONE 30 s window, and
// when a few hard seconds derail that decode — a word cut mid-syllable at
// the very end, a click, a burst of noise — the WHOLE window comes back as a
// stock phrase ("Thanks for watching."), the good nine seconds gone with the
// bad two. Measured on 2026-09-07: the same take transcribed perfectly on
// the cloud engine, perfectly on-device trimmed to 0–9 s, and as "Thanks
// for watching." on-device at 0–10.5 s. Splitting at pauses and decoding
// the pieces keeps every piece the engine CAN read.

export interface SampleRange {
  /** Inclusive start sample. */
  start: number
  /** Exclusive end sample. */
  end: number
}

/** Root-mean-square of a PCM buffer (0 for digital silence). */
export function rmsOf(samples: Float32Array | ArrayLike<number>): number {
  const n = samples.length
  if (n === 0) return 0
  let sum = 0
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / n)
}

export interface SplitOptions {
  /** A frame quieter than this (RMS) counts as silence. */
  silenceRms?: number
  /** Silence must last this long to count as a pause. */
  minSilenceSec?: number
  /** Pieces shorter than this are folded into their neighbour. */
  minChunkSec?: number
  /** Pieces longer than this are cut at their quietest frame. */
  maxChunkSec?: number
  /** Analysis frame length. */
  frameSec?: number
}

/**
 * Split `samples` into ranges at pauses. Pure and deterministic. Returns one
 * range covering everything when no pause qualifies; never returns an empty
 * list for non-empty audio. Leading and trailing silence is trimmed off the
 * pieces (the engine gains nothing from it).
 */
export function splitAtSilence(
  samples: Float32Array | ArrayLike<number>,
  sampleRate: number,
  opts: SplitOptions = {}
): SampleRange[] {
  const total = samples.length
  if (total === 0) return []
  const silenceRms = opts.silenceRms ?? 0.01
  const minSilence = Math.max(1, Math.round((opts.minSilenceSec ?? 0.25) * sampleRate))
  const minChunk = Math.round((opts.minChunkSec ?? 1.5) * sampleRate)
  const maxChunk = Math.round((opts.maxChunkSec ?? 12) * sampleRate)
  const frame = Math.max(1, Math.round((opts.frameSec ?? 0.05) * sampleRate))

  // 1. Frame-level loudness.
  const frames = Math.ceil(total / frame)
  const loud: boolean[] = new Array(frames)
  const level: number[] = new Array(frames)
  for (let f = 0; f < frames; f++) {
    const a = f * frame
    const b = Math.min(total, a + frame)
    let sum = 0
    for (let i = a; i < b; i++) sum += samples[i] * samples[i]
    const r = Math.sqrt(sum / (b - a))
    level[f] = r
    loud[f] = r >= silenceRms
  }

  // 2. Runs of sound, separated by pauses of at least minSilence.
  const minSilenceFrames = Math.max(1, Math.round(minSilence / frame))
  const runs: SampleRange[] = []
  let cur: SampleRange | null = null
  let quiet = 0
  for (let f = 0; f < frames; f++) {
    if (loud[f]) {
      if (!cur) cur = { start: f * frame, end: Math.min(total, (f + 1) * frame) }
      else cur.end = Math.min(total, (f + 1) * frame)
      quiet = 0
    } else if (cur) {
      quiet++
      if (quiet >= minSilenceFrames) {
        runs.push(cur)
        cur = null
        quiet = 0
      }
    }
  }
  if (cur) runs.push(cur)
  if (runs.length === 0) return [{ start: 0, end: total }]

  // 3. Fold pieces that are too short into the previous one (or the next).
  const folded: SampleRange[] = []
  for (const r of runs) {
    const prev = folded[folded.length - 1]
    if (prev && r.end - r.start < minChunk) prev.end = r.end
    else if (prev && prev.end - prev.start < minChunk) prev.end = r.end
    else folded.push({ ...r })
  }

  // 4. Cut pieces that are too long at their quietest interior frame.
  const out: SampleRange[] = []
  const cutLong = (r: SampleRange): void => {
    if (r.end - r.start <= maxChunk) {
      out.push(r)
      return
    }
    // The quietest frame between 40% and 90% of the piece — never a sliver.
    const f0 = Math.floor((r.start + (r.end - r.start) * 0.4) / frame)
    const f1 = Math.floor((r.start + (r.end - r.start) * 0.9) / frame)
    let best = f0
    for (let f = f0; f <= f1 && f < frames; f++) if (level[f] < level[best]) best = f
    const cut = Math.min(r.end - minChunk, Math.max(r.start + minChunk, best * frame))
    if (cut <= r.start || cut >= r.end) {
      out.push(r)
      return
    }
    cutLong({ start: r.start, end: cut })
    cutLong({ start: cut, end: r.end })
  }
  for (const r of folded) cutLong(r)
  return out
}
