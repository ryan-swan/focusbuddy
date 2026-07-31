// The ingest ADMISSION GATE for plexi-brain (I3 — defect D6 / DEC-022). Pure, DB-free,
// AI-free, so it is unit-locked in isolation (tests/unit/admission.test.ts) — the same
// posture as chunker.ts, rrf.ts, spineRerank.ts, indexReconcile.ts.
//
// ── What it is ─────────────────────────────────────────────────────────────────────
// Cerebras's T4 (figures/06): a burst must clear IDF >= 4.0 AND >= 200 chars (or carry
// reactions) to reach the embeddings table — "to prevent low-signal data from reaching the
// database." An admission gate is the thing that keeps a corpus clean AT VOLUME, where
// naive RAG's "plausible garbage" comes from. Before I3 we had no ingest gate (D6):
// everything extracted was chunked and embedded, and the only defence was a coarse 15-char
// length proxy applied at RETRIEVE time (I1-a). This subsumes that proxy with a real gate,
// run once at ingest and reused at retrieve so there is ONE definition of "is this filler".
//
// ── Why it is corpus-independent (and where the real rarity lives) ──────────────────
// Cerebras's gate is corpus-relative: IDF needs document-frequencies across the corpus. We
// deliberately do NOT compute that here, because at INGEST the corpus is mid-build (a
// chicken-and-egg: to admit by rarity you'd need the stats the admission is building). The
// corpus-relative rarity RANKING already exists where the corpus does — BM25's IDF on the
// retrieve path (I1). So this gate covers the two dimensions computable per-chunk without
// the corpus: LENGTH and a corpus-independent SIGNAL/RARITY floor. Honest division of
// labour, not a reimplementation of BM25.
//
//   admit(text) ⟺ trimmed length >= ADMIT_MIN_CHARS  AND  hasDistinctiveToken(text)
//
// ── The two floors, measured on the real corpus (379 chunks) ────────────────────────
// LENGTH (ADMIT_MIN_CHARS = 15): drops the placeholder/default stubs BM25 length-
// normalisation otherwise ranks #1 — default titles ("Untitled"/"New desk" = 8), one-word
// stickies ("with" = 4, "Test one" = 8), desk names ("Apex desk" = 9). Kept BELOW genuine
// terse content: the 28-33-char rare-token stickies the delete-path lock keeps retrievable,
// and the 17-char task "Q3 Product Launch". 15 is the same floor I1's retrieve-side proxy
// used, so the subsumption is exact.
//
// SIGNAL/RARITY (hasDistinctiveToken): a chunk must carry >= 1 token that is not pure
// boilerplate — an alphanumeric token >= 3 chars that is not a common stopword, OR any
// token containing a digit (ids/versions like `sk_test_`, `Q3`, `v2`). This is what LENGTH
// alone CANNOT do: a blank-spreadsheet grid ("A | B | ... | AV" over empty rows) is LONG but
// carries no distinctive token. This is not hypothetical — 13 such chunks are already in the
// live index from three V2 blank sheets, and F-19 (extracting V1 sheets) makes the V1 blank
// grids extractable too. A length-only gate would admit all of them; the signal floor
// rejects them while admitting real sheets (whose cells carry names/values).
//
// Measured verdict of this exact policy on the real corpus: rejects 32 of 379 chunks
// (19 short placeholders + 13 blank-grid pipe-noise), and loses ZERO fixture ground truth.
// See 05-ARCHITECTURE/I3-FORMAT-CHUNKING.md §"Admission gate — measured".

// The length floor. Also the value I1's retrieve-side filler proxy used, so replacing that
// proxy with admitChunk() changes no length behaviour — it only ADDS the signal floor.
export const ADMIT_MIN_CHARS = 15

// A token must reach this length to count as distinctive on its own (single/double letters —
// the blank-grid "A"/"B"/"AV" column headers — never do).
export const MIN_DISTINCTIVE_TOKEN_LEN = 3

// Common function words carry no signal. A chunk built only from these (plus punctuation and
// short tokens) is boilerplate, not an answer. Kept deliberately small and generic — this is
// a boilerplate floor, not a domain stoplist. Mirrors workspaceRank.ts's STOPWORDS (that one
// lives in main/ and cannot be imported into shared/; kept in lockstep by intent, not code).
const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'but', 'not', 'you', 'your',
  'our', 'its', 'has', 'have', 'had', 'will', 'can', 'all', 'any', 'out', 'who', 'what', 'when',
  'how', 'why', 'were', 'they', 'their', 'them', 'then', 'than', 'into', 'over', 'per', 'via',
  'etc', 'also', 'such', 'each', 'about', 'would', 'there', 'which', 'been', 'more', 'some',
  'one', 'two', 'get', 'got', 'use', 'using', 'new'
])

// Lowercased word tokens. Splits on every run of non-(letter|number), UNICODE-AWARE: `\p{L}`
// keeps letters from every script — CJK / Cyrillic / Greek / Arabic / Hebrew / Thai / accented
// Latin — so `sk_test_` → ['sk','test'], `café` → ['café'], and a Chinese note stays one real
// token instead of vanishing. An ASCII-only split (the pre-fix `[^a-z0-9]`) discarded every
// non-Latin character as a separator, leaving zero tokens, so admitChunk rejected ALL non-Latin
// content at ingest AND retrieve — content the brain then could not see. Deterministic + pure.
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0)
}

/**
 * The SIGNAL/RARITY floor. True iff the text carries at least one token that is not pure
 * boilerplate: an alphanumeric token >= MIN_DISTINCTIVE_TOKEN_LEN chars that is not a
 * stopword, OR any token containing a digit (an id/version/number is always distinctive).
 * A blank grid of single letters + pipes has none; real prose/table content always has some.
 */
export function hasDistinctiveToken(text: string): boolean {
  for (const t of tokenize(text)) {
    if (/[0-9]/.test(t)) return true
    if (t.length >= MIN_DISTINCTIVE_TOKEN_LEN && !STOPWORDS.has(t)) return true
  }
  return false
}

export type AdmissionReason = 'admit' | 'too-short' | 'no-signal'

/**
 * Why a chunk was admitted or rejected — for telemetry and for locks that assert the REASON,
 * not just the boolean (so a policy that starts rejecting real content for the wrong reason
 * is caught). Evaluated in the same order admitChunk() gates.
 */
export function admissionReason(text: string): AdmissionReason {
  const t = (text || '').trim()
  if (t.length < ADMIT_MIN_CHARS) return 'too-short'
  if (!hasDistinctiveToken(t)) return 'no-signal'
  return 'admit'
}

/**
 * THE admission gate. Returns true iff the chunk is allowed into the index (chunked +
 * embedded). Pure + deterministic. Applied at INGEST (indexer.writeSource, the primary D6
 * gate) and reused at RETRIEVE (rrf.fuseCandidates) so filler already in a stale index still
 * cannot take a result slot — one definition, two sites.
 */
export function admitChunk(text: string): boolean {
  return admissionReason(text) === 'admit'
}
