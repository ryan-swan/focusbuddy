// The PURE content entity-extraction floor (plexi-brain P2.7 — Layer 2: the brain
// reads people/organizations OUT of ingested canvas content and mints entity nodes).
//
// This is the layer that makes the operator's must-have real: "write Sarah anywhere —
// a doc, a sticky, a note — and the brain picks her up and references her together."
// P2.5 (Layer 1) made the content FINDABLE; this reads the ENTITIES out of it.
//
// ── The relationship to P2's extractPersonName (entityResolve.ts) ──────────────
// P2's extractor is VERB-ANCHORED ("email/tell <Name>") — perfect for a capture
// utterance. This is the free-text COMPLEMENT with the SAME core discipline: a person is
// only recognized in a PERSON-RELATIONSHIP CONTEXT (a relational cue immediately precedes
// the name — "with Sarah", "assigned to Greg", "email Michael"). Both feed the SAME
// conservative mint-when-unsure resolver (resolvePersonWithinScope) so nothing is ever
// wrong-merged.
//
// ── WHY context-gated, not shape-gated (the real-data lesson, DEC-011 §D) ───────
// The first floor extracted ANY capitalized name-shaped run. It looked clean on isolated
// notes but over-fired ~100x on the real dogfood corpus (1,652 "person" nodes for ~13
// real people). The corpus is FULL of capitalized noun-phrases that are SHAPE-IDENTICAL
// to names — product names ("Notion","Slack","Figma"), doc-structure nouns ("Project",
// "Retrieval Architecture","Brain Map"), domain jargon ("Operator","Convergence"). No
// shape rule and no frequency rule can separate "Sarah Chen" from "Brain Map" — they are
// the same shape, and the junk recurs across docs as readily as a real name. The ONE
// signal that DOES separate them is GRAMMATICAL CONTEXT: a person appears in a
// person-relationship position ("email Sarah", "handoff to Priya"); a noun-phrase heading
// does not. A dry-sim over the real corpus: shape+corroboration → 1,110 nodes (still
// junk-dominated); context-gate → ~64 candidates keeping the real people. So the floor is
// CONTEXT-GATED. The failure direction stays safe (DEC-011 §D): a bare-standing name with
// no relational cue is MISSED — harmless, the text is still keyword+semantically findable
// via P2.5 — never a FALSE person minted from a capitalized common word (which pollutes
// the graph and, once P3 unifies it cross-room, corrupts recall silently).
//
// ── The remaining guards (belt-and-suspenders on the cue gate) ─────────────────
//   • possessives ("Caleb's")            → rejected (a possessive is not a name)
//   • hyphenated compounds ("Co-working") → rejected unless EVERY segment is name-shaped
//   • stop-words ("with Friday","to Phase") → day/verb/doc-noun cues never mint a person
//   • single-token names → flagged needsCorroboration; the DRIVER mints only if the name
//     recurs across ≥2 distinct sources (a lone cue-hit like "with Notion" seen once dies)
//   • ORGANIZATIONS are context-INDEPENDENT: a capitalized phrase ending in an org suffix
//     ("Globex LLC","Acme Corp") is high-precision on its own and does NOT need a cue.
//
// An LLM-NER pass (DEC-015 router, purpose 'entity_extract') can LATER propose richer
// candidates — but it feeds this same conservative gate + the same resolver, so a wrong
// LLM guess still can't mint a junk entity without clearing the bar.
//
// PURE: no DB, no AI, no Electron — unit-testable in isolation (the split P1/P2 used).
// The driver (src/main/brain/entityExtract.ts) supplies the text; this decides the
// candidate entities; resolvePersonWithinScope decides mint-vs-link.

// A candidate entity read from content: its surface name + our guess at its type.
export interface EntityCandidate {
  name: string
  type: 'person' | 'organization'
  why: string // legible reason (which pattern fired) — feeds the receipt / provenance
  // A single-token person name (e.g. "Ryan") is minted only if it recurs across ≥2
  // distinct sources — even WITH a relational cue, a lone "with Notion" seen once is
  // noise. Multi-token full names and orgs are NEVER flagged (high-precision by shape+
  // context). The DRIVER (src/main/brain/entityExtract.ts) enforces the count.
  needsCorroboration?: boolean
}

