// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rmsOf, splitAtSilence } from '../../src/renderer/src/lib/audioSplit'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const tr = read('src/renderer/src/lib/transcribeRecording.ts')

// DEC-130 — the derail net. whisper-base decodes a take as one window; a few
// hard seconds at the end returned the WHOLE window as "Thanks for watching."
// for a take the cloud engine read perfectly (2026-09-07, measured). Cutting
// at pauses and decoding the pieces keeps what the engine can read.

const SR = 16000
function tone(seconds: number, amp = 0.3): number[] {
  const n = Math.round(seconds * SR)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR)
  return out
}
function silence(seconds: number): number[] {
  return new Array<number>(Math.round(seconds * SR)).fill(0)
}
function pcm(...parts: number[][]): Float32Array {
  return Float32Array.from(parts.flat())
}

describe('rmsOf', () => {
  it('zero for digital silence, the amplitude/√2 for a sine', () => {
    expect(rmsOf(pcm(silence(1)))).toBe(0)
    expect(rmsOf(pcm(tone(1, 0.5)))).toBeCloseTo(0.5 / Math.SQRT2, 2)
    expect(rmsOf(new Float32Array(0))).toBe(0)
  })
})

describe('splitAtSilence', () => {
  it('one piece when there is no pause; nothing for no audio', () => {
    expect(splitAtSilence(pcm(tone(3)), SR)).toEqual([{ start: 0, end: 3 * SR }])
    expect(splitAtSilence(new Float32Array(0), SR)).toEqual([])
  })
  it('cuts at a real pause and trims the silence off the pieces', () => {
    const r = splitAtSilence(pcm(tone(3), silence(0.6), tone(2.5)), SR)
    expect(r).toHaveLength(2)
    expect(r[0].start).toBe(0)
    expect(r[0].end).toBeLessThanOrEqual(3 * SR + 0.05 * SR)
    expect(r[1].start).toBeGreaterThanOrEqual(3.6 * SR - 0.05 * SR)
    expect(r[1].end).toBe(Math.round(6.1 * SR))
  })
  it('a blip of silence is not a pause; a sliver of sound folds into its neighbour', () => {
    expect(splitAtSilence(pcm(tone(2), silence(0.1), tone(2)), SR)).toHaveLength(1)
    const r = splitAtSilence(pcm(tone(4), silence(0.5), tone(0.4)), SR)
    expect(r).toHaveLength(1)
    expect(r[0].end).toBe(Math.round(4.9 * SR))
  })
  it('a long unbroken piece is cut at its quietest interior frame, never into slivers', () => {
    const quietDip = tone(20).map((v, i) => (i > 11 * SR && i < 11.2 * SR ? v * 0.05 : v))
    const r = splitAtSilence(pcm(quietDip), SR, { maxChunkSec: 12 })
    expect(r.length).toBeGreaterThanOrEqual(2)
    for (const piece of r) expect(piece.end - piece.start).toBeGreaterThanOrEqual(1.5 * SR)
    expect(r[0].start).toBe(0)
    expect(r[r.length - 1].end).toBe(20 * SR)
  })
  it('leading silence is trimmed; the pieces tile the sound in order', () => {
    const r = splitAtSilence(pcm(silence(1), tone(2), silence(0.4), tone(2)), SR)
    expect(r[0].start).toBeGreaterThanOrEqual(SR - 0.05 * SR)
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].end)
  })
})

describe('the derail net is wired into the on-device path', () => {
  it('first pass whole; only a degenerate result on audible audio triggers the pieces; nothing invented', () => {
    expect(tr).toContain("import { transcriptLooksEmpty } from './transcriptSanity'")
    expect(tr).toContain("import { rmsOf, splitAtSilence } from './audioSplit'")
    expect(tr).toContain('return await recoverIfDerailed(samples, first)')
    expect(tr).toContain('if (!transcriptLooksEmpty(first.transcript, durationSec) || rmsOf(samples) < DERAIL_MIN_RMS) return first')
    expect(tr).toContain("forceProvider: 'local' })")
    expect(tr).not.toContain("forceProvider: 'cloud'")
    expect(tr).toContain('if (!text || transcriptLooksEmpty(text, piece.length / 16000)) continue')
    expect(tr).toContain('segments.push({ ...s, startMs: s.startMs + offsetMs, endMs: s.endMs + offsetMs })')
    expect(tr).toContain('if (texts.length === 0) return first')
  })
})
