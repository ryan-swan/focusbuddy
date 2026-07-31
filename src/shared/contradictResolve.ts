// The PURE numeric-claim contradiction resolver (plexi-brain P3 — Layer 3: the everyday
// "plausible garbage" guard). When two provenance-independent sources assert DIFFERENT
// numeric values for the SAME subject ("precision was 85%" vs "100 versus 70 on
// precision"), retrieval should not silently surface one as truth — it should flag that
// the sources DISAGREE. This resolver finds those conflicts; the driver mints a
// `contradicts` edge; retrieval annotates the result with a "sources disagree" chip.
//
// ── Scope: NUMERIC claims only (the highest-signal, lowest-false-positive class) ─
// A claim = (subject, value, unit?) read from text: a salient subject term near a number.
// Two claims CONTRADICT iff:
//   1. SAME normalized subject term, AND
//   2. their numeric values DIFFER beyond a small relative tolerance (a paraphrase
//      "~85%" vs "85 percent" is the SAME value → NOT a contradiction), AND
//   3. they are PROVENANCE-INDEPENDENT (distinct source roots — an echo of one origin
//      restated is one claim, not a disagreement; DEC-011 §D Amend 1).
// Non-numeric attribute conflict ("Greg is PM" vs "Greg is designer") is deliberately
// OUT of scope for this deterministic floor — it is false-positive-prone and against the
// safe-asymmetry keel; the DEC-015 LLM analysis pass can propose those later, feeding a
// gate like this one.
//
// ── The safe-asymmetry KEEL (DEC-016, DEC-011 §D) ──────────────────────────────
// A FALSE `contradicts` annotates a correct result with a wrong "sources disagree" chip —
// it erodes trust in the brain's judgment. So the failure direction MUST be MISSING a
// contradiction (the result is just un-annotated — no worse than today), NEVER flagging a
// false one. The floor declines on any doubt: no clear shared subject, no clear numeric
// value, same value within tolerance, or shared provenance ⇒ NO contradiction.
//
// PURE: no DB, no AI. The driver (src/main/brain/contradicts.ts) supplies the source
// texts + their provenance roots; this decides which PAIRS conflict. An LLM claim-
// extraction pass (DEC-015 router) may LATER propose richer claims but feeds this same
// conflict+independence gate. Unit-locked in contradictResolve.test.ts (red-green).

// A numeric claim read from a source's text.
export interface NumericClaim {
  subject: string // normalized salient subject term the number is about (e.g. "precision")
  value: number // the numeric value asserted
  unit: string | null // "%" | "percent" normalized to "%", else null (raw number)
  raw: string // the surface snippet the claim was read from (the receipt)
}

// A source (with its text + independence key) fed to the contradiction finder.
export interface ClaimSource {
  sourceId: string // stable id of THIS source row (the provenance root — echoes share it)
  roomId: string | null
  text: string
}

// A detected contradiction between two sources' claims about the same subject.
export interface Contradiction {
  aSourceId: string
  bSourceId: string
  subject: string
  aValue: number
  bValue: number
  why: string // legible receipt headline
}

// ── Subject vocabulary: we only mint a claim when a number sits near a KNOWN salient
// subject term. This is deliberately conservative (safe-asymmetry) — a bare number with
// no recognized subject is NOT a claim. The set is small + domain-general (measurable
// quantities); the DEC-015 pass can widen it. Kept lowercase-normalized.
const SUBJECT_TERMS: ReadonlySet<string> = new Set([
  'precision', 'recall', 'accuracy', 'latency', 'throughput', 'coverage', 'f1',
  'confidence', 'cost', 'price', 'revenue', 'arr', 'mrr', 'churn', 'retention',
  'conversion', 'uptime', 'error', 'errors', 'speed', 'score', 'rate', 'ratio',
  'percentage', 'margin', 'growth', 'usage', 'adoption', 'engagement'
])

// Window (in tokens) within which a number is considered "about" a subject term.
const SUBJECT_WINDOW = 6

// Relative tolerance: two values within this fraction of each other are the SAME claim
// (a paraphrase / rounding), not a contradiction. 0.05 = 5%. "~85%" vs "85 percent" =
// identical; "85" vs "100" = 17.6% apart → a genuine conflict.
const REL_TOLERANCE = 0.05

