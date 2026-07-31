// The PURE within-scope entity resolver (plexi-brain P2 — the sharpest edge).
//
// When capture births a task from "email Sarah the deck", it should link that task to
// the PERSON Sarah — resolving "Sarah" against the people already in the graph. This
// is entity resolution, and it is the single riskiest operation in the whole brain:
// a WRONG merge silently corrupts trust (two different Sarahs collapse into one and
// every fact about either is now attributed to a person who isn't real), while a
// missed merge is merely a visible, harmless duplicate that P3's `same-as` unifies
// later. So the discipline is DEC-011 §D SAFE ASYMMETRY:
//
//   MERGE ONLY WHEN CONFIDENT. The failure direction MUST be "mint a duplicate",
//   NEVER "merge the wrong two". When unsure, create a new node.
//
// ── Scope (P2 vs P3) ───────────────────────────────────────────────────────────
// P2 does WITHIN-SCOPE resolution only: match against existing person nodes in the
// SAME room/org scope the caller passes. Full CROSS-ROOM unification (minting a
// `same-as` edge between two rooms' Sarahs) is P3 — deliberately NOT here. So a
// duplicate across rooms is EXPECTED in P2 and correct; P3 resolves it safely later.
//
// PURE: no DB, no AI. The driver (src/main/brain/capture.ts) supplies the candidate
// people it read from the graph; this decides match-or-mint. An LLM extraction pass
// (DEC-015 router) may LATER propose the name/candidates, but the match DECISION stays
// this conservative deterministic rule so it can be red-green-locked against false
// merges (entityResolve.test.ts).

// A person already in the graph, as much as the resolver needs to compare.
export interface PersonCandidate {
  nodeId: string
  name: string // the person node's title
}

// The outcome: either link to an existing node, or mint a new one. `matchedNodeId`
// is set iff we are CONFIDENT it's the same person; otherwise mint.
export interface ResolveResult {
  action: 'link' | 'mint'
  matchedNodeId: string | null // set only on 'link'
  normalizedName: string // the name to store on a minted node (cleaned, original case-ish)
  why: string // legible reason (the receipt headline)
}

// Normalize a name for COMPARISON only (never for storage): lowercase, collapse
// whitespace, strip surrounding punctuation. Storage keeps the caller's original.
function normalizeForCompare(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Clean a name for STORAGE (trim + collapse inner whitespace; preserve case).
export function cleanName(name: string): string {
  return (name ?? '').replace(/\s+/g, ' ').trim()
}

// The confidence bar for a MERGE. We only link when the normalized names are an EXACT
// match (after normalization) AND the name is non-degenerate (has real content). A
// substring / fuzzy / first-name-only match is DELIBERATELY not enough — "Sarah" does
// NOT confidently match "Sarah Chen" or "Sarah Jones" (which of them? unknowable from
// a bare first name), so it mints. This is the safe-asymmetry bar made concrete: an
// ambiguous match is a NON-match, which mints a harmless duplicate rather than
// guessing wrong. Cross-room / fuzzier matching with corroboration is P3.
function isConfidentMatch(a: string, b: string): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (na.length < 2 || nb.length < 2) return false // degenerate → never merge
  return na === nb
}

// Resolve a captured person name against the candidate people already in scope.
// Returns 'link' with a matchedNodeId ONLY when exactly ONE candidate is a confident
// match. If ZERO match → mint. If MORE THAN ONE candidate matches (genuine ambiguity —
// two people share the exact name in scope) → mint a new distinct node rather than
// guessing which existing one is meant (safe asymmetry: never pick wrong). PURE.
export function resolvePersonWithinScope(rawName: string, candidates: PersonCandidate[]): ResolveResult {
  const normalized = cleanName(rawName)
  if (normalizeForCompare(normalized).length < 2) {
    // Nothing usable to resolve — mint a placeholder rather than merging into anyone.
    return { action: 'mint', matchedNodeId: null, normalizedName: normalized || 'Unknown person', why: 'no usable name to match' }
  }

  const matches = candidates.filter((c) => isConfidentMatch(normalized, c.name))

  if (matches.length === 1) {
    return {
      action: 'link',
      matchedNodeId: matches[0].nodeId,
      normalizedName: normalized,
      why: `exact-name match to an existing person in scope`
    }
  }
  if (matches.length === 0) {
    return { action: 'mint', matchedNodeId: null, normalizedName: normalized, why: 'no confident match in scope — minting (a duplicate is safe; a wrong merge is not)' }
  }
  // >1 exact match in scope = genuine ambiguity. Minting is the safe move; do NOT pick.
  return {
    action: 'mint',
    matchedNodeId: null,
    normalizedName: normalized,
    why: `${matches.length} people share this exact name in scope — minting rather than guessing which`
  }
}

// ── Extract a candidate person name from an utterance (deterministic, conservative) ─
// A minimal, explicit extractor for the common capture shape "email/message/tell
// <Name> ...". It is intentionally cautious: it fires only on a clear leading verb +
// capitalized name, and returns null otherwise (no person → no person edge, which is
// fine — the task node still exists; store-anyway floor). An LLM extraction pass
// (DEC-015) can supersede this with richer NER, combined via the same mint-when-unsure
// rule. Returns the raw name (caller cleans + resolves).
const ADDRESS_VERBS = ['email', 'e-mail', 'mail', 'message', 'msg', 'tell', 'ask', 'call', 'text', 'ping', 'remind', 'notify']

export function extractPersonName(utterance: string): string | null {
  const text = (utterance ?? '').trim()
  if (!text) return null
  // Match "<verb> <Name>" where Name starts with a capital letter (a proper name).
  // Captures one or two capitalized tokens (first / first+last) — never a whole clause.
  const verbAlt = ADDRESS_VERBS.map((v) => v.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|')
  const re = new RegExp(`\\b(?:${verbAlt})\\s+([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)?)\\b`)
  const m = text.match(re)
  if (!m) return null
  // Guard: don't capture a capitalized common word that isn't a name in this slot
  // (e.g. "email Monday's notes"). A trailing possessive/'s or a known non-name word
  // makes it not a person — conservative: on doubt, return null (no false person).
  const candidate = m[1].trim()
  if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow|Yesterday)$/i.test(candidate)) {
    return null
  }
  return candidate
}
