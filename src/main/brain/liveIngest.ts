// THE LIVE INGEST DRIVER (plexi-brain I2b — defect D10). The single place a write becomes
// an index update. Every route into it — a sticky edited, a doc saved, a task renamed, an
// AI proposal applied — lands on `onSourcesChanged`, exactly as every route out of the
// index lands on `onSourcesRemoved` (removal.ts). The two are deliberate mirrors: one
// definition of "arrived", one definition of "gone".
//
// ── The defect ──────────────────────────────────────────────────────────────────
// The only caller of buildIndex() was a button in Settings (BrainSection.tsx). Editing a
// sticky reached the brain only when a human clicked Rebuild. Measured on the operator's
// own corpus the day this shipped: the index was CORRECT — 1 of 139 live sources stale —
// but only because a rebuild had been clicked three days earlier. Nothing bounded how
// wrong it could get. The product claim is "real-time accurate"; the honest pre-I2b
// statement was "accurate as of the last click". That is what this file changes.
//
// ── Two clocks (F-12) ───────────────────────────────────────────────────────────
//   FAST   debounced per-source reindex → chunks + embeddings + FTS. Findable in ~1.5s.
//   IDLE   a full incremental buildIndex() once writing stops → the five whole-corpus
//          graph passes, the I0b reconcile, AND every write that never crossed an IPC
//          handler (see COVERAGE below). Measured ~100ms on the real 379-chunk corpus.
//
// The split is safe because findability does not depend on the graph: spineRerank.ts gives
// a candidate with no projected node factor 1.0 and passes it through every gate but the
// room aperture. Chunks rank the moment they land; the graph settles seconds later. The
// reverse split would be wrong, which is why it is this way round.
//
// ── COVERAGE, stated honestly ───────────────────────────────────────────────────
// The hooks sit at the IPC handlers, beside the I0b delete hooks. That covers every
// renderer-originated write — i.e. all interactive editing, every AI proposal apply, every
// template and share import. It does NOT cover writers that never cross IPC: the local
// REST API (apiServer.ts), the 5-minute PlexiFlow automation tick (db/flows.ts), marketplace
// templates (templates.ts), projectPlan's raw `UPDATE nodes`, workspaceSync's remote
// upserts, canvasSnapshots' raw widget upserts, and a whole-file backup restore.
//
// Those are covered by the IDLE pass, because it re-reads the tables through the connector
// registry rather than listening for events — the same reason the I0b reconcile pass exists
// for deletes the brain never heard about. `requestFullSweep()` lets a known-bulk handler
// ask for that pass immediately instead of waiting, and SWEEP_INTERVAL_MS is the floor that
// catches the rest. This mirrors I0b exactly: an immediate path for what the app tells us,
// a re-scan for what it cannot.
//
// ── DEC-012 ─────────────────────────────────────────────────────────────────────
// Brain OFF must be byte-identical to brain-absent, so: nothing is enqueued while off
// (`onSourcesChanged` returns immediately), no timer is ever armed while off, the queue is
// DISCARDED on OFF so work armed while on cannot fire after, and every fire re-checks —
// because the toggle is per-org and an org switch changes the answer with no notification.
// Locked by tests/e2e/brainLiveIngest.spec.ts LOCK 5 (chunk table byte-identical, and the
// sentinel provably absent from fb_chunks and fb_chunks_fts).

import {
  createState,
  markDirty,
  flushDecision,
  takeBatch,
  graphPassDue,
  markGraphClean,
  discardAll,
  DEFAULT_POLICY,
  type LiveIngestState
} from '@shared/liveIngest'
import type { SourceRef } from '@shared/indexReconcile'
import { isBrainEnabled } from '../brainPref'
import { getActiveOrgId } from '../db/activeOrg'
import { listWidgetsByTask } from '../db/widgets'
import { buildIndex, reindexSources } from './indexer'

// How often the driver wakes to evaluate the policy. Only armed while there is work —
// an idle brain-on app runs no timer at all, and a brain-off app never arms one.
const TICK_MS = 400

// The floor cadence for the full incremental sweep: the backstop for writers that never
// cross an IPC handler (see COVERAGE above). Costs ~100ms on the real corpus and only
// fires when the fast queue is empty, so it never competes with active editing.
const SWEEP_INTERVAL_MS = 5 * 60_000

const state: LiveIngestState = createState(Date.now())
let tickTimer: NodeJS.Timeout | null = null
let sweepTimer: NodeJS.Timeout | null = null
let inFlight = false
/** The org the queued refs belong to. A queue is only valid for the org that filled it. */
let queuedOrgId: string | null = null
/** Set by requestFullSweep() — forces the idle pass even with nothing in the fast queue. */
let sweepRequested = false

// Observability for the e2e locks and for the operator. Cheap counters, no allocation.
const stats = {
  marked: 0,
  flushes: 0,
  sourcesReindexed: 0,
  sourcesRemoved: 0,
  chunksRestamped: 0,
  graphPasses: 0,
  discarded: 0,
  lastFlushMs: 0,
  lastError: null as string | null
}

