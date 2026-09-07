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
async function decodeToMono16k(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const AC: typeof AudioContext =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!
  const probe = new AC()
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
      return await window.api.voiceNote.transcribe({ samples, sampleRate: 16000, forceProvider: 'local' })
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
