// The plexi-brain indexer (P0). Turns the workspace corpus into an embedded chunk
// index: read each source → extract text → chunk (pure chunker) → embed (router)
// → write fb_chunks + fb_embeddings, populating the reserved graph-ready columns.
//
// Sources indexed in P0 (the same three pools retrieveSources grounds on):
//   • knowledge (fb_knowledge)  — curated truth
//   • documents (documents)     — doc/sheet/slides, extracted via extractDocText
//   • tasks     (nodes.kind=task) — title + description
// (tables/notes are keyword-only in P0's extras path; they can be indexed later —
//  the chunk store is source-type-agnostic, so adding them is additive.)
//
// IDEMPOTENT + INCREMENTAL: each source's chunks are keyed by a content hash of
// (text + chunk params). replaceChunksForSource swaps a source's chunk set
// atomically, and we skip re-embedding when the content hash set is unchanged, so
// re-running the indexer after an edit only touches what changed.
//
// DEC-012: the only external cost is embedding, and P0's default backend is LOCAL
// (free). With no local model AND no OpenAI key, embedTexts fails → we still write
// the chunk rows (keyword-findable, the store-anyway floor I3) but skip vectors;
// retrieval degrades to keyword. Never blocks, never fabricates.

import { createHash } from 'crypto'
import { collectSources, INTERNAL_CONNECTORS } from './connectors/registry'
import type { SourceDoc } from './connectors/types'
import {
  replaceChunksForSource,
  countChunks,
  existingHashesForSource,
  chunkLineageForSource,
  applyChunkLineage,
  listIndexedSourceRefs,
  type ChunkDraft
} from '../db/chunks'
import { planReconcile, type SourceRef } from '@shared/indexReconcile'
import { removeSources, type RemovalResult } from './removal'
import { getActiveOrgId } from '../db/activeOrg'
import { isBrainEnabled } from '../brainPref'
import { setEmbedding } from '../db/embeddings'
import { chunkText, CHUNK_SIZE, CHUNK_OVERLAP } from './chunker'
import { admitChunk } from '@shared/admission'
import { embedTexts } from './embedder'
import { projectGraph, type ProjectionResult } from './projector'
import { deriveAllImportance, type ImportanceResult } from './importanceEngine'
import { extractEntitiesFromSources, type EntitySource, type EntityExtractResult } from './entityExtract'
import { materializeCrossRoomSameAs, type SameAsResult } from './sameAs'
import { materializeContradictions, type ContradictResult, type ContradictSource } from './contradicts'

// Collection runs through the CONNECTOR REGISTRY (I2 — the D8 inversion). The SourceDoc
// shape, the per-connector reconcile-coverage discipline (runConnectors), and the four
// internal connectors (knowledge / document / task / widget) all live under ./connectors/.
// This module owns everything DOWNSTREAM of collection: chunking, embedding, the graph
// passes, and the I0b reconcile pass.

function hashChunk(text: string): string {
  return createHash('sha256').update(`${CHUNK_SIZE}:${CHUNK_OVERLAP}:${text}`).digest('hex').slice(0, 16)
}

interface WriteResult {
  chunksWritten: number
  chunksEmbedded: number
  embedModel: string | null
  embedFailed: boolean
  /** I2b: chunks whose LINEAGE was re-stamped in place (text unchanged). See below. */
  chunksRestamped: number
  /** I3: PRE-EXISTING chunks this write deleted — the write-side churn. Non-zero when a
   *  source is re-chunked (old set replaced) OR the admission gate cleared it to zero. Kept
   *  so the corpus chunk-count stays exactly attributable (chunksWritten − chunksReplaced). */
  chunksReplaced: number
}