// ── Relational cues: a lowercase word/phrase that, immediately before a capitalized
// name, marks that name as a PERSON. Union of P2's address verbs + person-relationship
// prepositions/roles/salutations. This is the primary gate — no cue, no person.
// Multi-word cues ("assigned to","owned by","loop in","spoke with") are matched too.
const PERSON_CUES: ReadonlySet<string> = new Set([
  // P2 address verbs (kept in lockstep with entityResolve.ts ADDRESS_VERBS)
  'email', 'e-mail', 'mail', 'message', 'msg', 'tell', 'ask', 'call', 'text', 'ping',
  'remind', 'notify',
  // relational prepositions that take a person object in these corpora
  'with', 'from', 'by', 'to', 'for', 'cc',
  // verbs of interaction
  'met', 'meet', 'meeting', 'spoke', 'talked', 'contact', 'reach', 'introduce', 'thank',
  'thanks', 'emailed', 'called', 'asked', 'told', 'pinged', 'assigned', 'owned',
  'reviewed', 'named', 'hired', 'onboarded',
  // salutations
  'hi', 'hey', 'hello', 'dear', 'regards'
])
// Two-word cue tails: when the token before the name is one of these AND the token before
// THAT completes a known phrase, it's a person cue ("assigned to", "owned by", "loop in",
// "spoke with", "handoff to", "reach out to"→"out to"). We handle the common 2-grams.
const TWO_WORD_CUES: ReadonlySet<string> = new Set([
  'assigned to', 'owned by', 'loop in', 'spoke with', 'handoff to', 'out to', 'over to',
  'talked to', 'reach out', 'reported to', 'reports to', 'met with', 'sent to'
])

// ── Stop-words: capitalized tokens that are NOT names even when a cue precedes them.
// (e.g. "by Friday", "to Phase 2", "with Both") — the cue gate lets these through, so
// this second guard rejects days/months/verbs/doc-nouns that a cue can precede.
const NON_NAME_WORDS: ReadonlySet<string> = new Set([
  // temporal
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'today', 'tomorrow', 'yesterday', 'january', 'february', 'march', 'april', 'may',
  'june', 'july', 'august', 'september', 'october', 'november', 'december',
  // articles / pronouns / conjunctions
  'the', 'this', 'that', 'these', 'those', 'a', 'an', 'i', 'we', 'you', 'he', 'she',
  'they', 'it', 'my', 'our', 'your', 'their', 'his', 'her', 'its',
  'and', 'but', 'or', 'if', 'when', 'then', 'so', 'because', 'also', 'however',
  'please', 'note', 'todo', 'done', 'new', 'update', 'draft', 'final', 'urgent',
  'yes', 'no', 'ok', 'okay', 'here', 'there', 'now', 'next', 'soon', 'later',
  // prepositions/qualifiers that lead phrase fragments
  'about', 'from', 'with', 'for', 'to', 'in', 'on', 'at', 'by', 'of', 'as', 'both',
  'all', 'each', 'every', 'some', 'any', 'one', 'two', 'three', 'same', 'other',
  'what', 'which', 'who', 'how', 'why', 'where',
  // imperative TASK VERBS (task titles)
  'dial', 'log', 'read', 'build', 'add', 'review', 'schedule', 'pick', 'set', 'create',
  'write', 'submit', 'define', 'gather', 'apply', 'notify', 'pack', 'pay', 'download',
  'make', 'choose', 'send', 'call', 'plan', 'test', 'ship', 'fix', 'check', 'start',
  'hold', 'treat', 'respect', 'governs', 'leaving', 'wire', 'manage', 'exchange',
  'before', 'after', 'during', 'while',
  // DOC-STRUCTURE nouns (headings/outlines)
  'phase', 'step', 'section', 'part', 'chapter', 'appendix', 'summary', 'overview',
  'intro', 'introduction', 'conclusion', 'agenda', 'checklist', 'planning', 'session'
])

