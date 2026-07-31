// The PURE cross-room same-as resolver (plexi-brain P3 — Layer 3: the brain recalls ONE
// entity across EVERY room). This is the payoff: "Caleb Wilton" mentioned in 6 rooms is
// 6 separate nodes after P2.7 (within-scope only); P3 mints `same-as` edges so a single
// recall gathers all of them (cross-room re-render), without ever silently merging.
//
// ── The safe-asymmetry KEEL, raised for cross-room (DEC-016, DEC-011 §D) ────────
// A wrong cross-room `same-as` corrupts recall SILENTLY (two unrelated "John"s in two
// rooms collapse and every fact about either is mis-attributed org-wide — worse than a
// within-scope false merge because the blast radius is the whole workspace). So the
// failure direction MUST be NOT-linking (a visible duplicate), NEVER wrong-linking. And
// because the blast radius is larger, the bar is HIGHER than P2's within-scope match:
//
//   Link two entities across rooms with `same-as` ONLY when:
//     1. TYPE matches (person↔person, organization↔organization), AND
//     2. exact normalized-name match (same bar as within-scope isConfidentMatch), AND
//     3. they are in DIFFERENT rooms (cross-room — within-room is P2's job), AND
//     4. PROVENANCE-INDEPENDENT: their mentions trace to DISTINCT source roots, not
//        echoes of one origin (DEC-011 §D Amend 1 — N restatements of one email→Slack→
//        doc chain are ONE corroboration, not N; an echo must not manufacture a link).
//
// A same-as edge is REVERSIBLE (delete the edge) — a node merge is not. We only ever
// mint edges here; the nodes stay distinct and separately walkable.
//
// PURE: no DB, no AI. The driver (src/main/brain/sameAs.ts) supplies the entity nodes +
// their provenance roots; this decides which PAIRS to link. An LLM identity-match pass
// (DEC-015 router, purpose 'entity_match') may LATER propose fuzzier candidates but
// feeds this same exact-match+independence gate, so a wrong AI guess can't mint a bad
// link. Unit-tested in isolation (sameAsResolve.test.ts) with adversarial red-green locks.

// An entity node as much as the resolver needs to compare it cross-room.
export interface SameAsEntity {
  nodeId: string
  name: string
  type: 'person' | 'organization'
  roomId: string | null
  // The DISTINCT provenance roots this entity was extracted from — a stable key per
  // independent origin (the driver derives it, e.g. the source row id, collapsing an
  // echo chain to its root). Two entities are provenance-independent iff they have at
  // least one NON-overlapping root each (neither is merely an echo of the other).
  provenanceRoots: string[]
}

// A proposed same-as link between two entity nodes (order-independent; the driver draws
// one undirected edge). `why` is the legible reason (the receipt / hover headline).
export interface SameAsLink {
  aNodeId: string
  bNodeId: string
  name: string
  type: 'person' | 'organization'
  why: string
}

// Normalize a name for cross-room comparison — identical rule to entityResolve's
// within-scope normalizer so the two layers agree on "same name" (lowercase, strip
// edge/inner punctuation, collapse whitespace). Kept local (pure module, no import cycle).
function normalizeForCompare(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Exact normalized-name match AND non-degenerate — the same confident-match bar P2 uses
// within scope. A bare first name / substring / fuzzy match is deliberately NOT enough.
function isNameMatch(a: string, b: string): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (na.length < 2 || nb.length < 2) return false
  return na === nb
}

// Provenance-independence (DEC-011 §D Amend 1): the two entities corroborate each other
// only if EACH carries at least one provenance root the OTHER does not — i.e. they are
// not merely two references to a single origin. If one entity's roots are a subset of
// the other's (a pure echo), they are NOT independent → no link (an echo must not
// manufacture a cross-room identity). Empty roots on either side ⇒ cannot establish
// independence ⇒ conservative NO (safe-asymmetry favors not-linking).
export function provenanceIndependent(aRoots: string[], bRoots: string[]): boolean {
  const a = new Set(aRoots.filter(Boolean))
  const b = new Set(bRoots.filter(Boolean))
  if (a.size === 0 || b.size === 0) return false
  const aHasOwn = [...a].some((r) => !b.has(r))
  const bHasOwn = [...b].some((r) => !a.has(r))
  return aHasOwn && bHasOwn
}

// Should these two entities be linked with a cross-room `same-as`? Applies all four
// gates. PURE + symmetric.
export function shouldLinkSameAs(a: SameAsEntity, b: SameAsEntity): boolean {
  if (a.nodeId === b.nodeId) return false // never link a node to itself
  if (a.type !== b.type) return false // gate 1: type must match
  if (!isNameMatch(a.name, b.name)) return false // gate 2: exact name
  // gate 3: DIFFERENT rooms. A null room is org-visible; two null-room entities are the
  // SAME scope (P2 already resolves those), so they are not a cross-room pair.
  if (a.roomId === b.roomId) return false
  // gate 4: provenance-independent (echoes never link).
  if (!provenanceIndependent(a.provenanceRoots, b.provenanceRoots)) return false
  return true
}

// Given all entity nodes (across every room), return the set of cross-room `same-as`
// links to mint. Deterministic: pairs are considered in a stable order and de-duplicated
// (each unordered pair yields at most one link). PURE — the driver persists the edges.
//
// Note on transitivity: we mint PAIRWISE edges (Caleb-in-A ↔ Caleb-in-B, Caleb-in-B ↔
// Caleb-in-C, …). A recall walks the `same-as` edges to gather the whole cluster; we do
// NOT collapse the cluster into one node (safe-asymmetry — edges are reversible, a merge
// is not). To avoid O(n²) noise we link each entity to the FIRST prior match found per
// (type,name) group, forming a connected chain the walk still traverses fully.
export function resolveCrossRoomSameAs(entities: SameAsEntity[]): SameAsLink[] {
  const links: SameAsLink[] = []
  // Group by (type, normalized-name) so we only compare plausible same-name candidates.
  const groups = new Map<string, SameAsEntity[]>()
  for (const e of entities) {
    const key = `${e.type}::${normalizeForCompare(e.name)}`
    if (normalizeForCompare(e.name).length < 2) continue
    const g = groups.get(key)
    if (g) g.push(e)
    else groups.set(key, [e])
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue
    // Chain-link: connect each entity to the first EARLIER entity in the group it can
    // confidently same-as (different room + provenance-independent). This yields a
    // connected component the recall walk fully traverses, without n² edges.
    for (let i = 1; i < group.length; i++) {
      for (let j = 0; j < i; j++) {
        if (shouldLinkSameAs(group[i], group[j])) {
          links.push({
            aNodeId: group[j].nodeId,
            bNodeId: group[i].nodeId,
            name: group[i].name,
            type: group[i].type,
            why: `same ${group[i].type} across rooms (exact name, provenance-independent)`
          })
          break // linked into the chain; next entity
        }
      }
    }
  }
  return links
}
