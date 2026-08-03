// Text embeddings via OpenAI, the model side of the semantic-retrieval
// foundation. Key-gated exactly like Whisper transcription: with an OpenAI key
// configured, text becomes vectors; without one, the caller falls back to
// keyword search and nothing is faked. The model is small and cheap
// (text-embedding-3-small, 1536 dims). A local embedding model can replace this
// later without changing callers, the contract is just "texts in, vectors out".

import { resolveOpenAIKey } from '../settingsStore'

export const EMBED_MODEL = 'text-embedding-3-small'

export type EmbedResult =
  | { ok: true; vectors: number[][]; model: string }
  | { ok: false; reason: 'no_key' | 'api' | 'network'; error?: string }

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  if (texts.length === 0) return { ok: true, vectors: [], model: EMBED_MODEL }
  const key = resolveOpenAIKey()
  if (!key) return { ok: false, reason: 'no_key' }
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts })
    })
    if (!res.ok) return { ok: false, reason: 'api', error: `HTTP ${res.status}` }
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] }
    // The API may return out of order; restore the input order by index.
    const vectors = [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
    return { ok: true, vectors, model: EMBED_MODEL }
  } catch (e) {
    return { ok: false, reason: 'network', error: String(e) }
  }
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const r = await embedTexts([text])
  return r.ok && r.vectors[0] ? r.vectors[0] : null
}