// Normalize a subject term for comparison (lowercase, strip punctuation).
function normSubject(s: string): string {
  return s.toLowerCase().replace(/[.,;:!?'"()]/g, '').trim()
}

// Parse a numeric token → a finite number, or null. Handles "85", "85%", "85.5",
// "1,200", and a leading/trailing % (unit detected separately). Rejects years-ish bare
// 4-digit numbers only when clearly a date is out of scope here (kept simple: any finite
// number qualifies; the subject-proximity gate is what makes it a claim).
function parseNumber(tok: string): number | null {
  const cleaned = tok.replace(/[%,]/g, '')
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// Extract numeric claims from free text. For each number token, look for a SUBJECT term
// within SUBJECT_WINDOW tokens on EITHER side; if found, mint a claim (subject, value,
// unit). A number with no nearby subject is NOT a claim (conservative). Multiple numbers
// near one subject each yield a claim (so "100 versus 70 on precision" → two claims, both
// about precision — the cross-source gate + tolerance decide conflict). Deduped by
// (subject,value,unit). PURE.
export function extractNumericClaims(text: string): NumericClaim[] {
  const raw = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return []
  const tokens = raw.split(/\s+/)

  // Precompute the normalized form + whether each token is a subject term / a number.
  const norm = tokens.map(normSubject)
  const isSubject = norm.map((t) => SUBJECT_TERMS.has(t))

  const out: NumericClaim[] = []
  const seen = new Set<string>()
  for (let i = 0; i < tokens.length; i++) {
    // A percent word ("percent"/"%") attaches to the PREVIOUS number; detect the value.
    const value = parseNumber(tokens[i])
    if (value === null) continue

    // unit: this token ends in %, or the NEXT token is "percent"/"%".
    let unit: string | null = null
    if (/%$/.test(tokens[i])) unit = '%'
    else if (i + 1 < tokens.length && /^(percent|percent\.|%)$/i.test(norm[i + 1])) unit = '%'

    // Find the nearest subject term within the window on either side.
    let subject: string | null = null
    for (let d = 1; d <= SUBJECT_WINDOW; d++) {
      if (i - d >= 0 && isSubject[i - d]) { subject = norm[i - d]; break }
      if (i + d < tokens.length && isSubject[i + d]) { subject = norm[i + d]; break }
    }
    if (!subject) continue // a number with no nearby subject term is not a claim

    const key = `${subject}:${value}:${unit ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ subject, value, unit, raw: tokens.slice(Math.max(0, i - 3), i + 3).join(' ') })
  }
  return out
}

// Do these two numeric values conflict (differ beyond the relative tolerance)?
// Equal-within-tolerance = the SAME claim (paraphrase/rounding) → NOT a conflict.
export function valuesConflict(a: number, b: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9)
  return Math.abs(a - b) / scale > REL_TOLERANCE
}

// Given all claim-sources, return the cross-source contradictions to mint. Two sources'
// claims contradict when: same subject + conflicting values + DIFFERENT sourceIds
// (provenance-independent — an echo restated in the same row is one claim). We compare
// each source's claims against every OTHER source's claims per shared subject. Returns at
// most one contradiction per (sourceA, sourceB, subject) pair (the first conflicting value
// pair found). PURE — the driver persists the edges.
export function resolveContradictions(sources: ClaimSource[]): Contradiction[] {
  // Extract claims once per source, indexed by subject for fast cross-source comparison.
  const perSource = sources.map((s) => ({ s, claims: extractNumericClaims(s.text) }))

  const out: Contradiction[] = []
  const emitted = new Set<string>() // dedupe (a,b,subject) unordered
  for (let i = 0; i < perSource.length; i++) {
    for (let j = i + 1; j < perSource.length; j++) {
      const A = perSource[i]
      const B = perSource[j]
      // provenance-independence: distinct source rows. (Same sourceId = the same origin,
      // never a disagreement with itself.) Different rooms is NOT required — two rooms'
      // docs can disagree, but so can two org-visible docs; the source-root distinction is
      // the independence signal that matters here.
      if (A.s.sourceId === B.s.sourceId) continue

      for (const ca of A.claims) {
        for (const cb of B.claims) {
          if (ca.subject !== cb.subject) continue
          if (!valuesConflict(ca.value, cb.value)) continue
          const pairKey = [A.s.sourceId, B.s.sourceId].sort().join('|') + '::' + ca.subject
          if (emitted.has(pairKey)) continue
          emitted.add(pairKey)
          out.push({
            aSourceId: A.s.sourceId,
            bSourceId: B.s.sourceId,
            subject: ca.subject,
            aValue: ca.value,
            bValue: cb.value,
            why: `sources disagree on ${ca.subject} (${ca.value}${ca.unit ?? ''} vs ${cb.value}${cb.unit ?? ''})`
          })
        }
      }
    }
  }
  return out
}
