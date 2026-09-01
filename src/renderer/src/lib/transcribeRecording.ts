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
async function decodeToMono16k(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const AC: typeof AudioContext =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!
  const ctx = new AC({ sampleRate: 16000 })
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
    if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)
    const len = decoded.length
    const mono = new Float32Array(len)
    const ch0 = decoded.getChannelData(0)
    const ch1 = decoded.getChannelData(1)
    for (let i = 0; i < len; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5
    return mono
  } finally {
    await ctx.close().catch(() => {})
  }
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
