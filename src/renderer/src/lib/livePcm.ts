// M4 (SPEC-003, C8's deferred half) — pure PCM plumbing for the live
// transcript. The G2 spike measured whisper-tiny at ~0.6s per 5s chunk on
// Apple Silicon (a ~15% duty cycle of one core), so live decode is real —
// but only while the pane is open: the tap starts when the transcript pane
// opens and dies when it closes, so the cost is view-driven, never ambient.
//
// Pure math, no WebAudio: the recorder owns the graph; this owns the
// numbers, so the resample ratio and the chunk cadence are unit-pinned.

/** Whisper's native rate — both engines expect 16kHz mono. */
export const LIVE_RATE = 16000

/** Chunk cadence: enough context for tiny to produce words, short enough
 *  that the pane feels live. The spike ran exactly this shape. */
export const LIVE_CHUNK_SEC = 5

// Linear-interpolation resample to 16kHz. A windowed-sinc would be more
// faithful; for a live ROUGH view feeding whisper-tiny the difference is
// inaudible in the output text, and this stays dependency-free.
export function downsampleTo16k(input: Float32Array, inRate: number): Float32Array {
  if (inRate === LIVE_RATE) return input
  const outLen = Math.floor((input.length * LIVE_RATE) / inRate)
  const out = new Float32Array(outLen)
  const ratio = inRate / LIVE_RATE
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = pos - i0
    out[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return out
}

/** Accumulates native-rate PCM and yields 16kHz chunks every LIVE_CHUNK_SEC. */
export class PcmChunker {
  private parts: Float32Array[] = []
  private samples = 0
  constructor(private inRate: number) {}

  append(pcm: Float32Array): void {
    this.parts.push(pcm)
    this.samples += pcm.length
  }

  /** A 16kHz chunk when at least LIVE_CHUNK_SEC has accumulated, else null. */
  flushIfReady(): Float32Array | null {
    if (this.samples < this.inRate * LIVE_CHUNK_SEC) return null
    return this.drain()
  }

  /** Whatever remains (may be short), 16kHz; null when empty or negligible
   *  (< 0.5s — tiny hallucinates on near-silence slivers). */
  drain(): Float32Array | null {
    if (this.samples < this.inRate * 0.5) {
      this.parts = []
      this.samples = 0
      return null
    }
    const joined = new Float32Array(this.samples)
    let off = 0
    for (const p of this.parts) {
      joined.set(p, off)
      off += p.length
    }
    this.parts = []
    this.samples = 0
    return downsampleTo16k(joined, this.inRate)
  }
}