export type LiveIngestStats = typeof stats

export function liveIngestStats(): LiveIngestStats {
  return { ...stats }
}

function armTick(): void {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    void tick()
  }, TICK_MS)
  // Never hold the app open on quit for an ingest tick.
  tickTimer.unref?.()
}

function disarmTick(): void {
  if (!tickTimer) return
  clearInterval(tickTimer)
  tickTimer = null
}

/**
 * The base-app entry point: these sources changed, index them IF the brain is on.
 *
 * The exact write-side mirror of `onSourcesRemoved` (removal.ts:161) — same batch-carrying
 * signature, same DEC-012 gate, same idempotency contract (marking a source ten times in a
 * burst costs one reindex). Returns false when the brain is off and nothing was queued.
 */
export function onSourcesChanged(refs: readonly SourceRef[]): boolean {
  if (refs.length === 0) return false
  if (!isBrainEnabled()) return false // brain OFF ⇒ nothing is queued, no timer is armed

  const org = getActiveOrgId()
  if (queuedOrgId !== null && queuedOrgId !== org) {
    // The active org moved with work still queued. Those refs name the PREVIOUS org's
    // rows; indexing them now would write another org's content under this org's stamp.
    // Drop them — the same reason buildIndex aborts its reconcile when the org moves
    // mid-pass (indexer.ts, `orgMoved`). Nothing is lost: the idle sweep re-reads the
    // whole corpus for whichever org is active.
    stats.discarded += discardAll(state, Date.now())
    sweepRequested = true
  }
  queuedOrgId = org

  const now = Date.now()
  for (const ref of refs) {
    markDirty(state, ref, now)
    stats.marked++
  }
  armTick()
  return true
}

/**
 * The base-app entry point for a NODE write — a task created, renamed, described, or MOVED.
 *
 * The mirror of `onNodesRemoved`. A move is why this exists rather than a bare
 * `onSourcesChanged([{sourceType:'task'}])`: re-parenting a desk changes the ROOM of the
 * task AND of every widget sitting on it, because the widget connector stamps
 * `roomId = getNode(w.taskId).parentId`. The room stamp is the aperture, the privacy line
 * and the tenancy line all at once (DEC-018), so a move that updated only the task would
 * leave every widget on that desk answering under its old room. Expanding the container
 * here — rather than at each call site — keeps "what a write costs the brain" in one place,
 * exactly as `onNodesRemoved` does for deletes.
 *
 * Ids that are not tasks cost nothing: collectOne returns null for a folder, and a folder
 * that was never indexed is a no-op removal.
 */
export function onNodeChanged(nodeId: string, opts: { withWidgets?: boolean } = {}): boolean {
  if (!isBrainEnabled()) return false
  const refs: SourceRef[] = [{ sourceType: 'task', sourceId: nodeId }]
  if (opts.withWidgets) {
    try {
      for (const w of listWidgetsByTask(nodeId)) refs.push({ sourceType: 'widget', sourceId: w.id })
    } catch {
      // A widget-listing failure must not lose the task's own update.
    }
  }
  return onSourcesChanged(refs)
}

/**
 * Ask for the full incremental pass as soon as the queue is quiet.
 *
 * For handlers that write MANY rows through paths the per-source hooks cannot enumerate —
 * a workspace sync landing remote rows via raw SQL, a canvas snapshot restore, a backup
 * restore. Cheaper and more honest than trying to name every id such a path touched: the
 * sweep re-reads the tables, so it cannot miss one.
 */
export function requestFullSweep(): boolean {
  if (!isBrainEnabled()) return false
  sweepRequested = true
  armTick()
  return true
}

/**
 * Called when the brain toggle flips.
 *
 * ON: deliberately nothing. An earlier draft kicked a catch-up sweep here, reasoning that
 * an index which sat idle while the brain was off may be stale. That was wrong on two
 * counts, and the I0 eval ruler caught it: enabling a setting silently started an
 * unbounded whole-corpus rebuild the user never asked for, and that rebuild MUTATED the
 * index underneath anything reading it immediately afterwards — the ruler measured a
 * corpus being reconciled mid-measurement and scored hit@1 50% instead of 64%. Staleness
 * after a spell with the brain off is already covered: the floor sweep runs within
 * SWEEP_INTERVAL_MS, the first write arms the fast path, and the Settings button stays the
 * explicit "rebuild now". A toggle should toggle.
 *
 * OFF: disarm everything and drop the queue, so work armed while on cannot fire after.
 */
export function setLiveIngestEnabled(enabled: boolean): void {
  if (enabled) return
  stats.discarded += discardAll(state, Date.now())
  sweepRequested = false
  queuedOrgId = null
  disarmTick()
  if (sweepTimer) {
    clearInterval(sweepTimer)
    sweepTimer = null
  }
}

