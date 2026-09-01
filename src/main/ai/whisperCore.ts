// The pure heart of local transcription — no electron, no process globals —
// so it runs identically in the main process AND in the utilityProcess
// worker, and unit-tests import it directly.
//
// The model ruling (analysis/28 open item #4, decided by MEASUREMENT on the
// operator's own broken take, 2026-09-01): whisper-tiny collapsed a real
// 36.5s deliverables recording into one sentence looped twelve times;
// whisper-base transcribed the same audio near-perfectly. base is the
// wrap-up truth; tiny stays for the live pane only (a labelled courtesy).

export interface EngineSegment {
  startMs: number
  endMs: number
  text: string
  confidence: number | null
}

export type LocalWhisperModel = 'tiny' | 'base'

export const MODEL_IDS: Record<LocalWhisperModel, string> = {
  tiny: 'Xenova/whisper-tiny',
  base: 'Xenova/whisper-base'
}

// The decode options that keep the model out of the sentence-loop attractor,
// ALL proven by measurement on the operator's own broken take:
//   - NO `task: 'transcribe'`. THE root-cause bug — the original code passed
//     it, and on whisper-base it forced a decoder path that collapsed a real
//     36.5s recording into "So So So…" twelve times. Omitting it (the library
//     default) transcribes the same audio near-perfectly. transformers.js
//     2.17.2 + Xenova/whisper-base: `task` is poison, absence is correct.
//   - explicit 30s windows, a 5s stride, and a 3-gram repeat ban round out
//     the safety net for any audio that is genuinely hard.
export const DECODE_OPTS = {
  return_timestamps: true as const,
  chunk_length_s: 30,
  stride_length_s: 5,
  no_repeat_ngram_size: 3
}

// ── The repetition net ──────────────────────────────────────────────────────
// A run of three or more CONSECUTIVE segments with identical normalised text
// collapses to ONE segment spanning the run — the sentence was heard once,
// not twelve times, and the Record should say so.
export function collapseRepeatRuns(segments: EngineSegment[]): EngineSegment[] {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const out: EngineSegment[] = []
  let i = 0
  while (i < segments.length) {
    let j = i + 1
    while (j < segments.length && norm(segments[j].text) === norm(segments[i].text)) j++
    const run = j - i
    if (run >= 3) {
      out.push({ ...segments[i], endMs: segments[j - 1].endMs })
    } else {
      for (let k = i; k < j; k++) out.push(segments[k])
    }
    i = j
  }
  return out
}

// Shape the raw pipeline output into EngineSegments (offsets in ms, honest
// null confidence — transformers.js exposes no logprobs), then run the net.
export function shapeSegments(
  chunks: Array<{ timestamp: [number, number | null]; text: string }> | undefined,
  totalSamples: number,
  sampleRate: number
): EngineSegment[] {
  const raw: EngineSegment[] = Array.isArray(chunks)
    ? chunks
        .filter((c) => Array.isArray(c.timestamp) && typeof c.text === 'string' && c.text.trim())
        .map((c) => ({
          startMs: Math.max(0, Math.round((c.timestamp[0] ?? 0) * 1000)),
          endMs: Math.round((c.timestamp[1] ?? totalSamples / sampleRate) * 1000),
          text: c.text.trim(),
          confidence: null
        }))
    : []
  return collapseRepeatRuns(raw)
}
