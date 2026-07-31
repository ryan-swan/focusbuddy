// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { replayVisibleTo, orderedWithinPartitions, foldIdempotent } from '../../src/main/db/eventReplay'
import { createSubjectKeyRegistry } from '../../src/main/privacy/subjectKeys'
import { sealPersonalData, openPersonalData, type PersonalDataRef } from '../../src/main/privacy/personalData'
import { scoreMateriality, type MaterialityInput } from '../../src/main/context/materiality'
import { generateResume } from '../../src/main/resume/resume'
import { summariseResume } from '../../src/main/ai/resumeSummary'
import { createSummaryCache } from '../../src/main/ai/summaryCache'
import type { Principal } from '../../src/shared/permission'

// Event processing soundness (spec §48, §64, §80). Deterministic-before-AI,
// AI-failure-tolerant, out-of-order-tolerant consumers, historical-permission
// replay, and per-subject-encrypted payloads.

const material: MaterialityInput = {
  affectedObjectCount: 6, decisionImpact: 'high', relationshipDepth: 1,
  organisationalReach: 'org', userRole: 'owner', workflowStage: 'final', historicalSignificance: 0.6
}

describe('plx_evt_020 — deterministic processing completes before any AI', () => {
  it('test_plx_evt_020_health_and_resume_need_no_model', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'd1', changeSummary: 'x' })
    // Materiality is synchronous and pure — a value, not a promise, no model call.
    const m = scoreMateriality(material)
    expect(m instanceof Promise).toBe(false)
    expect(typeof m.score).toBe('number')
    // A complete Resume is produced with no AI stage run.
    const resume = generateResume(db, { deskId: 'd1', forUserId: 'sam', objectIds: ['d1'], sinceCursor: -1 })
    expect(resume.aiSummary).toBeNull()
    expect(resume.summary.length).toBeGreaterThan(0)
  })
})

describe('plx_evt_021 — AI failure never blocks event-derived processing', () => {
  it('test_plx_evt_021_summary_degrades_not_fails', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'd1', changeSummary: 'x' })
    const resume = generateResume(db, { deskId: 'd1', forUserId: 'sam', objectIds: ['d1'], sinceCursor: -1 })
    const cache = createSummaryCache(db)
    const r = summariseResume(resume, { generate: () => { throw new Error('AI down') }, cache, model: 'm', promptVersion: 'p', now: 't' })
    expect(r.degraded).toBe(true)
    expect(r.resume.summary.length).toBeGreaterThan(0) // still fully usable
  })
})

describe('plx_evt_024 — consumers tolerate out-of-order and duplicate delivery', () => {
  it('test_plx_evt_024_fold_orders_within_partition_ignores_arrival_order', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    // Two partitions (two desks); several events each.
    const a1 = es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', deskId: 'A', objectId: 'A', changeSummary: 'a1' })
    const a2 = es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', deskId: 'A', objectId: 'A', changeSummary: 'a2' })
    const b1 = es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', deskId: 'B', objectId: 'B', changeSummary: 'b1' })
    // Ordering: a scrambled (but not duplicated) batch orders by sequence within
    // each partition, regardless of arrival order.
    const byPartition = orderedWithinPartitions([b1, a2, a1])
    expect(byPartition.get('A')!.map((e) => e.sequence)).toEqual([1, 2])
    // Idempotency: with a duplicate of a1 in the batch, the consumer applies it
    // once. Dedup is the consumer's job (foldIdempotent), not the ordering step.
    const seenSummaries = foldIdempotent([b1, a2, a1, a1], [] as string[], (s, e) => [...s, e.changeSummary ?? ''])
    expect(seenSummaries.filter((x) => x === 'a1')).toHaveLength(1)
    expect(seenSummaries).toContain('a2')
    expect(seenSummaries).toContain('b1')
  })
})

describe('plx_evt_033 — replay evaluates access against the historical snapshot', () => {
  it('test_plx_evt_033_replay_uses_event_permissions_not_current', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    // Event 1 was readable by anyone in the org (empty grants). Event 2 was
    // restricted to user:boss at emission.
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', deskId: 'D', objectId: 'D', changeSummary: 'open', permissions: { grants: [] } })
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', deskId: 'D', objectId: 'D', changeSummary: 'restricted', permissions: { grants: [{ principal: 'user:boss', capability: 'read' }] } })
    const all = es.replayDesk('D')
    const alice: Principal = { id: 'user:alice', organisationId: 'org' }
    const boss: Principal = { id: 'user:boss', organisationId: 'org' }
    // Alice sees only the historically-open Event; the restricted one stays hidden.
    expect(replayVisibleTo(all, alice).map((e) => e.changeSummary)).toEqual(['open'])
    // Boss, named in the snapshot, sees both.
    expect(replayVisibleTo(all, boss).map((e) => e.changeSummary).sort()).toEqual(['open', 'restricted'])
    // A different org sees nothing (SEC-011 at replay).
    expect(replayVisibleTo(all, { id: 'x', organisationId: 'org-2' })).toHaveLength(0)
  })
})

describe('plx_evt_034 — personal data in Event payloads is under a per-subject key', () => {
  it('test_plx_evt_034_erasing_the_key_darkens_the_payload_not_the_event', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    const keys = createSubjectKeyRegistry(db)
    // Seal the PII, put only the sealed reference into the Event payload.
    const ref = sealPersonalData(keys, 'subject:alice', 'alice@example.com', '2026-07-30T00:00:00Z')
    const evt = es.append({
      eventType: 'MemberInvited', category: 'user', actor: 'admin', organisationId: 'org', objectId: 'subject:alice',
      currentState: { emailRef: ref as unknown as Record<string, unknown> }, changeSummary: 'invited'
    })
    // The Event payload never held the clear address.
    const stored = db.prepare('SELECT current_state FROM events WHERE id = ?').get(evt.id) as { current_state: string }
    expect(stored.current_state).not.toContain('alice@example.com')
    // Before erasure the reference opens.
    const back = JSON.parse(stored.current_state).emailRef as PersonalDataRef
    expect(openPersonalData(keys, back)).toEqual({ status: 'ok', value: 'alice@example.com' })
    // Erase: destroy the key. The Event record persists; the payload goes dark.
    keys.destroyKey('subject:alice')
    expect(openPersonalData(keys, back)).toEqual({ status: 'erased' })
    expect((db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(1) // record intact
  })
})
