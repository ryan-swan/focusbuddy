// Local Whisper provider — runs OpenAI's Whisper model entirely on the
// user's machine via @xenova/transformers (a JS port of HF Transformers
// using ONNX Runtime under the hood).
//
// Audio input contract: the renderer must pre-decode audio to a 16kHz
// mono Float32Array (PCM samples in -1..1). This module passes those
// samples DIRECTLY to the pipeline — we never call its built-in
// `read_audio`, because that uses Web Audio API which doesn't exist
// in Node main. The earlier file-path approach failed with
// "AudioContext is not available in your environment" exactly
// because of that. The renderer has Web Audio API natively, so
// decoding there + transferring a Float32Array via IPC is the clean
// boundary.
//
// Why this and not whisper.cpp:
//   - Zero native build. The package ships pre-compiled ONNX runtime
//     bindings for every platform Electron supports. No node-gyp,
//     no electron-builder ASAR-unpack gymnastics for a Mach-O binary.
//   - Same model architecture, same audio preprocessing, same accuracy
//     ceiling — it's literally Whisper running on ONNX instead of CUDA.
//
// Tradeoffs:
//   - First call downloads ~80MB of model weights to the HuggingFace
//     cache directory. We pre-warm this on settings toggle so the
//     first recording isn't a 90-second wait.
//   - CPU-bound. A 30-second audio clip takes ~5-15s on an M1. Cloud
//     Whisper is ~2x faster for the same clip but bills per minute.

import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'

interface TranscribeResultOk {
  ok: true
  transcript: string
  durationSec: number | null
  language: string | null
}

interface TranscribeResultErr {
  ok: false
  error: string
  reason?: 'no_key' | 'network' | 'api' | 'unknown' | 'model_load' | 'decode'
}

// Lazy-init pipeline holder. The first transcribeLocal() call triggers
// model download + load; subsequent calls reuse the in-memory pipeline.
// transformers ships from node_modules but the imports are async / ESM
// inside CJS; we import dynamically so the module loads cleanly under
// Electron's main-process bundler (electron-vite).
let pipelinePromise: Promise<TranscribePipeline> | null = null

// The transformers package's pipeline returns a callable function; we
// only care about a narrow subset of its shape, so we type just what
// we need.
interface TranscribePipeline {
  (
    audio: Float32Array,
    opts: { language?: string; task?: string; return_timestamps?: boolean }
  ): Promise<{ text: string }>
}

async function getPipeline(): Promise<TranscribePipeline> {
  if (pipelinePromise) return pipelinePromise
  pipelinePromise = (async () => {
    // Cache the downloaded model under userData so it persists across
    // app updates without re-downloading. Setting `env.cacheDir`
    // BEFORE the first pipeline() call is what wires the cache.
    const transformers = await import('@xenova/transformers')
    const cacheDir = join(app.getPath('userData'), 'whisper-cache')
    mkdirSync(cacheDir, { recursive: true })
    transformers.env.cacheDir = cacheDir
    // Disable remote cache check for offline starts after first DL.
    transformers.env.allowRemoteModels = true
    // 'Xenova/whisper-tiny' is the standard tiny model port, ~80MB.
    // Larger sizes available (base 145MB, small 480MB) — tiny is the
    // right default for "good enough on CPU".
    const pipeline = (await transformers.pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny'
    )) as unknown as TranscribePipeline
    return pipeline
  })()
  return pipelinePromise
}

/**
 * True if the model has already been downloaded + loaded into memory.
 * Renderer uses this to decide whether to show a "Downloading model…"
 * progress indicator on first local-mode use.
 */
export function isLocalWhisperReady(): boolean {
  return pipelinePromise !== null
}

/**
 * Pre-warm the model — settings toggles call this immediately after
 * the user picks 'local', so the first recording doesn't pay the
 * download/load cost. Idempotent: returns the same promise after the
 * first call.
 */
export async function preloadLocalWhisper(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getPipeline()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Run local Whisper against pre-decoded PCM samples. Returns the same
 * tagged union as the cloud provider so callers can branch on `.ok`
 * without caring which engine produced the result.
 *
 * The samples MUST be:
 *   - mono (single channel — take channelData[0] from the AudioBuffer)
 *   - 16kHz sample rate (Whisper's training input)
 *   - Float32 in the range [-1, 1]
 *
 * Decoding happens in the renderer via Web Audio API. See the
 * VoiceRecorderWidget for the AudioContext recipe.
 */
export async function transcribeLocal(
  samples: Float32Array,
  sampleRate: number
): Promise<TranscribeResultOk | TranscribeResultErr> {
  let pipe: TranscribePipeline
  try {
    pipe = await getPipeline()
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Local Whisper model load failed: ${err.message}`
          : 'Local Whisper model load failed.',
      reason: 'model_load'
    }
  }

  // Sample-rate guard — Whisper was trained at 16kHz mono. If the
  // renderer hands us something else, the model will still run but
  // produce gibberish. We don't resample here (would pull in another
  // dep); we surface a clear error so the renderer-side recipe is
  // obvious. In practice the renderer's AudioContext should already
  // be configured for 16kHz before it calls decodeAudioData.
  if (sampleRate !== 16000) {
    return {
      ok: false,
      error: `Local Whisper expects 16kHz samples, got ${sampleRate}Hz. Resample in the renderer (new AudioContext({sampleRate: 16000})).`,
      reason: 'decode'
    }
  }
  if (!samples || samples.length === 0) {
    return {
      ok: false,
      error: 'Empty audio sample buffer — recording too short or decoder failed.',
      reason: 'decode'
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[localWhisper] transcribing ${samples.length} samples (${Math.round(samples.length / sampleRate)}s) @ ${sampleRate}Hz`
  )

  try {
    const result = await pipe(samples, {
      task: 'transcribe',
      return_timestamps: false
    })
    const text = typeof result.text === 'string' ? result.text.trim() : ''
    // eslint-disable-next-line no-console
    console.log(`[localWhisper] ok: ${text.length} chars`)
    return {
      ok: true,
      transcript: text,
      durationSec: samples.length / sampleRate,
      language: null // tiny model doesn't reliably surface this; cloud does
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[localWhisper] transcription failed:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: 'decode'
    }
  }
}
