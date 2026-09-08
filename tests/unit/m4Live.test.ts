import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { downsampleTo16k, PcmChunker, LIVE_RATE, LIVE_CHUNK_SEC } from '../../src/renderer/src/lib/livePcm'

// M4 (C8's deferred half) — the live transcript. The G2 spike measured
// whisper-tiny at ~0.6s per 5s chunk on this class of hardware (~15% of one
// core), so live decode shipped; these pin the plumbing that keeps it honest:
// view-driven cost, consent inherited from the recorder's choke point, and a
// queue that sheds rather than lags.

// ── the pure PCM math ───────────────────────────────────────────────────────

describe('downsampleTo16k', () => {
  it('16k input passes through untouched', () => {
    const a = new Float32Array([0.1, 0.2, 0.3])
    expect(downsampleTo16k(a, LIVE_RATE)).toBe(a)
  })

  it('48k → 16k yields one third the samples', () => {
    const a = new Float32Array(48000)
    expect(downsampleTo16k(a, 48000).length).toBe(16000)
  })

  it('interpolates rather than skipping (a ramp stays a ramp)', () => {
    const a = Float32Array.from({ length: 48000 }, (_, i) => i / 48000)
    const out = downsampleTo16k(a, 48000)
    // Midpoint of a linear ramp is still ~0.5 after resampling.
    expect(out[8000]).toBeCloseTo(0.5, 2)
  })
})

describe('PcmChunker — the live cadence', () => {
  it('holds until LIVE_CHUNK_SEC of audio has accumulated', () => {
    const c = new PcmChunker(48000)
    c.append(new Float32Array(48000 * (LIVE_CHUNK_SEC - 1)))
    expect(c.flushIfReady()).toBeNull()
    c.append(new Float32Array(48000))
    const chunk = c.flushIfReady()
    expect(chunk).not.toBeNull()
    expect(chunk!.length).toBe(LIVE_RATE * LIVE_CHUNK_SEC)
  })

  it('drain returns the remainder resampled, and empties the buffer', () => {
    const c = new PcmChunker(48000)
    c.append(new Float32Array(48000 * 2))
    const rest = c.drain()
    expect(rest!.length).toBe(LIVE_RATE * 2)
    expect(c.drain()).toBeNull()
  })

  it('a sub-half-second sliver drains to null — tiny hallucinates on near-silence', () => {
    const c = new PcmChunker(48000)
    c.append(new Float32Array(48000 * 0.3))
    expect(c.drain()).toBeNull()
  })
})

// ── the decode queue ────────────────────────────────────────────────────────

const decodeLog: number[] = []
let resolveDecode: (() => void) | null = null
vi.mock('../../src/main/ai/localWhisper', () => ({
  transcribeLocal: vi.fn(async (samples: Float32Array) => {
    decodeLog.push(samples.length)
    await new Promise<void>((r) => {
      resolveDecode = r
    })
    return { ok: true, transcript: `decoded-${samples.length}`, durationSec: null, language: null, segments: null }
  })
}))

import { enqueueLiveChunk, resetLiveQueue } from '../../src/main/ai/liveDecode'

describe('enqueueLiveChunk — serial, shedding queue', () => {
  beforeEach(() => {
    decodeLog.length = 0
    resolveDecode = null
    resetLiveQueue()
  })

  it('decodes one chunk at a time and returns its text', async () => {
    const p = enqueueLiveChunk(new Float32Array(100))
    await vi.waitFor(() => expect(resolveDecode).not.toBeNull())
    resolveDecode!()
    const r = await p
    expect(r).toEqual({ ok: true, text: 'decoded-100' })
  })

  it('sheds the OLDEST waiting chunk under backlog, reporting dropped honestly', async () => {
    // First chunk starts decoding (held open by the mock); the queue behind
    // it fills past MAX_WAITING and the oldest waiter is shed.
    const running = enqueueLiveChunk(new Float32Array(1))
    await vi.waitFor(() => expect(decodeLog.length).toBe(1))
    const waiters = [2, 3, 4, 5].map((n) => enqueueLiveChunk(new Float32Array(n)))
    const shed = await waiters[0]
    expect(shed).toEqual({ ok: false, dropped: true })
    // Drain the rest so the module's queue ends this test empty.
    for (let i = 0; i < 4; i++) {
      resolveDecode!()
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
    }
    await running
    await Promise.all(waiters.slice(1))
  })
})

// ── source pins ─────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

describe('M4 — live transcript wiring pins', () => {
  const recorder = read('src/renderer/src/lib/trackRecorder.ts')
  const store = read('src/renderer/src/stores/meetingRoom.ts')
  const overlay = read('src/renderer/src/components/MeetingOverlay.tsx')
  const ipc = read('src/main/ipc/index.ts')
  const preload = read('src/preload/index.ts')
  const decode = read('src/main/ai/liveDecode.ts')

  it('the live tap inherits consent: processors exist only on recorder taps', () => {
    expect(recorder).toContain('Consent is inherited, not re-decided')
    // A late consenter starts flowing through the SAME choke point.
    expect(recorder).toContain('if (this.liveCb) this.attachLive(accountId, tap)')
    // Withdrawal detaches the live tap with the recording tap.
    expect(recorder).toContain('this.detachLive(tap)')
  })

  it('decode cost is view-driven: the tap follows the pane open/closed', () => {
    expect(store).toContain('setLiveOpen: (open) =>')
    expect(store).toContain('recorder.disableLive()')
    expect(overlay).toContain('const wantLive = showTranscriptNote && transcribing && recordingBy === myId')
    expect(overlay).toContain('return () => setLiveOpen(false)')
  })

  it('the pane is honest on every branch: idle, remote recorder, live', () => {
    expect(overlay).toContain('Nothing is being recorded or transcribed.')
    expect(overlay).toContain('Only the recording machine hears the room')
    expect(overlay).toContain('rough and local — the Record is written at wrap-up')
    expect(overlay).toContain('data-testid="live-transcript"')
  })

  it('the queue sheds rather than lags, and the wrap-up remains the artifact', () => {
    expect(decode).toContain('const MAX_WAITING = 3')
    expect(decode).toContain('the live\n// pane is a courtesy, the Record is the artifact')
    expect(ipc).toContain("ipcMain.handle('voice:transcribeLive'")
    expect(preload).toContain("ipcRenderer.invoke('voice:transcribeLive', pcm)")
  })

  it('ending a recording clears the live pane state everywhere it ends', () => {
    // Initiator stop, remote recording-stopped wire, and leave() teardown.
    const clears = store.split('liveOpen: false, liveLines: []').length - 1
    expect(clears).toBeGreaterThanOrEqual(2)
    expect(store).toContain('rec.disableLive()')
  })
})
