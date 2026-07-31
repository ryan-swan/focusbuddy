// The entity-extraction DRIVER (plexi-brain P2.7 — Layer 2). Reads the ingested
// canvas content (the same SourceDoc[] the indexer built from docs / notes / tasks /
// widgets), runs the PURE floor (src/shared/entityExtract.ts) over each source's text,
// and mints person/organization nodes into the P1 graph with a walkable provenance
// edge back to EVERY source that mentioned them. This is what makes the operator's
// must-have real: write "Sarah" on a sticky AND in a doc → ONE Sarah node, provenance
// to both — "picked up and referenced together".
//
// ── Idempotent + convergent (the P2 pattern, DEC-011 §D) ───────────────────────
// Within a scope (room, else org-visible), an extracted "Sarah" resolves against the
// people ALREADY in the graph via resolvePersonWithinScope — link on a confident exact
// match, else mint. So:
//   • re-indexing the same content does NOT duplicate the entity (it re-resolves to the
//     same node);
//   • an entity extracted from content CONVERGES with a person minted by P2 capture
//     (both use the same within-scope resolver over the same person nodes).
// The provenance edge is idempotent too (ensureNodeEdge) — re-running adds no dupes.
//
// ── Confidence-honest (I4) ─────────────────────────────────────────────────────
// An extracted entity is stamped 'inferred', NOT 'typed' — we READ a name in prose, we
// did not CONFIRM an identity. The store-anyway floor (P2.5) already keeps the raw text
// findable regardless, so a missed or low-confidence entity loses nothing.
//
// ── Safe-asymmetry, and cross-room is NOT here ─────────────────────────────────
// Resolution is WITHIN-SCOPE only (same room, else org-visible) — exactly P2's rule.
// Two "Sarah"s extracted in different rooms stay SEPARATE nodes; P3's cross-room
// `same-as` unifies them later. The failure direction is a duplicate (harmless), never
// a wrong cross-room merge (corrupting).
//
// DEC-012: the whole driver is gated on isBrainEnabled() by its caller (the indexer,
// which only runs on the brain path). No AI here — the deterministic floor supplies the
// candidates; the DEC-015 router LLM-NER pass ('entity_extract' purpose) is reserved but
// INERT (built in a later increment, feeding this same conservative resolver).
//
// ⚠ DEC-014: entity TYPE is person|organization (universal structural primitives), read
// from name shape — never a domain inference. This driver imports no domain vocabulary.

import { createBrainNode, listBrainNodes } from '../db/brainNodes'
import { ensureProvenance } from '../db/brainEdges'
import { extractEntities, type EntityCandidate } from '@shared/entityExtract'
import { resolvePersonWithinScope, type PersonCandidate } from '@shared/entityResolve'
import type { NodeType, BrainNode } from '@shared/brainGraph'

// The minimal shape the driver needs per source — a subset of the indexer's SourceDoc.
// (sourceTable/sourceId identify the source for the provenance edge; roomId scopes
// resolution; text is what we read entities out of.)
export interface EntitySource {
  sourceTable: string // e.g. 'documents' | 'fb_knowledge' | 'nodes' | 'widgets'
  sourceId: string
  roomId: string | null
  text: string
}

export interface EntityExtractResult {
  sourcesScanned: number
  candidatesFound: number
  personsLinked: number
  personsMinted: number
  orgsLinked: number
  orgsMinted: number
}

// Map a chunk/index sourceType to the base table name the provenance leaf records.
// (The indexer's SourceDoc.sourceType is a logical name; provenance stores the real
// table so the walkable edge lands on the right row. 'widget' → the widgets table.)
const SOURCE_TYPE_TO_TABLE: Record<string, string> = {
  knowledge: 'fb_knowledge',
  document: 'documents',
  task: 'nodes',
  widget: 'widgets'
}

// Resolve an already-extracted candidate against the entity nodes of its type already
// in scope (same room, or org-visible null-room) — link on a confident match, else
// mint. Returns the node id + whether it was linked or minted. WITHIN-SCOPE only.
function resolveOrMintEntity(
  candidate: EntityCandidate,
  roomId: string | null,
  existing: BrainNode[]
): { nodeId: string; action: 'link' | 'mint' } {
  const type: NodeType = candidate.type === 'organization' ? 'organization' : 'person'

  // Candidates in scope: same-type nodes in this room, plus org-visible (null-room).
  const inScope: PersonCandidate[] = existing
    .filter((n) => n.type === type)
    .filter((n) => n.roomId === roomId || n.roomId === null)
    .map((n) => ({ nodeId: n.id, name: n.title }))

  // Reuse P2's conservative exact-name resolver (safe-asymmetry) for BOTH types —
  // the match rule (exact normalized name) is type-agnostic.
  const resolved = resolvePersonWithinScope(candidate.name, inScope)
  if (resolved.action === 'link' && resolved.matchedNodeId) {
    return { nodeId: resolved.matchedNodeId, action: 'link' }
  }

  const minted = createBrainNode({
    type,
    title: resolved.normalizedName,
    roomId,
    // Read a name in prose ≠ confirmed identity → inferred, honestly (I4).
    confidence: 'inferred'
  })
  return { nodeId: minted.id, action: 'mint' }
}