// Chunk → hash → (skip if unchanged) → write → embed, for ONE source.
//
// Extracted at I2b so the whole-corpus pass (buildIndex) and the live per-source pass
// (reindexSources) share ONE definition of what indexing a source means. They previously
// could not diverge because only one existed; now that there are two callers, sharing the
// body is what keeps "indexed by an edit" and "indexed by a rebuild" the same operation.
async function writeSource(src: SourceDoc, force: boolean): Promise<WriteResult> {
  const out: WriteResult = {
    chunksWritten: 0,
    chunksEmbedded: 0,
    embedModel: null,
    embedFailed: false,
    chunksRestamped: 0,
    chunksReplaced: 0
  }
  // I3 (DEC-022) — the FORMAT-AWARE LADDER. The connector declares the strategy from the
  // source's format ('table' for a sheet, 'markdown' for a raw-markdown widget, else 'prose');
  // absent ⇒ 'prose', byte-identical to pre-I3.
  const pieces = chunkText(src.text, {
    size: CHUNK_SIZE,
    overlap: CHUNK_OVERLAP,
    strategy: src.chunkStrategy ?? 'prose'
  })

  // I3 (D6 / DEC-022) — THE ADMISSION GATE. Reject low-signal chunks (blank-grid noise,
  // placeholder stubs) BEFORE they are chunked into the index or embedded, so noise never
  // reaches the store. Filtered per-chunk (keep chunkIndex tied to the pre-filter position so
  // ids stay stable), so a real source keeps its real chunks and drops only its noise. `drafts`
  // MAY be empty afterwards — a source that is entirely noise (a blank grid) or a real source
  // edited down to filler — which is handled below exactly like a removal.
  const drafts: ChunkDraft[] = pieces
    .map((text, i) => ({
      id: `chunk-${src.sourceType}-${src.sourceId}-${i}`,
      sourceType: src.sourceType,
      sourceId: src.sourceId,
      chunkIndex: i,
      title: src.title,
      text,
      contentHash: hashChunk(text),
      roomId: src.roomId,
      chunkDate: src.chunkDate,
      sourceKind: src.sourceKind,
      sensitivity: null // reserved; unset in P0 (no per-source sensitivity yet)
    }))
    .filter((d) => admitChunk(d.text))

  // Incremental skip: if this source's chunk set is byte-identical to what's
  // already indexed (same hashes, same count), leave it untouched — the expensive
  // re-embed is avoided. `force` re-indexes regardless.
  //
  // ── I2b: the skip is LINEAGE-AWARE (found by brainLiveIngest.spec.ts LOCK 9) ──────
  // The content hash covers the chunk TEXT only, so before I2b a change to a source's
  // LINEAGE — a desk dragged into another room, a widget renamed — was invisible to this
  // test and the source kept its old stamp forever, on the live path AND on a full
  // rebuild. That is not a cosmetic staleness: `room_id` is the retrieval aperture, the
  // privacy boundary and the tenancy boundary in one column (DEC-018), so a desk moved
  // from Room A to Room B went on answering under Room A. `title` matters too — it has
  // been an indexed FTS column since I1, so a rename must reach the lexical leg.
  //
  // Text unchanged + lineage changed therefore takes a cheap in-place re-stamp rather
  // than a full rewrite: same text, same vectors, one UPDATE.
  if (!force) {
    const existing = existingHashesForSource(src.sourceType, src.sourceId)
    const unchanged =
      existing.size === drafts.length && drafts.every((d) => existing.has(d.contentHash))
    if (unchanged) {
      const current = chunkLineageForSource(src.sourceType, src.sourceId)
      const moved =
        current !== null &&
        (current.roomId !== (src.roomId ?? null) ||
          current.title !== src.title ||
          current.sourceKind !== (src.sourceKind ?? null))
      if (moved) {
        out.chunksRestamped = applyChunkLineage(src.sourceType, src.sourceId, {
          roomId: src.roomId ?? null,
          title: src.title,
          sourceKind: src.sourceKind ?? null
        })
      }
      return out
    }
  }

  // Write the chunk rows first (store-anyway floor I3 — even if embedding fails,
  // the text is persisted + keyword-findable). When `drafts` is EMPTY (the admission gate
  // rejected everything — a blank grid, an empty desk, a real source edited down to filler)
  // this deletes any previously-indexed chunks + their embeddings, making the stale content
  // stop being retrievable at once. It deliberately does NOT touch the source's projected
  // graph node: unlike collectOne→null (the source is GONE), the source still EXISTS — only
  // its content is unindexable — so its structural node (the blank sheet, the empty desk)
  // correctly persists. The next buildIndex re-derives the graph from the current base rows.
  out.chunksReplaced = replaceChunksForSource(src.sourceType, src.sourceId, drafts)
  out.chunksWritten = drafts.length
  if (drafts.length === 0) return out // nothing admitted → nothing to embed

  // Embed the chunks through the router (local-first). A failure here leaves the
  // chunks keyword-findable; it never aborts the index.
  const res = await embedTexts(drafts.map((d) => d.text))
  if (res.ok) {
    out.embedModel = res.model
    drafts.forEach((d, i) => {
      const vec = res.vectors[i]
      if (vec) {
        setEmbedding('chunk', d.id, vec, res.model)
        out.chunksEmbedded++
      }
    })
  } else {
    out.embedFailed = true
  }
  return out
}

