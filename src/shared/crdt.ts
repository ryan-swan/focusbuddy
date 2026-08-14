// Synchronisation via CRDTs (spec §50, REQ-SYN). Collaborative Objects use CRDTs
// with proven convergence, chosen so editing works offline and reconnects with no
// coordinating server (SYN-001). Tombstones are compactable (SYN-002); conflict
// resolution is deterministic per data class and AI never participates for a
// deterministic class (SYN-003); offline clients use client-generated ids and
// reconcile with no renumbering, duplication or loss (SYN-010/011); and a genuinely
// unmergeable class surfaces the conflict with both versions intact (SYN-012).
//
// This is the shared home for the convergence primitives so BOTH the main process
// and the renderer's sync engine (lib/crdtSync.ts) draw on one implementation. The
// old location src/main/sync/crdt.ts re-exports this module so its conformance test
// (tests/unit/plxSynCrdt.test.ts) and the design doc's path reference keep working.

// ── OR-Set (observed-remove set) — a convergent CRDT (SYN-001) ────────────────
export interface ORSet<T> {
  adds: Map<string, T> // tag -> element
  removes: Set<string> // tombstoned tags
}
export function newORSet<T>(): ORSet<T> {
  return { adds: new Map(), removes: new Set() }
}
export function orAdd<T>(set: ORSet<T>, element: T, tag: string): ORSet<T> {
  const adds = new Map(set.adds)
  adds.set(tag, element)
  return { adds, removes: new Set(set.removes) }
}
export function orRemove<T>(set: ORSet<T>, element: T): ORSet<T> {
  const removes = new Set(set.removes)
  for (const [tag, el] of set.adds) if (el === element) removes.add(tag)
  return { adds: new Map(set.adds), removes }
}
export function orValues<T>(set: ORSet<T>): T[] {
  const live: T[] = []
  for (const [tag, el] of set.adds) if (!set.removes.has(tag)) live.push(el)
  return [...new Set(live)]
}
// Merge is commutative, associative and idempotent — the convergence property
// (SYN-001). Union the adds and the removes.
export function orMerge<T>(a: ORSet<T>, b: ORSet<T>): ORSet<T> {
  const adds = new Map(a.adds)
  for (const [tag, el] of b.adds) adds.set(tag, el)
  return { adds, removes: new Set([...a.removes, ...b.removes]) }
}
// GC/compaction (SYN-002): a tombstoned tag that both replicas have seen removed
// can drop its add entry, bounding growth. Safe once the tag is in `removes`.
export function orCompact<T>(set: ORSet<T>): ORSet<T> {
  const adds = new Map(set.adds)
  for (const tag of set.removes) adds.delete(tag)
  // Retain the removes set as the compaction record; adds no longer carry dead tags.
  return { adds, removes: new Set(set.removes) }
}

// ── LWW register — deterministic conflict resolution (SYN-003) ────────────────
export interface LWWRegister<T> {
  value: T
  timestamp: number
  actor: string
}
// Higher timestamp wins; ties broken deterministically by actor id. No AI, no
// coordination — the same two inputs always resolve the same way (SYN-003).
export function lwwMerge<T>(a: LWWRegister<T>, b: LWWRegister<T>): LWWRegister<T> {
  if (a.timestamp !== b.timestamp) return a.timestamp > b.timestamp ? a : b
  return a.actor >= b.actor ? a : b
}

// ── Data-class conflict policy (SYN-003) ─────────────────────────────────────
export type DataClass = 'text' | 'set' | 'counter' | 'workflow' | 'decision'
const DETERMINISTIC_CLASSES = new Set<DataClass>(['text', 'set', 'counter'])
export function isDeterministicClass(cls: DataClass): boolean {
  return DETERMINISTIC_CLASSES.has(cls)
}
// AI never participates in conflict resolution for a deterministic class (SYN-003).
export function aiMayResolveConflict(cls: DataClass): boolean {
  return !isDeterministicClass(cls)
}

// ── Offline reconciliation (SYN-010/011) ─────────────────────────────────────
export interface OfflineEvent {
  id: string // client-generated (UUIDv7), no renumbering on reconnect
  timestamp: string // occurrence time, preserved on ingestion
  partitionKey: string
  sequence: number
}
// Reconcile an offline client's Events on reconnection: client ids are kept (no
// renumbering), duplicates already on the server are dropped (no duplication), and
// nothing is lost (SYN-010).
export function reconcileOffline(local: OfflineEvent[], serverIds: Set<string>): { ingested: OfflineEvent[]; duplicates: string[] } {
  const ingested: OfflineEvent[] = []
  const duplicates: string[] = []
  for (const e of local) (serverIds.has(e.id) ? duplicates.push(e.id) : ingested.push(e))
  return { ingested, duplicates }
}
// On ingestion the original occurrence time is preserved and a distinct ingestion
// time is stamped; consumers order by sequence, never by wall-clock (SYN-011).
export function ingestOffline(e: OfflineEvent, recordedAt: string): OfflineEvent & { recordedAt: string } {
  return { ...e, recordedAt } // timestamp (occurrence) untouched; recordedAt distinct
}

// ── Unmergeable conflict surfacing (SYN-012) ─────────────────────────────────
export interface SurfacedConflict<T> {
  dataClass: DataClass
  local: T
  remote: T
  bothIntact: true
  requiresUserResolution: true
}
// A Workflow/Decision class conflict cannot be silently merged: surface both
// versions intact for the user to resolve (SYN-012).
export function surfaceConflict<T>(dataClass: DataClass, local: T, remote: T): SurfacedConflict<T> {
  if (isDeterministicClass(dataClass)) {
    throw new Error(`Class "${dataClass}" resolves deterministically and MUST NOT surface a manual conflict (PLX-SYN-003).`)
  }
  return { dataClass, local, remote, bothIntact: true, requiresUserResolution: true }
}
