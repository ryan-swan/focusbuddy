import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { createSubjectKeyRegistry } from '../../src/main/privacy/subjectKeys'
import { sealPersonalData, openPersonalData } from '../../src/main/privacy/personalData'
import { DATA_INVENTORY, personalDataStores } from '../../src/main/privacy/dataInventory'
import {
  eraseSubject,
  serviceDsar,
  retentionAllows,
  assertRetentionTarget,
  DELETION_STATEMENT
} from '../../src/main/privacy/erasure'

// Cryptographic erasure carve-out (spec §44.1, ADR-0003). Events stay immutable;
// erasure destroys the per-subject key so sealed data goes dark, records intact.

function setup() {
  const db = memSqlDb()
  const es = createEventStore(db)
  const keys = createSubjectKeyRegistry(db)
  return { db, es, keys }
}

describe('plx_sec_030 / plx_dom_032 — sealed personal data, erased by destroying the key', () => {
  it('test_plx_dom_032_personal_data_sealed_and_referenced_by_digest', () => {
    const { keys } = setup()
    const ref = sealPersonalData(keys, 'subject:alice', 'alice@example.com', '2026-07-30T00:00:00Z')
    // The reference holds ciphertext + a content digest, never the clear value.
    expect(ref.ciphertext).not.toContain('alice')
    expect(JSON.stringify(ref)).not.toContain('alice@example.com')
    expect(ref.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(openPersonalData(keys, ref)).toEqual({ status: 'ok', value: 'alice@example.com' })
  })
  it('test_plx_sec_030_key_destruction_makes_data_unrecoverable', () => {
    const { keys } = setup()
    const ref = sealPersonalData(keys, 'subject:alice', 'sensitive', '2026-07-30T00:00:00Z')
    expect(openPersonalData(keys, ref).status).toBe('ok')
    keys.destroyKey('subject:alice')
    // Same ciphertext, no key -> permanent tombstone, not clear text, not a throw.
    expect(openPersonalData(keys, ref)).toEqual({ status: 'erased' })
    // Irreversible: there is no restore, and re-ensuring makes a NEW key that
    // cannot open the old ciphertext.
    keys.ensureKey('subject:alice')
    expect(openPersonalData(keys, ref).status).toBe('erased')
  })
})

describe('plx_inv_05 / plx_dom_015 / plx_prd_012 — erasure keeps the record, not the data', () => {
  it('test_plx_inv_05_erasure_destroys_key_not_events', () => {
    const { db, es, keys } = setup()
    // A few real Events for the subject.
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'subject:alice', organisationId: 'org', objectId: 'desk-1', changeSummary: 'x' })
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'subject:alice', organisationId: 'org', objectId: 'desk-1', changeSummary: 'y' })
    sealPersonalData(keys, 'subject:alice', 'pii', '2026-07-30T00:00:00Z')
    const before = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n

    const report = eraseSubject(db, keys, (i) => es.append(i), { organisationId: 'org', actor: 'admin', subjectId: 'subject:alice' })
    expect(report.keyDestroyed).toBe(true)
    // The log only GREW (by the SubjectErased Event); no Event was removed (INV-05).
    const after = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
    expect(after).toBe(before + 1)
    expect(keys.hasKey('subject:alice')).toBe(false)
    // The erasure is itself recorded (§44.1).
    const erased = db.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type = 'SubjectErased'").get() as { n: number }
    expect(erased.n).toBe(1)
  })
  it('test_plx_prd_013_deletion_statement_is_accurate_and_present', () => {
    expect(DELETION_STATEMENT.length).toBeGreaterThan(40)
    expect(DELETION_STATEMENT.toLowerCase()).toContain('history')
    expect(DELETION_STATEMENT.toLowerCase()).toContain('erase')
  })
})

describe('plx_sec_031 / plx_data_006 — data inventory catalogues every store', () => {
  it('test_plx_sec_031_inventory_records_basis_retention_and_erasure', () => {
    expect(DATA_INVENTORY.length).toBeGreaterThan(0)
    for (const e of DATA_INVENTORY) {
      expect(e.lawfulBasis.length).toBeGreaterThan(0)
      expect(e.retentionClass.length).toBeGreaterThan(0)
      expect(['crypto-shred', 'projection-rebuild', 'row-delete', 'not-applicable']).toContain(e.erasureMechanism)
    }
    // The immutable Event store erases by crypto-shred, never by deletion.
    const events = DATA_INVENTORY.find((e) => e.store === 'events')!
    expect(events.erasureMechanism).toBe('crypto-shred')
    // Every personal-data store has a real erasure mechanism (not "not-applicable").
    expect(personalDataStores().every((e) => e.erasureMechanism !== 'not-applicable')).toBe(true)
  })
})

describe('plx_sec_032 — DSAR is servicable and honest after erasure', () => {
  it('test_plx_sec_032_dsar_returns_data_then_reports_erased', () => {
    const { keys } = setup()
    const ref = sealPersonalData(keys, 'subject:alice', 'alice@example.com', '2026-07-30T00:00:00Z')
    const fields = [{ store: 'events', ref }]
    const before = serviceDsar(keys, 'subject:alice', fields)
    expect(before.recoverable).toBe(true)
    expect(before.fields[0].result).toEqual({ status: 'ok', value: 'alice@example.com' })
    expect(before.storesInScope).toContain('events')
    keys.destroyKey('subject:alice')
    const after = serviceDsar(keys, 'subject:alice', fields)
    expect(after.recoverable).toBe(false)
    expect(after.fields[0].result).toEqual({ status: 'erased' }) // honest, not fabricated
  })
})

describe('plx_data_012 — retention can never prune Events or Decision alternatives', () => {
  it('test_plx_data_012_protected_targets_refused', () => {
    expect(retentionAllows('stale-drafts')).toBe(true)
    expect(retentionAllows('events')).toBe(false)
    expect(retentionAllows('decision.alternatives')).toBe(false)
    expect(() => assertRetentionTarget('events')).toThrow(/PLX-DATA-012/)
    expect(() => assertRetentionTarget('alternatives')).toThrow(/PLX-DATA-012/)
    expect(() => assertRetentionTarget('stale-drafts')).not.toThrow()
  })
})
