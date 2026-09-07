// Local Whisper — on-device transcription via @xenova/transformers.
//
// The engine runs IN THE MAIN PROCESS. An earlier round chased a phantom
// "ORT corrupts output in Electron main" theory and briefly moved this to a
// child process; the real cause was never the process context — it was one
// decode option (`task: 'transcribe'`, now removed in whisperCore). The main
// process transcribes cleanly, so this stays simple: no worker, no IPC.
//
// The pure logic (models, decode options, the repeat-collapse net, segment
// shaping) lives in whisperCore and is re-exported so callers and tests keep
// their imports.

import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import {
  MODEL_IDS,
  DECODE_OPTS,
  shapeSegments,
  collapseRepeatRuns,
  type EngineSegment,
  type LocalWhisperModel
} from './whisperCore'

export { collapseRepeatRuns }
export type { EngineSegment, LocalWhisperModel }

interface TranscribeResultOk {
  ok: true
  transcript: string
  durationSec: number | null
  language: string | null
  segments: EngineSegment[] | null
}

interface TranscribeResultErr {
  ok: false
  error: string
  reason?: 'no_key' | 'network' | 'api' | 'unknown' | 'model_load' | 'decode'
}

interface TranscribePipeline {
  (
    audio: Float32Array,
    opts: typeof DECODE_OPTS
  ): Promise<{ text: string; chunks?: Array<{ timestamp: [number, number | null]; text: string }> }>
}

// One lazily-loaded pipeline per model, reused across calls.
const pipelines = new Map<LocalWhisperModel, Promise<TranscribePipeline>>()

async function getPipeline(model: LocalWhisperModel): Promise<TranscribePipeline> {
  const existing = pipelines.get(model)
  if (existing) return existing
  const made = (async () => {
    const transformers = await import('@xenova/transformers')
    const cacheDir = join(app.getPath('userData'), 'whisper-cache')
    mkdirSync(cacheDir, { recursive: true })
    transformers.env.cacheDir = cacheDir
    transformers.env.allowRemoteModels = true
    return (await transformers.pipeline(
      'automatic-speech-recognition',
      MODEL_IDS[model]
    )) as unknown as TranscribePipeline
  })()
  pipelines.set(model, made)
  return made
}

/** True once at least one model has begun loading. */
export function isLocalWhisperReady(): boolean {
  return pipelines.size > 0
}

/** Warm a model (default base — the wrap-up's truth model). */
export async function preloadLocalWhisper(
  model: LocalWhisperModel = 'base'
): Promise<{ ok: boolean; error?: string }> {
  try {
    await getPipeline(model)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Transcribe pre-decoded 16kHz mono PCM. Same tagged-union result the cloud
 * path returns. Defaults to whisper-base (the model ruling); the live pane
 * passes { model: 'tiny' } for latency.
 */
export async function transcribeLocal(
  samples: Float32Array,
  sampleRate: number,
  opts: { model?: LocalWhisperModel } = {}
): Promise<TranscribeResultOk | TranscribeResultErr> {
  const model = opts.model ?? 'base'
  if (sampleRate !== 16000) {
    return {
      ok: false,
      error: `Local Whisper expects 16kHz samples, got ${sampleRate}Hz. Resample in the renderer (new AudioContext({sampleRate: 16000})).`,
      reason: 'decode'
    }
  }
  if (!samples || samples.length === 0) {
    return { ok: false, error: 'Empty audio sample buffer — recording too short or decoder failed.', reason: 'decode' }
  }
  let pipe: TranscribePipeline
  try {
    pipe = await getPipeline(model)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Local Whisper model load failed: ${err.message}` : 'Local Whisper model load failed.',
      reason: 'model_load'
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[localWhisper:${model}] transcribing ${samples.length} samples (${Math.round(samples.length / sampleRate)}s)`)
  try {
    const result = await pipe(samples, DECODE_OPTS)
    const text = typeof result.text === 'string' ? result.text.trim() : ''
    const segments = shapeSegments(result.chunks, samples.length, sampleRate)
    // eslint-disable-next-line no-console
    console.log(`[localWhisper:${model}] ok: ${text.length} chars, ${segments.length} segments`)
    return {
      ok: true,
      transcript: text,
      durationSec: samples.length / sampleRate,
      language: null,
      segments: segments.length ? segments : null
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[localWhisper] transcription failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err), reason: 'decode' }
  }
}