export interface IndexResult {
  sourcesIndexed: number
  chunksWritten: number
  /** I3: pre-existing chunks deleted by the write passes (re-chunk churn + admission-gate
   *  clears). The corpus delta is exactly `chunksWritten − chunksReplaced − reconcile.chunksRemoved`. */
  chunksReplaced: number
  chunksEmbedded: number
  embedModel: string | null
  embedFailed: boolean       // true when embedding was unavailable → keyword-only index
  totalChunks: number        // fb_chunks count for the org after indexing
  // P1: the object graph materialized from the same corpus this pass (the migration
  // posture — projection rides the index trigger). Null only if projection is ever
  // disabled; today it always runs when the index runs.
  projection: ProjectionResult | null
  // P1 (DEC-014): the derived-importance pass over the projected graph — the
  // "detect your foundational nodes" engine. Null if it fails (never aborts the index).
  importance: ImportanceResult | null
  // P2.7 (Layer 2): person/organization entities read OUT of the ingested content and
  // minted/linked into the graph (the "write Sarah anywhere → picked up" pass). Null if
  // it fails (never aborts the index).
  entities: EntityExtractResult | null
  // P3 (Layer 3): cross-room `same-as` edges minted between confidently-identical entities
  // in different rooms (the "one Caleb across every room" pass). Null if it fails.
  sameAs: SameAsResult | null
  // P3 (Layer 3): `contradicts` edges minted between sources that disagree on a numeric
  // claim (the "sources disagree" guard). Null if it fails.
  contradicts: ContradictResult | null
  // I0b (THE DELETE PATH): what this pass REMOVED — sources that were indexed but the
  // scan no longer yields (trashed, purged, or on a container the user deleted). Its
  // `removed` array is the tombstone stream of the Connector contract (spec §5). Null
  // only if reconciliation itself fails (never aborts the index).
  reconcile: RemovalResult | null
}

export interface ReindexResult {
  /** Sources whose chunk set was rewritten (content changed) OR CLEARED to zero by the I3
   *  admission gate (a live source edited down to pure noise — its chunk set changed N→0). */
  sourcesReindexed: number
  /** Sources that were up to date — the content-hash skip fired. */
  sourcesUnchanged: number
  /** Sources that are no longer indexable and were REMOVED (see the null contract below). */
  sourcesRemoved: number
  /** I2b: chunks re-stamped in place because only the source's LINEAGE moved (a desk
   *  dragged to another room, a widget renamed) — no re-chunk, no re-embed. */
  chunksRestamped: number
  chunksWritten: number
  /** I3: pre-existing chunks the write passes deleted (re-chunk churn + the admission gate
   *  clearing a source of noise). Surfaces a live-path removal that writes nothing back. */
  chunksReplaced: number
  chunksEmbedded: number
  embedFailed: boolean
  /** Refs whose sourceType has no registered connector — surfaced, never silently dropped. */
  unknownTypes: SourceRef[]
}

