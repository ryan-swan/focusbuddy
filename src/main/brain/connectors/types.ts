// The Connector Contract (plexi-brain I2 — the keystone of the ingestion pipeline).
//
// One idea (05-ARCHITECTURE/04-INGESTION-PIPELINE.md §0, §5): every source in the
// universe — a sticky note, a task, a document, a Slack thread, a Gmail message —
// becomes the SAME normalized row, and its place in the hierarchy is STAMPED on it,
// never piped through it. A connector is the thing that reads one source and coerces
// it into that row. Internal surfaces and external SaaS are the same kind of thing.
//
// Before I2, collectSources() was a hardcoded 4-way switch (defect D8). Inverting it
// into a registry of connectors is what makes the operator's goal literally true:
// "any person with any tool can bring their tool in, have a clean integration, and
// have that integration become an ingestion pipeline." After I2, a new connector
// inherits chunking, embedding, the graph spine, room scoping, sensitivity, the
// DEC-012 toggle, the DEC-015 local/cloud router, AND the I0b delete path — without
// writing any of it. It only has to declare what it is and emit SourceDocs.
//
// ── What this commit implements vs. what the phases ahead add ────────────────────
// I2 commit 1 is a PURE inversion, gated on a byte-identical chunk table. So this
// interface realizes only the slice the four internal connectors need TODAY: identity,
// a synchronous pull (collect), and the I0b coverage declaration (below). The rest of
// spec §5's contract lands with the phase that first CONSUMES it, so nothing here is a
// dead field claiming a capability that isn't enforced:
//   • collectOne(sourceId)        → I2b — BUILT (the live ingest loop, D10)
//   • watch(onChange, onRemoved)  → I5 — see the I2b note below
//   • distill / admit             → I3 (admission gate) / I4 (container digests)
//   • visibility / scope / cadence → I5 (external connectors + ACL enforcement)
// External connectors will additionally provide an async, cursored pull; the registry
// gains that variant when I5 brings the first source that needs it.
//
// ── I2b: why INTERNAL connectors get `collectOne` and NOT `watch` ────────────────
// Spec §5 reserved `watch()` for I2b, on the assumption that every connector discovers
// its own changes. Measuring the write path showed that is the wrong shape for sources
// we OWN: nothing internal needs to be watched, because the app already knows the instant
// a row changes — the write goes through our own process. A `watch()` on the widget
// connector could only re-implement, one layer lower, a notification the IPC handler is
// already holding. The delete path settled this once already: I0b did not give connectors
// a `watchRemovals()`, it gave the app `onSourcesRemoved(refs)` and called it from the
// delete handlers. I2b is the exact mirror — `onSourcesChanged(refs)` (brain/liveIngest.ts)
// called from the write handlers.
//
// What the live loop DOES need from a connector is the thing the contract had no way to
// express: "give me the SourceDoc for THIS ONE id". Without it a single sticky edit has to
// re-collect the entire corpus to find one row. That is `collectOne` below.
//
// `watch()` stays reserved — for I5's EXTERNAL sources, where the app genuinely cannot
// know when a Slack message arrives and the connector must subscribe or poll for itself.
// That is the case the seam was really for.

import type { ChunkStrategy } from '../chunker'

// One source's normalized, ready-to-chunk form — Cerebras's "one row shape" (T1). Every
// field here maps 1:1 to an fb_chunks column the indexer already writes, so a connector
// that fills this struct inherits the whole write path.
export interface SourceDoc {
  // Widened from the old 4-way union to `string`: fb_chunks.source_type is already TEXT,
  // and an open string is what lets a new connector claim its own type without editing a
  // union. It is also the reconcile COVERAGE KEY (see CollectResult) — one per connector.
  sourceType: string
  sourceId: string
  title: string
  text: string
  // The lineage stamp (DEC-018: "one line doing five jobs" — scope · signal · privacy ·
  // tenancy · aperture). fb_chunks carries exactly one lineage column today — `room_id` —
  // so that is what a SourceDoc stamps; the org is applied globally by the chunk writer.
  // The spec's fuller lineage (deskId / widgetId) joins this field when those columns
  // exist. I2 commit 2 resolves this for documents (F-11: 58% of chunks were NULL-room).
  roomId: string | null
  chunkDate: number | null // recency (the source's updated_at)
  sourceKind: string | null // finer type (doc_type / 'task' / 'knowledge' / widget kind)
  // I3 (DEC-022): which chunk ladder the indexer applies to this source's text. Absent ⇒
  // 'prose' (today's blank-line splitter, byte-identical to pre-I3). A connector declares it
  // from the source FORMAT, not the content: a spreadsheet is 'table', a raw-markdown widget
  // is 'markdown'. See src/main/brain/chunker.ts.
  chunkStrategy?: ChunkStrategy
}

// A connector: reads one class of source, declares its identity, emits SourceDocs.
export interface Connector {
  // Stable, unique — 'internal:widget', and (I5) 'slack:C04ABC', 'gmail:caleb@…'. Used
  // in logs and, later, per-source freshness/state; distinct from sourceType, since many
  // external connectors of the SAME sourceType (every Slack channel) coexist.
  id: string
  kind: 'internal' | 'external'
  // The fb_chunks.source_type this connector owns AND its reconcile coverage key. The
  // delete path prunes an indexed source only inside a sourceType a scan COVERED (below),
  // so this string is load-bearing, not cosmetic.
  sourceType: string
  label: string // operator-facing
  // Pull, synchronous (internal local-SQLite reads). Emits each SourceDoc via `emit`.
  // Coverage is DECLARED by returning cleanly — see runConnectors + CollectResult. A
  // connector that throws mid-enumeration declares nothing, so the delete path leaves
  // its whole corpus alone (the tombstone-safety property, src/shared/indexReconcile.ts).
  collect(emit: (doc: SourceDoc) => void): void

  // I2b — THE LIVE INGEST LOOP. Resolve ONE source by id, for the write-side fast path.
  //
  // CONTRACT: `collectOne(id)` returns exactly what `collect()` would have emitted for
  // that id, or `null` if `collect()` would not have emitted it at all. The null case is
  // load-bearing and is NOT merely "not found": a widget whose text was just deleted, a
  // document that was archived, a task moved to the trash — each is a source that USED to
  // be indexable and no longer is, and the live path turns that null into a REMOVAL, so
  // emptying a sticky makes its old text stop being retrievable immediately instead of at
  // the next full rebuild.
  //
  // The equivalence is not asserted by reading the code — it is LOCKED against the real
  // corpus (tests/e2e/brainLiveIngest.spec.ts LOCK 8 walks every live source and every
  // indexed-but-dead id and requires collectOne to agree with collect on all of them),
  // because a silent divergence here would mean the fast path and the full rebuild index
  // two different corpora — the worst possible failure for a live loop.
  collectOne(sourceId: string): SourceDoc | null
}

// What one scan produced: the sources, plus the source types it enumerated TO
// COMPLETION. I0b's reconcile pass may only prune inside `coveredSourceTypes` — because
// "the source is gone" and "the fetch failed" are the same absence. See
// src/shared/indexReconcile.ts for the full tombstone-safety argument.
export interface CollectResult {
  sources: SourceDoc[]
  coveredSourceTypes: Set<string>
}
