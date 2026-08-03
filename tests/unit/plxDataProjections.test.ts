// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { createRelationshipStore, rebuildRelationshipGraph, type ProposeInput } from '../../src/main/db/relationshipStore'
import { createSummaryCache, structuredDigest } from '../../src/main/ai/summaryCache'
import { generateResume } from '../../src/main/resume/resume'
import { summariseResume } from '../../src/main/ai/resumeSummary'

// Derived stores are projections, rebuildable from the Event Store (spec §61,
// ADR-0001/0002). This is the load-bearing test for the event-sourcing bet: if the
// graph cannot be rebuilt from Events, it is secretly a system of record.

function edge(over: Partial<ProposeInput> = {}): ProposeInput {
  return {
    organisationId: 'org-1',
    sourceEntityId: 'A',
    targetEntityId: 'B',
    relationshipType: 'RelatedTo',
    confidence: 1,
    evidence: [{ kind: 'event', ref: 'e1', excerpt: null, weight: 1 }],
    discoveryMethod: 'user',
    correlationId: 'c1',
    confirmedBy: 'user:1',
    ...over
  }
}

describe('plx_data_002 / plx_data_003 — the graph is rebuildable from the Event Store', () => {
  it('test_plx_data_002_rebuilt_graph_equals_live_graph', () => {
    const liveDb = memSqlDb()
    const events = createEventStore(liveDb)
    const live = createRelationshipStore(liveDb, undefined, events) // event-sourced

    // A realistic lifecycle: propose (ai, provisional), confirm, propose another,
    // reject it, and change confidence on the first.
    const r1 = live.propose(edge({ discoveryMethod: 'ai', confirmedBy: null }))
    live.confirm(r1.id, 'user:1')
    const r2 = live.propose(edge({ targetEntityId: 'C', evidence: [{ kind: 'event', ref: 'e2', excerpt: null, weight: 1 }], discoveryMethod: 'ai', confirmedBy: null }))
    live.reject(r2.id, 'user:1')
    live.recomputeConfidence(r1.id, 0.95)

    // Rebuild a FRESH projection from the Event log alone, into a separate DB.
    const rebuiltDb = memSqlDb()
    const result = rebuildRelationshipGraph(liveDb, rebuiltDb)
    expect(result.applied).toBeGreaterThan(0)

    const rebuilt = createRelationshipStore(rebuiltDb)
    // Final state matches edge-for-edge.
    const norm = (rs: ReturnType<typeof createRelationshipStore>) =>
      rs.all().map((r) => ({ id: r.id, state: r.state, confidence: r.confidence, target: r.targetEntityId })).sort((a, b) => a.id.localeCompare(b.id))
    expect(norm(rebuilt)).toEqual(norm(live))
    // The confirmed edge surfaces identically after rebuild.
    expect(rebuilt.activeFor('A').map((r) => r.id)).toEqual(live.activeFor('A').map((r) => r.id))
    // The rejected edge is retained in the rebuilt projection too (PLX-GPH-005).
    expect(rebuilt.get(r2.id)?.state).toBe('rejected')
  })

  it('test_plx_data_003_event_store_is_the_source_of_record', () => {
    const liveDb = memSqlDb()
    const events = createEventStore(liveDb)
    const live = createRelationshipStore(liveDb, undefined, events)
    const r = live.propose(edge())
    live.confirm(r.id, 'user:1')
    // Dropping the derived projection loses nothing: it rebuilds fully from Events.
    liveDb.exec('DELETE FROM relationships')
    expect(createRelationshipStore(liveDb).all()).toHaveLength(0) // projection gone
    const rebuiltDb = memSqlDb()
    rebuildRelationshipGraph(liveDb, rebuiltDb)
    expect(createRelationshipStore(rebuiltDb).get(r.id)?.state).toBe('confirmed') // restored from the log
  })
})

describe('plx_data_011 — AI memory is derived; losing it loses no records', () => {
  it('test_plx_data_011_clearing_ai_cache_preserves_events_and_rebuilds', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'o', objectId: 'desk-1', changeSummary: 'x' })
    const resume = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1 })
    const cache = createSummaryCache(db)
    let calls = 0
    const generate = (): string => { calls++; return 'summary' }
    const opts = { generate, cache, model: 'm', promptVersion: 'p', now: 't' }
    summariseResume(resume, opts)
    expect(calls).toBe(1)

    // Wipe AI memory entirely.
    db.exec('DELETE FROM ai_summary_cache')
    // Events are untouched — the record of truth survives.
    expect((db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n).toBe(1)
    // And the summary simply rebuilds from the same structured input (recomputed).
    const after = summariseResume(resume, opts)
    expect(after.resume.aiSummary).toBe('summary')
    expect(calls).toBe(2) // had to recompute, but nothing was lost
    expect(structuredDigest(after.resume)).toBe(structuredDigest(resume))
  })
})