/**
 * THE LIVE FAST PATH (plexi-brain I2b, defect D10 / F-12). Reindex specific sources —
 * the write-side twin of `removeSources`, and the reason a sticky edit costs milliseconds
 * instead of a whole-corpus rebuild.
 *
 * ── What it does NOT do, and why that is correct ─────────────────────────────────
 * It runs NO graph passes. buildIndex's five (projection, importance, entities, same-as,
 * contradicts) are full-corpus by nature — a single new edge changes many nodes' derived
 * importance — so there is no honest per-source version of them, and running all five per
 * keystroke-burst is exactly the cost F-12 names. They are not required for FINDABILITY:
 * `src/shared/spineRerank.ts` gives a candidate with no projected node factor 1.0 and
 * passes it through every gate but the room aperture ("No projected node: the store-anyway
 * floor keeps it findable"). So freshly-written chunks rank on recall from the moment they
 * land, and the graph catches up on the idle cadence the live driver schedules
 * (src/main/brain/liveIngest.ts), where a thousand edits cost ONE graph pass.
 *
 * ── The null contract (an edit that REMOVES content) ─────────────────────────────
 * `collectOne` returning null does not mean "not found" — it means "collect() would not
 * emit this source any more": its text was cleared, its container was trashed, it was
 * archived. That is a removal, and it is routed through the same `removeSources` primitive
 * the delete path uses, so emptying a sticky makes its old text stop being retrievable at
 * once rather than at the next rebuild. Without this the live loop would be able to ADD
 * truth but never RETRACT it — the I0b failure mode, re-introduced through the front door.
 *
 * DEC-012: gated. Brain OFF ⇒ zero work, zero chunk-layer contact, empty result.
 */
export async function reindexSources(refs: readonly SourceRef[]): Promise<ReindexResult> {
  const out: ReindexResult = {
    sourcesReindexed: 0,
    sourcesUnchanged: 0,
    sourcesRemoved: 0,
    chunksRestamped: 0,
    chunksWritten: 0,
    chunksReplaced: 0,
    chunksEmbedded: 0,
    embedFailed: false,
    unknownTypes: []
  }
  if (refs.length === 0) return out
  if (!isBrainEnabled()) return out // DEC-012 — defence in depth; the driver gates too

  const byType = new Map(INTERNAL_CONNECTORS.map((c) => [c.sourceType, c]))
  const gone: SourceRef[] = []

  for (const ref of refs) {
    const connector = byType.get(ref.sourceType)
    if (!connector) {
      out.unknownTypes.push(ref)
      continue
    }
    let doc: SourceDoc | null = null
    try {
      doc = connector.collectOne(ref.sourceId)
    } catch (err) {
      // A connector that throws for one id tells us nothing about that source, so we do
      // NOT treat it as gone (the same asymmetry the reconcile pass's coverage rule
      // encodes: "the source is gone" and "we failed to look" must not be conflated).
      // eslint-disable-next-line no-console
      console.error(`[liveIngest] ${connector.id}.collectOne('${ref.sourceId}') threw — skipped:`, err)
      continue
    }
    if (!doc) {
      gone.push(ref)
      continue
    }
    const w = await writeSource(doc, false)
    out.chunksRestamped += w.chunksRestamped
    out.chunksReplaced += w.chunksReplaced
    if (w.chunksWritten > 0) {
      out.sourcesReindexed++
      out.chunksWritten += w.chunksWritten
      out.chunksEmbedded += w.chunksEmbedded
      if (w.embedFailed) out.embedFailed = true
    } else if (w.chunksReplaced > 0) {
      // I3: the admission gate cleared this source — its N chunks were just deleted and none
      // admitted (a live source edited down to pure noise, e.g. a sticky reduced to "test" or a
      // grid blanked). The source still EXISTS, so it is not a removal, but its chunk set changed
      // N→0: it is a REINDEX, never "unchanged" (which would hide the retraction from telemetry).
      out.sourcesReindexed++
    } else {
      out.sourcesUnchanged++
    }
  }

  if (gone.length > 0) {
    try {
      const removed = removeSources(gone.map((r) => ({ ...r, reason: 'deleted' as const })))
      out.sourcesRemoved = removed.sourcesRemoved
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[liveIngest] removal of no-longer-indexable sources failed:', err)
    }
  }

  return out
}