// The corroboration threshold: a single-token candidate (flagged needsCorroboration by
// the pure floor) is minted only if it appears in AT LEAST this many DISTINCT sources.
// 2 = "seen twice, in two different places". Real people recur across a corpus (a name
// in a doc AND a task AND a widget); once-seen capitalized common words ("Dial","Phase",
// "Both") do not. This is the primary fix for the 1,098-node single-token noise class —
// see the P2.7-hardening note in src/shared/entityExtract.ts. Multi-token full names and
// orgs are NEVER gated (their shape alone is high-precision).
const CORROBORATION_MIN_SOURCES = 2

// Corroboration key for a candidate = type + normalized surface name (case-insensitive).
// Distinct-source counting is by this key so "Ryan" in a doc and "Ryan" in a task count
// as two sightings of the same candidate.
function corroborationKey(c: EntityCandidate): string {
  return `${c.type}:${c.name.toLowerCase()}`
}

// Extract entities from a batch of ingested sources and mint/link them into the graph.
// Each mention draws a provenance leaf to the source row, so a hover on the entity walks
// back to every place it was named. Idempotent.
//
// TWO-PASS (the corroboration gate, P2.7-hardening):
//   Pass 1 — run the PURE floor over every source; tally each candidate's DISTINCT-source
//            count (the state the per-text floor can't see). This is where a lone "Ryan"
//            proves it recurs while a lone "Dial" reveals it appeared once.
//   Pass 2 — mint/link, but SKIP any needsCorroboration candidate seen in < 2 sources.
// The floor stays pure/stateless; the stateful cross-source count lives here (where the
// source batch already is). Keeps both layers independently testable.
export function extractEntitiesFromSources(sources: EntitySource[]): EntityExtractResult {
  const result: EntityExtractResult = {
    sourcesScanned: 0,
    candidatesFound: 0,
    personsLinked: 0,
    personsMinted: 0,
    orgsLinked: 0,
    orgsMinted: 0
  }

  // ── Pass 1: extract candidates per source + count distinct sources per candidate. ──
  // Cache the per-source candidate lists so Pass 2 doesn't re-run the floor.
  const perSource: EntityCandidate[][] = new Array(sources.length)
  const distinctSourceCount = new Map<string, Set<string>>() // key → set of sourceIds
  for (let s = 0; s < sources.length; s++) {
    const src = sources[s]
    const candidates = extractEntities(src.text)
    perSource[s] = candidates
    for (const cand of candidates) {
      const key = corroborationKey(cand)
      let set = distinctSourceCount.get(key)
      if (!set) distinctSourceCount.set(key, (set = new Set<string>()))
      set.add(src.sourceId)
    }
  }

  // A candidate clears the gate if it's not flagged OR it recurs across ≥2 sources.
  const isCorroborated = (cand: EntityCandidate): boolean => {
    if (!cand.needsCorroboration) return true
    const set = distinctSourceCount.get(corroborationKey(cand))
    return (set?.size ?? 0) >= CORROBORATION_MIN_SOURCES
  }

  // Snapshot existing nodes once; append minted ones so later sources in this pass can
  // resolve to entities minted earlier in the same pass (convergence within the batch).
  const known: BrainNode[] = listBrainNodes()

  // ── Pass 2: mint/link the corroborated candidates only. ──
  for (let s = 0; s < sources.length; s++) {
    const src = sources[s]
    const candidates = perSource[s].filter(isCorroborated)
    if (candidates.length === 0) continue
    result.sourcesScanned++
    result.candidatesFound += candidates.length

    const provTable = SOURCE_TYPE_TO_TABLE[src.sourceTable] ?? src.sourceTable

    for (const cand of candidates) {
      const { nodeId, action } = resolveOrMintEntity(cand, src.roomId, known)

      // Provenance: entity --produced--> the source row it was read from (walkable back
      // to "where this name appeared"). Idempotent — re-running adds no dupes.
      ensureProvenance(nodeId, { table: provTable, id: src.sourceId }, 'inferred')

      // Tally + keep the in-pass snapshot current so a second mention this pass links.
      if (cand.type === 'organization') {
        action === 'link' ? result.orgsLinked++ : result.orgsMinted++
      } else {
        action === 'link' ? result.personsLinked++ : result.personsMinted++
      }
      if (action === 'mint') {
        known.push({
          id: nodeId,
          roomId: src.roomId,
          type: cand.type === 'organization' ? 'organization' : 'person',
          title: cand.name
          // the rest of the BrainNode fields are unused by resolveOrMintEntity's filter
        } as BrainNode)
      }
    }
  }

  return result
}

// Re-export so the indexer can build EntitySource[] from its SourceDoc[] without a
// second collection pass (kept in lockstep with SOURCE_TYPE_TO_TABLE above).
export { SOURCE_TYPE_TO_TABLE as ENTITY_SOURCE_TABLES }
