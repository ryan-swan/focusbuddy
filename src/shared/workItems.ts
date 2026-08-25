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

export const WORK_ITEM_STATES = [
  // non-terminal
  'open',
  'in_progress',
  'waiting',
  'needs_review',
  'needs_approval',
  'delegated',
  'blocked',
  'suggested',
  'stale',
  // terminal
  'acknowledged',
  'answered',
  'scheduled',
  'delivered',
  'reviewed',
  'completed',
  'discussed',
  'dismissed',
  'reclassified'
] as const
export type WorkItemState = (typeof WORK_ITEM_STATES)[number]

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
      return 'done'
    case 'dismissed':
    case 'reclassified':
      return 'parked'
    default:
      // open, suggested, stale, waiting, blocked — and unknown future states,
      // which coarsen conservatively into the legacy bucket.
      return 'open'
  }
}
