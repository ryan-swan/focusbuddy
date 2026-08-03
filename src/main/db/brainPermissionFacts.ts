// U1b — the record side of the brain permission floor. Reads the facts shared/brainPermission.ts
// judges: which organisation owns a projected node, and its privacy tier.
//
// WHY THIS EXISTS RATHER THAN REUSING getBrainNodeBySource
// --------------------------------------------------------
// getBrainNodeBySource() filters `AND org_id = ?` on the ACTIVE org. That is correct for every
// other caller — projection, re-index, spine resolution all want the current tenant's row and
// nothing else. It is exactly wrong for a permission decision, and dangerously so: a foreign-org
// row comes back as null, the resolver reads null as "not projected yet", and the null-spine
// fallback then PERMITS it. An org-scoped lookup silently inverts the SEC-011 check it was supposed
// to feed.
//
// So this reader deliberately does NOT filter by org. It surfaces org_id so the decision layer can
// judge it. The rule it encodes: whatever performs the org check must be able to SEE a foreign org;
// a lookup that hides one cannot enforce against it.
//
// Locked against a real two-organisation database in tests/unit/plxSecBrainPermissionFacts.test.ts.

import type { SqlDb } from './eventStore'
import type { BrainPermissionFacts } from '../../shared/brainPermission'
import type { Sensitivity } from '../../shared/brainGraph'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'

interface FactsRow {
  org_id: string
  sensitivity: string
}

/**
 * The permission facts for a projected node, or null when the source has no projected node at all.
 *
 * NOT org-filtered, by design — see the header. A row belonging to another organisation is
 * RETURNED, carrying its real org_id, so the decision layer can refuse it. Distinguishing
 * "belongs to someone else" from "not projected yet" is the entire point.
 */
export function readBrainPermissionFacts(
  db: SqlDb,
  sourceTable: string,
  sourceId: string
): BrainPermissionFacts | null {
  const row = db
    .prepare('SELECT org_id, sensitivity FROM brain_nodes WHERE source_table = ? AND source_id = ?')
    .get(sourceTable, sourceId) as FactsRow | undefined
  if (!row) return null
  return { orgId: row.org_id, sensitivity: row.sensitivity as Sensitivity }
}

/**
 * Whether the store PROVABLY holds exactly one organisation's rows.
 *
 * shared/brainPermission.ts resolves an unprojected chunk's org to the store's active org. That is
 * a real derivation while this holds and a guess the moment it does not, so the fact is measured
 * here and passed in — never assumed. An empty brain_nodes table counts as single-org: there is no
 * second organisation's data to leak.
 */
export function storeIsSingleOrg(db: SqlDb, activeOrgId: string): boolean {
  const rows = db.prepare('SELECT DISTINCT org_id FROM brain_nodes').all() as Array<{ org_id: string }>
  return rows.length === 0 || (rows.length === 1 && rows[0].org_id === activeOrgId)
}

/** Production convenience: the same two reads bound to the app database and active org. */
export function brainPermissionContext(): {
  lookupBySource: (sourceTable: string, sourceId: string) => BrainPermissionFacts | null
  storeOrgId: string
  storeIsSingleOrg: boolean
} {
  const db = getDb() as unknown as SqlDb
  const storeOrgId = getActiveOrgId()
  return {
    lookupBySource: (t, id) => readBrainPermissionFacts(db, t, id),
    storeOrgId,
    storeIsSingleOrg: storeIsSingleOrg(db, storeOrgId)
  }
}