/** Install the floor sweep. Called once at app start; itself a no-op while the brain is off. */
export function startLiveIngest(): void {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    if (!isBrainEnabled()) return // DEC-012 — re-checked at every fire (org switches silently)
    sweepRequested = true
    armTick()
  }, SWEEP_INTERVAL_MS)
  sweepTimer.unref?.()
}

/** Stop everything (app quit, and the reset seam the e2e locks use). */
export function stopLiveIngest(): void {
  disarmTick()
  if (sweepTimer) {
    clearInterval(sweepTimer)
    sweepTimer = null
  }
  discardAll(state, Date.now())
  sweepRequested = false
  queuedOrgId = null
}

// One evaluation of the policy. Never throws — a live-ingest failure must not take down
// the main process, and must never leave the driver wedged (hence the finally).
async function tick(): Promise<void> {
  if (inFlight) return
  const now = Date.now()

  // DEC-012, re-checked every fire: the toggle is per-org and an org switch changes the
  // answer with no notification, so a queue armed under an org where the brain was on
  // must not fire under one where it is off.
  if (!isBrainEnabled()) {
    stats.discarded += discardAll(state, now)
    sweepRequested = false
    disarmTick()
    return
  }

  const decision = flushDecision(state, now, DEFAULT_POLICY)
  const wantsGraph = graphPassDue(state, now, DEFAULT_POLICY)
  const wantsSweep = sweepRequested && state.dirty.size === 0

  if (!decision && !wantsGraph && !wantsSweep) {
    // Nothing to do and nothing pending — stop burning ticks.
    if (state.dirty.size === 0 && !state.graphDirty) disarmTick()
    return
  }

  inFlight = true
  const t0 = Date.now()
  try {
    if (decision) {
      const batch = takeBatch(state, Date.now(), DEFAULT_POLICY)
      const res = await reindexSources(batch.refs)
      stats.flushes++
      stats.sourcesReindexed += res.sourcesReindexed
      stats.sourcesRemoved += res.sourcesRemoved
      stats.chunksRestamped += res.chunksRestamped
      if (res.unknownTypes.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[liveIngest] ${res.unknownTypes.length} queued source(s) have no registered connector — ` +
            `not indexed: ${res.unknownTypes.map((r) => `${r.sourceType}:${r.sourceId}`).join(', ')}`
        )
      }
      if (batch.refs.length === 0) queuedOrgId = null
      return // one unit of work per tick; the graph pass waits for quiet by design
    }

    // Nothing queued: the whole-corpus pass. Runs the five graph passes, the I0b
    // reconcile, AND picks up every write that never crossed an IPC handler.
    await buildIndex({ force: false })
    stats.graphPasses++
    markGraphClean(state)
    sweepRequested = false
    queuedOrgId = null
    if (state.dirty.size === 0) disarmTick()
  } catch (err) {
    stats.lastError = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error('[liveIngest] pass failed (the index is unchanged for this batch):', err)
  } finally {
    stats.lastFlushMs = Date.now() - t0
    inFlight = false
  }
}

// A base TABLE name (what the capture path and the projector speak) → the connector
// sourceType (what fb_chunks and the live queue speak). The inverse of spine.ts's
// SOURCE_TYPE_TO_TABLE, plus the widget row that map deliberately omits (adding 'widget'
// there would change retrieval ranking — see removal.ts's PROJECTION_TABLE note).
const TABLE_TO_SOURCE_TYPE: Record<string, string> = {
  fb_knowledge: 'knowledge',
  documents: 'document',
  nodes: 'task',
  widgets: 'widget'
}

/**
 * The AI-capture entry point (closes F-16).
 *
 * F-16: "the AI-capture path writes the graph but NOT the chunk index — so captured
 * content is graph-visible but not retrievable until the next full index."
 *
 * Measuring the path showed capture never AUTHORS content: applyProposal writes the base
 * row first and `brain:captureApplied` only annotates it afterwards, so the base-table
 * hooks above already carry every captured byte into the index. This function makes that
 * closure EXPLICIT rather than incidental — a future proposal kind that writes its base
 * row through some path nobody hooked would silently re-open F-16, and one idempotent
 * re-queue of an id we are already holding costs nothing (the dirty set coalesces).
 *
 * `sourceTable` is the capture path's own vocabulary (`sourceTableForKind`), which is why
 * the translation lives here rather than at the call site.
 */
export function onCaptureApplied(sourceTable: string, sourceRowId: string): boolean {
  const sourceType = TABLE_TO_SOURCE_TYPE[sourceTable]
  if (!sourceType) return false // e.g. calendar_events — not a connector source
  return onSourcesChanged([{ sourceType, sourceId: sourceRowId }])
}

/** TEST-ONLY: drain the queue immediately rather than waiting out the debounce, so an
 *  e2e can assert the OUTCOME without also asserting the clock. Exposed through the
 *  NODE_ENV==='test' IPC block only. */
export async function __flushNowForTest(): Promise<void> {
  if (!isBrainEnabled()) return
  const batch = takeBatch(state, Date.now(), DEFAULT_POLICY)
  if (batch.refs.length > 0) await reindexSources(batch.refs)
}