// Organization suffixes — a capitalized phrase ending in one of these is an org (context-
// independent, highest-precision org signal). Avoids guessing "Acme" alone is a company.
const ORG_SUFFIXES: ReadonlySet<string> = new Set([
  'inc', 'llc', 'ltd', 'corp', 'co', 'company', 'group', 'holdings', 'partners',
  'labs', 'technologies', 'tech', 'systems', 'solutions', 'ventures', 'capital',
  'gmbh', 'ag', 'plc', 'foundation', 'institute', 'university', 'college'
])

// Normalize a token for comparison (lowercase, strip punctuation).
function norm(tok: string): string {
  return tok.toLowerCase().replace(/[.,;:!?'"()]/g, '')
}

// Strip leading/trailing punctuation WITHOUT touching internal marks (so "Nair," → "Nair"
// but "O'Brien"/"Jean-Luc" keep their internal apostrophe/hyphen).
function stripEdgePunct(tok: string): string {
  return tok.replace(/^[.,;:!?'"()[\]]+/, '').replace(/[.,;:!?'"()[\]]+$/, '')
}

// A single proper-name SEGMENT (the shape shared by a bare name and each hyphen segment):
// capital + lowercase, and it MUST END IN LOWERCASE.
//   • internal capitals allowed for real names — "McQuillian","MacDonald","DeShawn"
//   • an ALLCAPS/acronym tail is rejected — "ResilientIQ"→"…IQ","OpenAI"→"…AI" end in caps
//   • apostrophe+capital start covers O'Brien / D'Angelo (ends in lowercase "n")
//   • the optional inner group makes 2-letter names ("Bo","Xi") legal too.
const HYPHEN_SEG = `[A-Z](?:['’][A-Z])?[a-z](?:[a-zA-Z'’]*[a-z])?`

// A single proper-name TOKEN: a name-segment, OR a hyphenated name where EVERY segment is
// FULLY name-shaped ("Jean-Luc","Mary-Jane"). A hyphenated compound with any non-name
// segment ("Claude-Code-built"→"built", "Conducting-AI"→"AI") is REJECTED.
const NAME_TOKEN_RE = new RegExp(`^${HYPHEN_SEG}(?:-${HYPHEN_SEG})*$`)

// Is this token a possessive ("Caleb's","Claude's")? Not a name.
function isPossessive(tok: string): boolean {
  return /['’]s$/.test(tok)
}

// Is this a plausible proper-name token (not stop-word, not possessive, right shape)?
function isNameToken(tok: string): boolean {
  if (isPossessive(tok)) return false
  const n = norm(tok)
  if (n.length < 2) return false
  if (tok.includes('-')) {
    const segs = tok.split('-')
    if (segs.some((s) => NON_NAME_WORDS.has(s.toLowerCase()))) return false
  } else {
    if (NON_NAME_WORDS.has(n)) return false
  }
  return NAME_TOKEN_RE.test(tok)
}

function isOrgSuffixToken(tok: string): boolean {
  return ORG_SUFFIXES.has(norm(tok))
}

// Does a relational cue END at token index `nameStart` (i.e. the immediately-preceding
// token, or the preceding TWO tokens, form a person cue)? The name at nameStart is a
// person only if this returns true. nameStart===0 (sentence start, no preceding token) is
// NEVER a cue — a leading capital is far too ambiguous (safe-asymmetry).
function precededByPersonCue(tokens: string[], nameStart: number): boolean {
  if (nameStart <= 0) return false
  const prev1 = norm(tokens[nameStart - 1])
  if (PERSON_CUES.has(prev1)) return true
  if (nameStart >= 2) {
    const two = `${norm(tokens[nameStart - 2])} ${prev1}`
    if (TWO_WORD_CUES.has(two)) return true
  }
  return false
}

// Extract candidate entities from free text. Two independent recognizers:
//   1. PERSON — a name-run (1–3 name-tokens) IMMEDIATELY PRECEDED by a relational cue.
//      Single-token person names are flagged needsCorroboration (driver-gated). The
//      shape guards (possessive / hyphen-compound / stop-word / repeat-echo) still apply.
//   2. ORGANIZATION — a name-run followed by an org-suffix token ("Globex LLC"). Context-
//      independent (high precision), so it does NOT require a cue.
// Returns DEDUPED candidates (by normalized name+type), first-seen order preserved.
export function extractEntities(text: string): EntityCandidate[] {
  const raw = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return []

  const out: EntityCandidate[] = []
  const seen = new Set<string>()
  const push = (
    name: string,
    type: EntityCandidate['type'],
    why: string,
    needsCorroboration?: boolean
  ) => {
    const key = `${type}:${name.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(needsCorroboration ? { name, type, why, needsCorroboration } : { name, type, why })
  }

  const sentences = raw.split(/(?<=[.!?])\s+|\n+/)
  for (const sentence of sentences) {
    const rawTokens = sentence.split(/\s+/).filter(Boolean)
    // A token whose ORIGINAL form ends in a list/clause separator (comma/semicolon/colon)
    // is a run TERMINATOR — "Notion, Arc, Obsidian" are three separate entities, not one
    // 3-token name. We strip the separator for matching but remember it broke the run
    // (else the comma-list of tool names collapses into a fake multi-token "person").
    const tokens = rawTokens.map(stripEdgePunct).filter(Boolean)
    const breaksAfter = rawTokens
      .filter((t) => stripEdgePunct(t))
      .map((t) => /[,;:]['"”’)]?$/.test(t))
    let i = 0
    while (i < tokens.length) {
      if (!isNameToken(tokens[i])) {
        i++
        continue
      }
      const startIdx = i

      // Gather the maximal run of name-tokens (max 3), stopping before an org suffix so
      // the org branch can claim it, AND stopping right after a separator-terminated token
      // (comma/semicolon) so a list doesn't fuse into one name. If a start token is itself
      // an org-suffix word that's name-shaped ("Company"), the run is empty — step past it.
      const run: string[] = []
      while (i < tokens.length && isNameToken(tokens[i]) && !isOrgSuffixToken(tokens[i]) && run.length < 3) {
        run.push(tokens[i])
        const terminated = breaksAfter[i]
        i++
        if (terminated) break // the comma/semicolon ends this entity
      }
      if (run.length === 0) {
        i++
        continue
      }

      const cleaned = run.map((t) => t.replace(/[.,;:!?'"()]$/g, ''))

      // REPEAT-ECHO GUARD: "Apex Apex", "Project Project" — heading/echo, not a name.
      // MUST run before the org branch too, or "Apex Apex Company" mints as an org.
      let echo = false
      for (let k = 1; k < cleaned.length; k++) {
        if (cleaned[k].toLowerCase() === cleaned[k - 1].toLowerCase()) { echo = true; break }
      }
      if (echo) {
        // step past a trailing org suffix so it can't seed the next iteration
        if (i < tokens.length && isOrgSuffixToken(tokens[i])) i++
        continue
      }

      // ORGANIZATION (context-independent): run immediately followed by an org-suffix
      // token (may be ALLCAPS). Requires ≥1 preceding name-token — a bare suffix declined.
      if (i < tokens.length && isOrgSuffixToken(tokens[i])) {
        const suffix = tokens[i].replace(/[.,;:!?'"()]$/g, '')
        i++ // consume the suffix
        push([...cleaned, suffix].join(' '), 'organization', `capitalized phrase ending in "${norm(suffix)}" (org suffix)`)
        continue
      }

      // PERSON: only if a relational cue immediately precedes the run. No cue → this is a
      // bare capitalized noun-phrase (a heading, a product name, jargon) → DECLINE. This
      // is THE gate that separates "email Sarah" from "the Retrieval Architecture".
      if (!precededByPersonCue(tokens, startIdx)) continue

      // A single-token person name is minted only if it recurs across ≥2 sources (the
      // driver's corroboration gate) — flag it. Multi-token is confident → minted now.
      if (cleaned.length === 1) {
        push(cleaned[0], 'person', 'single-token name in a person-relationship context (needs corroboration)', true)
        continue
      }
      push(cleaned.join(' '), 'person', 'multi-token name in a person-relationship context')
    }
  }

  return out
}
