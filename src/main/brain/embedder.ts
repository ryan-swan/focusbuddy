// The plexi-brain embedding router (P0, DEC-015 "hybrid AI").
//
// One contract — `embed(texts) → vectors | null` — resolved by a per-purpose
// backend ladder that is LOCAL-FIRST, cloud-on-opt-in, keyword-floor last:
//
//   1. LOCAL (default): @xenova/transformers all-MiniLM-L6-v2, runs on the user's
//      machine — free, offline, private, and (measured) ~2-5ms per query embed,
//      FASTER than a cloud round-trip. This is DEC-015's "run locally wherever
//      local is good enough"; embeddings are the proven-easy case. Same package +
//      pattern the app already uses for local Whisper (ai/localWhisper.ts).
//   2. CLOUD FALLBACK (opt-in): the existing OpenAI text-embedding-3-small path
//      (ai/embeddings.ts) when the user has an OpenAI key AND local is disabled or
//      failed to load. Key-gated; the app's honest degrade already lives there.
//   3. KEYWORD FLOOR: when neither backend produces a vector, the caller degrades
//      to keyword search (embed() returns null) — no fabrication, exactly as the
//      app degrades today. This IS the DEC-012 "no key → degrades, never breaks".
//
// DEC-012 metering note: local embeds are FREE and off the credits meter by
// construction (nothing crosses the network). The OpenAI fallback is key-gated
// (not credits-metered — embeddings never routed through the Anthropic credits
// proxy; DEC-015 makes this precise: cloud-metered where a proxy exists, local
// free). No brain retrieval call fabricates when unpowered — it returns null and
// the caller keyword-searches.
//
// This module is the seam DEC-015 reserves: a `getEmbedBackend()` resolver that
// later purposes (rerank/summarize/agent) will mirror as the local-or-cloud model
// router. P0 only wires the EMBED purpose; the shape is here so P1+ slot in
// without a rewrite (invariant I2 — built-and-inert for the other purposes).

import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { embedTexts as openAiEmbedTexts } from '../ai/embeddings'
import { getBrainEmbedBackend } from '../brainPref'

// The local model. all-MiniLM-L6-v2 (384-dim) is small (~90MB), fast on CPU, and
// strong on short-corpus retrieval — validated on the real corpus (p0-sweep.mjs).
const LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2'
export const LOCAL_EMBED_MODEL_ID = 'local:all-MiniLM-L6-v2'

export type EmbedBackend = 'local' | 'openai' | 'none'

// Narrow shape of the transformers feature-extraction pipeline we use.
interface FeaturePipeline {
  (text: string | string[], opts: { pooling: 'mean'; normalize: boolean }): Promise<{
    data: Float32Array | number[]
    dims?: number[]
  }>
}

// Lazy pipeline holder — first embed triggers model download+load; reused after.
// Mirrors ai/localWhisper.ts exactly (dynamic import so ESM-in-CJS loads cleanly
// under electron-vite; cacheDir under userData so the model persists across
// updates without re-downloading).
let localPipe: Promise<FeaturePipeline> | null = null

async function getLocalPipeline(): Promise<FeaturePipeline> {
  if (localPipe) return localPipe
  localPipe = (async () => {
    const transformers = await import('@xenova/transformers')
    const cacheDir = join(app.getPath('userData'), 'embed-cache')
    mkdirSync(cacheDir, { recursive: true })
    transformers.env.cacheDir = cacheDir
    transformers.env.allowRemoteModels = true
    const pipe = (await transformers.pipeline('feature-extraction', LOCAL_MODEL)) as unknown as FeaturePipeline
    return pipe
  })()
  return localPipe
}

/** True once the local model is loaded in memory (renderer can show a
 *  "preparing brain" hint on first use). */
export function isLocalEmbedderReady(): boolean {
  return localPipe !== null
}

/** Pre-warm the local model so the first query doesn't pay the load cost.
 *  Called when the brain is enabled. Idempotent; safe to await repeatedly. */
export async function preloadLocalEmbedder(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getLocalPipeline()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Which backend the router will use right now, given the user's preference and
// what's available. 'local' unless the user explicitly forced 'openai' (and has a
// key). Never throws — resolves to 'none' only when the caller must keyword-degrade
// (handled per-call, since local can still fail to load at embed time).
function chosenBackend(): EmbedBackend {
  return getBrainEmbedBackend() // 'local' (default) | 'openai'
}

// The result the store records so a model change can trigger a reindex.
export interface EmbedResult {
  ok: true
  vectors: number[][]
  model: string
}
export interface EmbedFail {
  ok: false
  reason: 'no_backend' | 'model_load' | 'api' | 'network' | 'no_key'
  error?: string
}

async function localEmbed(texts: string[]): Promise<EmbedResult | EmbedFail> {
  let pipe: FeaturePipeline
  try {
    pipe = await getLocalPipeline()
  } catch (err) {
    return { ok: false, reason: 'model_load', error: err instanceof Error ? err.message : String(err) }
  }
  try {
    const vectors: number[][] = []
    // The pipeline pools per call; loop to keep memory bounded on a big backfill.
    for (const t of texts) {
      const out = await pipe(t.slice(0, 8000), { pooling: 'mean', normalize: true })
      vectors.push(Array.from(out.data as ArrayLike<number>))
    }
    return { ok: true, vectors, model: LOCAL_EMBED_MODEL_ID }
  } catch (err) {
    return { ok: false, reason: 'api', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Embed a batch of texts through the router. Returns EmbedResult on success, or an
 * EmbedFail the caller treats as "degrade to keyword" (never fabricate). The chosen
 * backend is: local (default) → its result; openai (opt-in, key present) → the
 * existing OpenAI path; a local failure with an OpenAI key available auto-falls
 * back to OpenAI; otherwise EmbedFail so the caller keyword-searches.
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult | EmbedFail> {
  if (texts.length === 0) return { ok: true, vectors: [], model: 'none' }
  const backend = chosenBackend()

  if (backend === 'local') {
    const r = await localEmbed(texts)
    if (r.ok) return r
    // Local failed to load/run — try OpenAI if the user has a key, else fail to floor.
    const oa = await openAiEmbedTexts(texts)
    if (oa.ok) return { ok: true, vectors: oa.vectors, model: `openai:${oa.model}` }
    return { ok: false, reason: r.reason }
  }

  // Explicit OpenAI preference.
  const oa = await openAiEmbedTexts(texts)
  if (oa.ok) return { ok: true, vectors: oa.vectors, model: `openai:${oa.model}` }
  // OpenAI unavailable (no key) — try local as a courtesy before flooring.
  const r = await localEmbed(texts)
  if (r.ok) return r
  return { ok: false, reason: oa.reason }
}

/** Embed a single query. Returns the vector, or null → caller keyword-degrades.
 *  This is the hot path (one call per user query); local p50 ~2-5ms (measured). */
export async function embedQuery(text: string): Promise<{ vec: number[]; model: string } | null> {
  if (!text.trim()) return null
  const r = await embedTexts([text])
  return r.ok && r.vectors[0] ? { vec: r.vectors[0], model: r.model } : null
}
