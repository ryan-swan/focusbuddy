import { cosineSim } from '@shared/semantic'

// Semantic answer cache for workspace Q&A: when the same (or a near-identical)
// question is asked again, reuse the previous answer instead of re-billing the
// model. The question is matched by embedding similarity (embeddings are LOCAL
// and free), and correctness is guaranteed by a VERSION stamp — any workspace
// mutation bumps the version, so every cached answer from before the change is
// instantly invalid. A short TTL bounds staleness even absent a mutation. Pure +
// in-memory (session-scoped), so it unit-tests directly and never persists a
// possibly-outdated answer across sessions.

const THRESHOLD = 0.92 // cosine; only a genuinely near-identical question reuses
const MAX_ENTRIES = 50
const DEFAULT_TTL_MS = 30 * 60 * 1000

interface Entry {
  qvec: number[]
  answer: string
  citedDocIds: string[]
  version: number
  at: number
}

let entries: Entry[] = []
let version = 0

export function currentAnswerCacheVersion(): number {
  return version
}

// Call on ANY workspace mutation (document create/update/delete) — invalidates
// every cached answer written before this point, so a stale answer is impossible.
export function bumpAnswerCacheVersion(): void {
  version++
}

// Return a cached answer for a semantically-matching question, or null. A hit
// requires: same current version, within TTL, matching vector dimension, and
// cosine >= THRESHOLD. Best match wins.
export function lookupAnswer(
  qvec: number[],
  now: number,
  ttlMs = DEFAULT_TTL_MS
): { answer: string; citedDocIds: string[] } | null {
  let best: Entry | null = null
  let bestSim = THRESHOLD
  for (const e of entries) {
    if (e.version !== version) continue
    if (now - e.at > ttlMs) continue
    if (e.qvec.length !== qvec.length) continue
    const sim = cosineSim(qvec, e.qvec)
    if (sim >= bestSim) {
      best = e
      bestSim = sim
    }
  }
  return best ? { answer: best.answer, citedDocIds: best.citedDocIds } : null
}

export function storeAnswer(qvec: number[], answer: string, citedDocIds: string[], now: number): void {
  if (!qvec.length || !answer.trim()) return
  entries.push({ qvec, answer, citedDocIds, version, at: now })
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)
}

// Test-only reset.
export function _resetAnswerCache(): void {
  entries = []
  version = 0
}
