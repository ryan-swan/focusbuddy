// work_item shared contract — the column manifest and the status projection
// (Attention layer S2; ARCHITECTURE §2.2–§2.3). Pure and dependency-free: the
// main db module, the renderer CRDT allowlists/emitters, and the CI parity
// test all import THIS file, so the column set can never drift between the
// schema, the transports, and the tests (guess-list #9).

export interface WorkItemColumnDef {
  /** snake_case DB column on nodes */
  column: string
  /** camelCase CRDT attr / sync-body key / FbNode field */
  attr: string
  /** ensureColumn DDL type */
  ddl: string
  /** Rides the renderer emit snapshot. false = main-process-written only
   *  (schema_epoch — excluded from the emit-fires assertion, F-m2″). */
  rendererEmitted: boolean
}

export const WORK_ITEM_COLUMNS: readonly WorkItemColumnDef[] = [
  { column: 'work_item_state', attr: 'workItemState', ddl: 'TEXT', rendererEmitted: true },
  { column: 'intent_class', attr: 'intentClass', ddl: 'TEXT', rendererEmitted: true },
  // Reserved secondary-intent axis (taxonomy alignment, analysis/22 §2.4):
  // emitted + allowlisted NOW while schema churn is cheap; no UI writes it yet.
  // UI adoption waits for the per-class question sets (SPEC-027 era).
  { column: 'intent_sub', attr: 'intentSub', ddl: 'TEXT', rendererEmitted: true },
  // DEC-035 — grouping. The id of the item that LEADS this item's group.
  // A SIBLING reference, deliberately not parent_id: work items are leaf nodes
  // (§2.5 leaf invariant — nothing nests under a work item, enforced at create
  // AND at sync apply), and parent_id already means "the desk this lives on".
  // Exactly one level: a group leader never itself carries a group_id, so a
  // group can never become a tree.
  { column: 'group_id', attr: 'groupId', ddl: 'TEXT', rendererEmitted: true },
  { column: 'originator_id', attr: 'originatorId', ddl: 'TEXT', rendererEmitted: true },
  { column: 'recipient_id', attr: 'recipientId', ddl: 'TEXT', rendererEmitted: true },
  // ISO-8601 string — collision-proof vs the numeric desk due_date (§2.2)
  { column: 'due_at', attr: 'dueAt', ddl: 'TEXT', rendererEmitted: true },
  { column: 'wi_urgency', attr: 'wiUrgency', ddl: 'TEXT', rendererEmitted: true },
  { column: 'source_ref', attr: 'sourceRef', ddl: 'TEXT', rendererEmitted: true },
  { column: 'source_type', attr: 'sourceType', ddl: 'TEXT', rendererEmitted: true },
  { column: 'confidence', attr: 'confidence', ddl: 'REAL', rendererEmitted: true },
  { column: 'approval_state', attr: 'approvalState', ddl: 'TEXT', rendererEmitted: true },
  { column: 'reason_code', attr: 'reasonCode', ddl: 'TEXT', rendererEmitted: true },
  { column: 'wi_origin', attr: 'wiOrigin', ddl: 'TEXT', rendererEmitted: true },
  // Writer's schema version — forward-compat receiver guard (F-M5″): a device
  // at epoch N parks a row stamped N+1 instead of mis-applying it.
  { column: 'schema_epoch', attr: 'schemaEpoch', ddl: 'INTEGER', rendererEmitted: false }
] as const

/** This build's work_item schema epoch. Bump ONLY when a new epoch's rows
 *  would be unsafe for an older build to materialize as-is. */
export const WORK_ITEM_SCHEMA_EPOCH = 1

/** Non-terminal states — "this still needs the person". One source for every
 *  SQL visibility predicate (badge, nudges) so a new state can never be
 *  half-added. */
export const ACTIVE_WORK_ITEM_STATES = [
  'open',
  'in_progress',
  'waiting',
  'needs_review',
  'needs_approval',
  'delegated',
  'blocked',
  'suggested',
  'stale'
] as const

