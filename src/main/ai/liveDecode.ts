// M4 — the live-decode queue. One chunk decodes at a time (a second
// concurrent ONNX session would double memory for zero latency win), and a
// backlog DROPS the oldest waiting chunk rather than falling further behind:
// a live view that lags 30 seconds is worse than one with a small hole, and
// the wrap-up's per-track pass rebuilds the full truth regardless — the live
// pane is a courtesy, the Record is the artifact.

import { transcribeLocal } from './localWhisper'

export interface LiveDecodeResult {
  ok: boolean
  text?: string
  /** True when the queue shed this chunk instead of decoding it. */
  dropped?: boolean
  error?: string
}

interface Pending {
  samples: Float32Array
  resolve: (r: LiveDecodeResult) => void
}

const MAX_WAITING = 3

let queue: Pending[] = []
let running = false

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()!
      // The live pane is the latency courtesy: tiny, explicitly — the
      // wrap-up's base pass writes the truth afterwards (the model ruling).
      const r = await transcribeLocal(job.samples, 16000, { model: 'tiny' })
      job.resolve(
        r.ok ? { ok: true, text: r.transcript.trim() } : { ok: false, error: r.error }
      )
    }
  } finally {
    running = false
  }
}

export function enqueueLiveChunk(samples: Float32Array): Promise<LiveDecodeResult> {
  return new Promise((resolve) => {
    queue.push({ samples, resolve })
    while (queue.length > MAX_WAITING) {
      // Shed from the FRONT: the oldest audio is the least useful to a pane
      // showing "now". The shed caller learns it honestly.
      const shed = queue.shift()!
      shed.resolve({ ok: false, dropped: true })
    }
    void pump()
  })
}

/** Test seam: reset the queue between cases. */
export function resetLiveQueue(): void {
  queue = []
  running = false
}
