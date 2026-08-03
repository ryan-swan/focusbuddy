// @vitest-environment node
//
// U1b — the record side of the permission floor, locked against a REAL two-organisation database.
//
// This file exists because of a defect found while wiring U1b, not one imagined afterwards.
// getBrainNodeBySource() filters `AND org_id = ?` on the active org — correct for projection and
// spine resolution, and silently catastrophic for a permission decision: a foreign-org row returns
// null, shared/brainPermission.ts reads null as "not projected yet", and the null-spine fallback
// PERMITS it. An org-scoped lookup inverts the very SEC-011 check it feeds.
//
// A pure test cannot catch that. The resolver behaves correctly given its inputs; the bug is in
// which row the lookup hands it. So this runs against real SQLite with two organisations' rows in
// one table — the only shape in which the defect is observable.

import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { readBrainPermissionFacts, storeIsSingleOrg } from '../../src/main/db/brainPermissionFacts'
import { makeBrainCanRead } from '../../src/shared/brainPermission'
import type { Principal } from '../../src/shared/permission'
import type { SqlDb } from '../../src/main/db/eventStore'

const me: Principal = { id: 'caleb@local', organisationId: 'personal' }

function dbWith(rows: Array<{ id: string; org: string; table: string; source: string; sensitivity?: string }>): SqlDb {
  const db = memSqlDb()
  db.exec(`CREATE TABLE brain_nodes (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'personal',
    sensitivity TEXT NOT NULL DEFAULT 'normal',
    source_table TEXT,
    source_id TEXT
  );`)
  for (const r of rows) {
    db.prepare('INSERT INTO brain_nodes (id, org_id, sensitivity, source_table, source_id) VALUES (?, ?, ?, ?, ?)')
      .run(r.id, r.org, r.sensitivity ?? 'normal', r.table, r.source)
  }
  return db
}

describe('plx_sec_011 — the lookup can SEE a foreign organisation, so the floor can refuse it', () => {
  it('test_plx_sec_011_foreign_org_row_is_returned_not_hidden', () => {
    const db = dbWith([
      { id: 'n1', org: 'personal', table: 'documents', source: 'mine' },
      { id: 'n2', org: 'acme-corp', table: 'documents', source: 'theirs' }
    ])

    // The distinction the whole floor rests on: "belongs to another org" must not look like
    // "not projected yet". Both would be null under an org-filtered read.
    expect(readBrainPermissionFacts(db, 'documents', 'theirs')).toEqual({ orgId: 'acme-corp', sensitivity: 'normal' })
    expect(readBrainPermissionFacts(db, 'documents', 'mine')).toEqual({ orgId: 'personal', sensitivity: 'normal' })
    expect(readBrainPermissionFacts(db, 'documents', 'never-projected')).toBeNull()
  })

  // End to end through the real reader: the foreign row must be WITHHELD, and — the sharp part —
  // it must be withheld for the right reason. If the lookup were org-scoped this same assertion
  // would pass "true", because the row would arrive as null and take the permit-by-fallback path.
  it('test_plx_sec_011_foreign_org_is_withheld_end_to_end', () => {
    const db = dbWith([
      { id: 'n1', org: 'personal', table: 'documents', source: 'mine' },
      { id: 'n2', org: 'acme-corp', table: 'documents', source: 'theirs' }
    ])
    const canRead = makeBrainCanRead(
      me,
      (chunkId) => readBrainPermissionFacts(db, 'documents', chunkId),
      { allowRestricted: false, storeOrgId: 'personal', storeIsSingleOrg: storeIsSingleOrg(db, 'personal') }
    )
    expect(canRead('mine')).toBe(true)
    expect(canRead('theirs')).toBe(false)
  })
})

describe('plx_sec_011 — the single-org precondition is measured, not assumed', () => {
  it('test_plx_sec_011_store_is_single_org_is_measured', () => {
    expect(storeIsSingleOrg(dbWith([]), 'personal')).toBe(true) // empty: nothing to leak
    expect(storeIsSingleOrg(dbWith([{ id: 'a', org: 'personal', table: 't', source: 's' }]), 'personal')).toBe(true)
    // A second organisation present ⇒ an unprojected chunk's org can no longer be derived.
    expect(
      storeIsSingleOrg(
        dbWith([
          { id: 'a', org: 'personal', table: 't', source: 's1' },
          { id: 'b', org: 'acme-corp', table: 't', source: 's2' }
        ]),
        'personal'
      )
    ).toBe(false)
    // Single org, but not the one asking — the store's rows are someone else's entirely.
    expect(storeIsSingleOrg(dbWith([{ id: 'a', org: 'acme-corp', table: 't', source: 's' }]), 'personal')).toBe(false)
  })

  // The consequence, wired: once a second org exists in the store, unprojected content is refused
  // rather than resolved to the active org. Content the user owns becomes unfindable — which is the
  // correct trade at that point, and the signal that projection coverage must be closed (U4) before
  // the store is ever genuinely multi-tenant.
  it('test_plx_sec_011_multi_org_store_refuses_unprojected_content', () => {
    const db = dbWith([
      { id: 'a', org: 'personal', table: 'documents', source: 's1' },
      { id: 'b', org: 'acme-corp', table: 'documents', source: 's2' }
    ])
    const canRead = makeBrainCanRead(
      me,
      (chunkId) => readBrainPermissionFacts(db, 'documents', chunkId),
      { allowRestricted: false, storeOrgId: 'personal', storeIsSingleOrg: storeIsSingleOrg(db, 'personal') }
    )
    expect(canRead('s1')).toBe(true) // projected, this org
    expect(canRead('s2')).toBe(false) // projected, other org
    expect(canRead('unprojected')).toBe(false) // org underivable ⇒ refuse, never guess
  })
})

describe('architecture §5.3 — the tier is read from the record, not from the caller', () => {
  it('test_plx_sec_020_restricted_tier_comes_off_the_row', () => {
    const db = dbWith([
      { id: 'n1', org: 'personal', table: 'documents', source: 'open' },
      { id: 'n2', org: 'personal', table: 'documents', source: 'secret', sensitivity: 'restricted' }
    ])
    const lookup = (chunkId: string): ReturnType<typeof readBrainPermissionFacts> =>
      readBrainPermissionFacts(db, 'documents', chunkId)
    const base = { storeOrgId: 'personal', storeIsSingleOrg: true }

    expect(makeBrainCanRead(me, lookup, { ...base, allowRestricted: false })('secret')).toBe(false)
    expect(makeBrainCanRead(me, lookup, { ...base, allowRestricted: false })('open')).toBe(true)
    expect(makeBrainCanRead(me, lookup, { ...base, allowRestricted: true })('secret')).toBe(true)
  })
})