/** Terminal states. 'decided' is the To Decide queue's closing verb (taxonomy
 *  alignment; analysis/22 §2.1). Cross-version note: an un-updated peer
 *  coarsens any state it doesn't know to 'open' (the conservative default)
 *  until it updates — accepted, same as every state added since v1. */
export const TERMINAL_WORK_ITEM_STATES = [
  'acknowledged',
  'answered',
  'scheduled',
  'delivered',
  'reviewed',
  'completed',
  'discussed',
  'decided',
  'dismissed',
  'reclassified',
  // DEC-024: shelved — "keep it, done looking at it". Terminal for queue
  // visibility, but NOT a loop closure: no notification, no Recently-closed
  // row; it lives on the Archived shelf until unarchived (state → open).
  'archived'
] as const

export const WORK_ITEM_STATES = [...ACTIVE_WORK_ITEM_STATES, ...TERMINAL_WORK_ITEM_STATES] as const
export type WorkItemState = (typeof WORK_ITEM_STATES)[number]

/** The eight intent primaries (taxonomy alignment stage, DEC-029a sequencing;
 *  analysis/22). Schema values keep the full to_* form (R-01); surface labels
 *  live in the renderer (attentionQueues). The legacy classes 'acknowledgment'
 *  and 'direct' merged into 'to_respond'; 'to_decide' is the one genuinely new
 *  primary. The five taxonomy tests T-1…T-5 + anti-collision (DEC-029a LAW)
 *  govern any future change to this list. */
export const INTENT_CLASSES = [
  'to_do',
  'to_review',
  'to_decide',
  'to_respond',
  'to_meet',
  'to_discuss',
  'to_remember',
  'to_know'
] as const

/** The db default when a draft names no class ("something to do"). */
export const DEFAULT_INTENT_CLASS = 'to_do'

/** Pre-alignment class values, mapped forward. Applied at every boundary a
 *  legacy value can still enter: model output (stale prompt caches, saved
 *  Flows), sync arrivals from un-updated peers, stored widget/section keys.
 *  The startup migration (migrateIntentTaxonomyV2) rewrites stored rows with
 *  this same map — one table, two consumers, no drift. */
export const LEGACY_INTENT_CLASS_MAP: Readonly<Record<string, string>> = {
  action: 'to_do',
  review: 'to_review',
  scheduling: 'to_meet',
  fyi: 'to_know',
  acknowledgment: 'to_respond',
  direct: 'to_respond',
  discussion: 'to_discuss',
  loose_thought: 'to_remember'
}

/** Canonical form of any intent-class value: a current class passes through,
 *  a legacy class maps forward, anything else is undefined (the db default
 *  then applies). */
export function canonicalIntentClass(v: unknown): string | undefined {
  const s = String(v)
  if ((INTENT_CLASSES as readonly string[]).includes(s)) return s
  return LEGACY_INTENT_CLASS_MAP[s]
}

/** Validate a model-supplied intent class; undefined for anything else (the
 *  db default then applies). Used by every proposal parser. Legacy values
 *  normalize forward rather than falling to the default. */
export function normalizeIntentClass(v: unknown): string | undefined {
  return canonicalIntentClass(v)
}

/** §2.3 (A-02): the derived coarse projection. Computed at every write and
 *  recomputed at every sync apply — never authoritative, never written from
 *  the wire. Dismissed/reclassified → 'parked', NEVER 'done'. The 'open'
 *  bucket is a legacy-compatibility value only, never a "needs me" signal
 *  (F013): every Attention count derives from work_item_state exclusively. */
export function statusForWorkItemState(
  state: string
): 'open' | 'in_progress' | 'done' | 'parked' {
  switch (state) {
    case 'in_progress':
    case 'delegated':
    case 'needs_review':
    case 'needs_approval':
      return 'in_progress'
    case 'acknowledged':
    case 'answered':
    case 'scheduled':
    case 'delivered':
    case 'reviewed':
    case 'completed':
    case 'discussed':
    case 'decided':
      return 'done'
    case 'dismissed':
    case 'reclassified':
    case 'archived':
      return 'parked'
    default:
      // open, suggested, stale, waiting, blocked — and unknown future states,
      // which coarsen conservatively into the legacy bucket.
      return 'open'
  }
}