// Build (or refresh) the chunk index for the active org. Safe to call repeatedly.
// When `force` is false, unchanged sources are still re-chunked (cheap, pure) but
// their content hashes let us skip re-embedding identical chunks — the expensive
// part. For P0's corpus size this whole pass is seconds.

// Build generation counter — every buildIndex bumps it. The DESTRUCTIVE reconcile pass
// (I0b) only fires when this build is still the latest to have started; a build that was
// overtaken by a newer one skips its reconcile, because its `collectSources()` snapshot
// is now stale and could prune a source the newer build just wrote. Without this, two
// overlapping same-org builds race: build #1 snapshots (no source X), build #2 writes X
// and reconciles (keeps X), then build #1's stale reconcile prunes X. (Reported MAJOR by
// the adversarial review.) The write passes are idempotent and safe to overlap; only the
// prune needs the freshest snapshot.
let buildGeneration = 0

export async function buildIndex(opts: { force?: boolean } = {}): Promise<IndexResult> {
  const force = opts.force === true
  const myGeneration = ++buildGeneration
  // Snapshot the active org at entry. collectSources() runs synchronously here, but the
  // embed loop below yields on `await embedTexts()`, and `session:setActiveOrg` is a live
  // IPC handler — so the active org CAN change mid-index. That is harmless for the write
  // passes (they'd just write the new org), but the I0b reconcile pass is DESTRUCTIVE: if
  // it diffed this scan's sources (old org) against listIndexedSourceRefs() (new org) it
  // would prune the new org's chunks as "not collected". The guard below aborts the
  // reconcile — never the whole index — if the org moved under us.
  const orgAtStart = getActiveOrgId()
  const { sources, coveredSourceTypes } = collectSources()
  let chunksWritten = 0
  let chunksReplaced = 0
  let chunksEmbedded = 0
  let embedModel: string | null = null
  let embedFailed = false

  for (const src of sources) {
    const w = await writeSource(src, force)
    chunksWritten += w.chunksWritten
    chunksReplaced += w.chunksReplaced
    chunksEmbedded += w.chunksEmbedded
    if (w.embedModel) embedModel = w.embedModel
    if (w.embedFailed) embedFailed = true
  }

  // ── I0b — THE RECONCILE PASS (the delete path's backstop) ────────────────────────
  // Everything above only ever touches sources that STILL EXIST. This is where sources
  // that VANISHED leave: trashed, hard-purged, or sitting on a container the user
  // deleted. Without it, `deleteChunksForSource` had zero callers and deleted content
  // stayed retrievable forever (defect D11 / review finding F-1, FATAL).
  //
  // The immediate path (onSourcesRemoved, wired into the delete IPC handlers) already
  // catches removals the app tells us about; this catches the ones it cannot — removals
  // made with the brain off, and the 7-day hard purge, which notifies nobody. Both
  // routes converge on the same removeSources primitive, so "gone" has one definition.
  //
  // Runs BEFORE the graph passes below so importance/same-as/contradicts are derived
  // over the post-removal graph rather than computing across nodes about to be deleted.
  // Isolated: a reconciliation failure must never abort the (already-written) index.
  let reconcile: RemovalResult | null = null
  // Three preconditions the DESTRUCTIVE prune must clear — any failure skips it (never
  // aborts the already-written index). Each guards a distinct way the snapshot could no
  // longer describe the index we're about to prune against:
  const orgMoved = getActiveOrgId() !== orgAtStart // org switched mid-build (FATAL)
  const overtaken = myGeneration !== buildGeneration // a newer build started (MAJOR)
  const brainOff = !isBrainEnabled() // brain toggled OFF mid-build (DEC-012)
  if (orgMoved || overtaken || brainOff) {
    // eslint-disable-next-line no-console
    console.warn(
      `[indexer] reconcile skipped this pass (no prune) — ${
        orgMoved ? 'active org changed mid-index' : overtaken ? 'a newer build superseded this one' : 'brain toggled off mid-index'
      }`
    )
  } else {
    try {
      const plan = planReconcile(listIndexedSourceRefs(), sources, coveredSourceTypes)
      if (plan.retainedUncovered.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[indexer] reconcile skipped ${plan.retainedUncovered.length} indexed source(s) whose ` +
            `type was not enumerated this pass (a collector failed) — nothing pruned for them`
        )
      }
      reconcile = removeSources(plan.remove.map((r) => ({ ...r, reason: 'reconciled' as const })))
      if (reconcile.sourcesRemoved > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[indexer] reconciled away ${reconcile.sourcesRemoved} removed source(s): ` +
            `${reconcile.chunksRemoved} chunks, ${reconcile.nodesRemoved} nodes, ` +
            `${reconcile.edgeLeavesRemoved} provenance leaves, ${reconcile.entitiesRemoved} ungrounded entities`
        )
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[indexer] reconcile pass failed (chunks still indexed):', err)
    }
  }

  // P1 — materialize the object graph from the same island tables (the migration
  // posture: additive projection, base tables untouched). Runs on the index trigger
  // so the graph tracks the corpus. Pure structural mapping, local, no AI (I1).
  // Isolated so a projection hiccup never aborts the (already-written) chunk index.
  let projection: ProjectionResult | null = null
  try {
    projection = projectGraph()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[indexer] graph projection failed (chunks still indexed):', err)
  }

  // P1 (DEC-014) — derive importance over the freshly-projected graph. MUST run after
  // projection: degree (the top signal) needs the edges to exist. Formula-only, local,
  // no AI (I1). Isolated so a derivation hiccup never aborts the index or projection.
  let importance: ImportanceResult | null = null
  if (projection) {
    try {
      importance = deriveAllImportance()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[indexer] importance derivation failed (graph still projected):', err)
    }
  }

  // P2.7 (Layer 2) — read person/organization entities OUT of the SAME ingested content
  // (the sources already collected above — no second pass) and mint/link them into the
  // graph with provenance back to every source that named them. Deterministic floor, no
  // AI (the DEC-015 router NER pass is reserved-inert). Isolated so an extraction hiccup
  // never aborts the (already-written) index or the projected graph. Runs after
  // projection so extracted entities can resolve against projected person nodes too.
  let entities: EntityExtractResult | null = null
  try {
    const entitySources: EntitySource[] = sources.map((s) => ({
      sourceTable: s.sourceType,
      sourceId: s.sourceId,
      roomId: s.roomId,
      text: s.text
    }))
    entities = extractEntitiesFromSources(entitySources)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[indexer] entity extraction failed (index + graph intact):', err)
  }

  // P3 (Layer 3) — cross-room UNIFICATION. Now that every within-scope entity node exists
  // (P2.7 above), mint reversible `same-as` edges between confidently-identical entities in
  // DIFFERENT rooms so a single recall gathers "one Caleb across every room". Runs LAST
  // (needs all entity nodes) and isolated (a failure never aborts the index or the graph).
  let sameAs: SameAsResult | null = null
  try {
    sameAs = materializeCrossRoomSameAs()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[indexer] cross-room same-as failed (index + graph intact):', err)
  }

  // P3 (Layer 3) — the "plausible garbage" guard. Detect cross-source numeric conflicts
  // (two provenance-independent sources asserting different values for the same subject) and
  // mint `contradicts` edges between the projected source nodes, so retrieval can flag
  // "sources disagree" instead of silently surfacing one number. Reuses the SAME ingested
  // sources; isolated so a failure never aborts the index or graph.
  let contradicts: ContradictResult | null = null
  try {
    const contradictSources: ContradictSource[] = sources.map((s) => ({
      sourceTable: s.sourceType,
      sourceId: s.sourceId,
      roomId: s.roomId,
      text: s.text
    }))
    contradicts = materializeContradictions(contradictSources)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[indexer] contradiction detection failed (index + graph intact):', err)
  }

  return {
    sourcesIndexed: sources.length,
    chunksWritten,
    chunksReplaced,
    chunksEmbedded,
    embedModel,
    embedFailed,
    totalChunks: countChunks(),
    projection,
    importance,
    entities,
    sameAs,
    contradicts,
    reconcile
  }
}
