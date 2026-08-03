// Erasure, DSAR and retention guards (spec §44.1, PLX-SEC-030/031/032, DATA-012,
// PRD-013; ADR-0003). The erasure carve-out in one place: destroy the subject's
// key, record the action as an Event, and leave every Event/Relationship/Decision
// record standing. Nothing here mutates or deletes an Event.

import type { AppendInput, SqlDb } from '../db/eventStore'
import type { SubjectKeyRegistry } from './subjectKeys'
import { openPersonalData, type OpenResult, type PersonalDataRef } from './personalData'
import { DATA_INVENTORY, personalDataStores } from './dataInventory'

// Plain-language statement shown at the point of deletion (PLX-PRD-013). Accurate:
// it states what deletion does and does not remove.
export const DELETION_STATEMENT =
  'Deleting this removes it from your views and search. Its history, its links to ' +
  'other work, and the record of decisions it touched are kept, so nothing you or ' +
  'your team relied on silently disappears. To permanently erase a person’s data, ' +
  'use erasure, which destroys the key that protects it.'

// The Event that records an erasure action itself (§44.1). It carries no personal
// data, only the subject id and the stores visited.
export function subjectErasedEvent(organisationId: string, actor: string, subjectId: string, storesVisited: string[]): AppendInput {
  return {
    eventType: 'SubjectErased',
    category: 'security',
    actor,
    organisationId,
    objectId: subjectId,
    currentState: { subjectId, storesVisited, mechanism: 'crypto-erasure' },
    changeSummary: `Cryptographic erasure of subject ${subjectId}`,
    confidence: 1
  }
}

export interface ErasureReport {
  subjectId: string
  keyDestroyed: boolean
  storesVisited: string[]
  eventsRetained: number // proof that history was not deleted (INV-05)
}

// Execute cryptographic erasure. Destroys the key (making sealed data
// unrecoverable), clears derived per-subject rows, records a SubjectErased Event,
// and asserts the immutable log was not shrunk.
export function eraseSubject(
  db: SqlDb,
  keys: SubjectKeyRegistry,
  append: (input: AppendInput) => unknown,
  args: { organisationId: string; actor: string; subjectId: string }
): ErasureReport {
  const before = eventCount(db)
  const keyDestroyed = keys.destroyKey(args.subjectId) // SEC-030 — irreversible

  // Clear derived per-subject rows named in the inventory (they rebuild/are caches;
  // clearing them is not deleting organisational memory). Events are NEVER touched.
  const visited: string[] = []
  if (tableExists(db, 'ai_summary_cache')) {
    db.exec('DELETE FROM ai_summary_cache') // AI memory is derived (DATA-011)
    visited.push('ai_summary_cache')
  }
  if (tableExists(db, 'context_review_points')) {
    db.prepare('DELETE FROM context_review_points WHERE user_id = ?').run(args.subjectId)
    visited.push('context_review_points')
  }
  if (keyDestroyed) visited.push('subject_keys')
  visited.push('events') // via crypto-shred; the record stays, the payload is dark

  append(subjectErasedEvent(args.organisationId, args.actor, args.subjectId, visited))

  const after = eventCount(db)
  // The log only grew (by the SubjectErased Event). It was never shrunk (INV-05).
  if (after < before) throw new Error('Erasure removed Event records — INV-05 violated.')
  return { subjectId: args.subjectId, keyDestroyed, storesVisited: visited, eventsRetained: after }
}

export interface DsarField {
  store: string
  ref: PersonalDataRef
}
export interface DsarResult {
  subjectId: string
  recoverable: boolean
  fields: Array<{ store: string; result: OpenResult }>
  storesInScope: string[]
}

// Service a data-subject access request (PLX-SEC-032). Opens each sealed field with
// the live key. After erasure the same call honestly reports the data as erased
// rather than fabricating a record.
export function serviceDsar(keys: SubjectKeyRegistry, subjectId: string, fields: DsarField[]): DsarResult {
  const opened = fields
    .filter((f) => f.ref.subjectId === subjectId)
    .map((f) => ({ store: f.store, result: openPersonalData(keys, f.ref) }))
  return {
    subjectId,
    recoverable: keys.hasKey(subjectId),
    fields: opened,
    storesInScope: personalDataStores().map((e) => e.store)
  }
}

// Retention guard (PLX-DATA-012): a retention policy MUST NOT be able to prune
// Event records or Decision alternatives. This refuses those targets by
// construction, so a mis-configured policy cannot reach them.
const PROTECTED_TARGETS = new Set(['events', 'event', 'decision.alternatives', 'alternatives'])
export function retentionAllows(target: string): boolean {
  return !PROTECTED_TARGETS.has(target)
}
export function assertRetentionTarget(target: string): void {
  if (!retentionAllows(target)) {
    throw new Error(`Retention MUST NOT prune "${target}" (PLX-DATA-012 / INV-05 / DOM-043).`)
  }
}

function eventCount(db: SqlDb): number {
  if (!tableExists(db, 'events')) return 0
  return (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
}
function tableExists(db: SqlDb, name: string): boolean {
  return !!(db.prepare("SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name = ?").get(name) as { n: number } | undefined)
}

export { DATA_INVENTORY }
