import { transcriptLooksEmpty } from './transcriptSanity'
import { rmsOf, splitAtSilence } from './audioSplit'

// One provider-aware way to transcribe a recorded audio blob, so every caller
// (meeting wrap-up, record-notes, and any future recorder) behaves correctly on
// both transcription providers.
//
// The cloud provider (OpenAI Whisper) takes the raw bytes. The local provider
// (on-device Whisper) needs pre-decoded mono 16 kHz PCM samples, because audio
// decoding uses the renderer's Web Audio and cannot happen in the main process.
// The meeting flows previously always sent raw bytes, so on the local provider
// transcription failed at the end of a meeting. This helper checks the provider
// and decodes only when needed.

// Decode an arbitrary audio blob (webm/opus etc) into mono 16 kHz Float32 PCM,
// the format the local Whisper model expects.
//
// The decode is TWO stages on purpose. The old one-stage recipe —
// `new AudioContext({ sampleRate: 16000 })` + decodeAudioData — makes
// Chromium resample DURING the opus decode with a low-quality path, and on
// the operator's real meeting take that mush cost the first 24 seconds of
// an otherwise-clean whisper-base transcription (ffmpeg-decoded PCM of the
// SAME bytes transcribed near-perfectly — the model was never the problem
// there, the feed was). So: decode at the clip's native rate first, then
// let an OfflineAudioContext do the resample to 16 kHz — its render path
// is the high-quality resampler, and connecting any channel count to a
// mono destination downmixes correctly for free.
//
// DEC-130 — and the first stage must NAME its rate. A bare `new AudioContext()`
// runs at the system output device's rate, which is 16 kHz whenever a
// Bluetooth headset is in its call profile (operator's machine, 2026-09-07:
// 16000 one minute, 44100 the next). At 16 kHz the "native" decode IS the
// low-quality resample above — the same take transcribed perfectly at
// 44.1 kHz and as "Thanks for watching." at 16 kHz. Opus is 48 kHz by
// definition, so decode there, always; the offline stage does the rest.
const DECODE_RATE = 48000
async function decodeToMono16k(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const AC: typeof AudioContext =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!
  const probe = new AC({ sampleRate: DECODE_RATE })
  let decoded: AudioBuffer
  try {
    decoded = await probe.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    await probe.close().catch(() => {})
  }
  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0)
  }
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return rendered.getChannelData(0)
}

type TranscribeResult = Awaited<ReturnType<typeof window.api.voiceNote.transcribe>>

// DEC-130 — the derail net. whisper-base decodes a take as one window, and a
// few hard seconds (a word cut off mid-syllable at the end, a click) can
// return the WHOLE window as a stock phrase — "Thanks for watching." for a
// take the cloud engine read perfectly. When the first pass looks like that
// and the audio plainly has sound, cut the take at its own pauses and decode
// the pieces: every piece the engine can read is kept, with its timestamps
// moved onto the take's clock; a piece that still derails is dropped rather
// than invented. Still on-device, still no cloud (CR-11).
const DERAIL_MIN_RMS = 0.005
async function recoverIfDerailed(samples: Float32Array, first: TranscribeResult): Promise<TranscribeResult> {
  if (!first.ok) return first
  const durationSec = samples.length / 16000
  if (!transcriptLooksEmpty(first.transcript, durationSec) || rmsOf(samples) < DERAIL_MIN_RMS) return first
  const ranges = splitAtSilence(samples, 16000, { minChunkSec: 1.5, maxChunkSec: 8 })
  if (ranges.length < 2 && ranges[0] && ranges[0].end - ranges[0].start >= samples.length) return first
  const texts: string[] = []
  const segments: NonNullable<Extract<TranscribeResult, { ok: true }>['segments']> = []
  for (const r of ranges) {
    const piece = samples.subarray(r.start, r.end)
    const res = await window.api.voiceNote.transcribe({ samples: piece, sampleRate: 16000, forceProvider: 'local' })
    if (!res.ok) continue
    const text = res.transcript.trim()
    if (!text || transcriptLooksEmpty(text, piece.length / 16000)) continue
    texts.push(text)
    const offsetMs = Math.round((r.start / 16000) * 1000)
    for (const s of res.segments ?? []) segments.push({ ...s, startMs: s.startMs + offsetMs, endMs: s.endMs + offsetMs })
  }
  if (texts.length === 0) return first
  return { ...first, transcript: texts.join(' '), segments: segments.length ? segments : null }
}

// Transcribe a recorded blob, decoding for the local provider. Returns the same
// shape as window.api.voiceNote.transcribe so callers are unchanged otherwise.
export async function transcribeRecording(
  buffer: ArrayBuffer,
  mimeType: string,
  opts: { forceLocal?: boolean } = {}
): Promise<TranscribeResult> {
  // M2 (CR-11) — MEETING audio never leaves the machine: forceLocal decodes
  // and pins the on-device engine regardless of the provider preference,
  // and there is no cloud fallback on failure. You cannot ask people to
  // consent to a local-first recording and then ship their voices to a
  // third party they were never told about.
  if (opts.forceLocal) {
    try {
      const samples = await decodeToMono16k(buffer)
      const first = await window.api.voiceNote.transcribe({ samples, sampleRate: 16000, forceProvider: 'local' })
      return await recoverIfDerailed(samples, first)
    } catch (err) {
      return {
        ok: false,
        reason: 'decode',
        error: `Could not decode the recording for on-device transcription: ${(err as Error)?.message ?? 'unknown error'}.`
      } as TranscribeResult
    }
  }
  let provider: 'cloud' | 'local' = 'cloud'
  try {
    provider = await window.api.voiceNote.getProvider()
  } catch {
    // If we cannot read the preference, assume cloud (the default) and send bytes.
  }
  if (provider === 'local') {
    try {
      const samples = await decodeToMono16k(buffer)
      return await window.api.voiceNote.transcribe({ samples, sampleRate: 16000 })
    } catch (err) {
      return {
        ok: false,
        reason: 'decode',
        error: `Could not decode the recording for on-device transcription: ${(err as Error)?.message ?? 'unknown error'}.`
      } as TranscribeResult
    }
  }
  return window.api.voiceNote.transcribe({ buffer, mimeType })
}
