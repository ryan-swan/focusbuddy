import { describe, it, expect } from 'vitest'
import {
  newORSet,
  orAdd,
  orRemove,
  orValues,
  orMerge,
  orCompact,
  lwwMerge,
  isDeterministicClass,
  aiMayResolveConflict,
  reconcileOffline,
  ingestOffline,
  surfaceConflict,
  type OfflineEvent
} from '../../src/main/sync/crdt'

// CRDT synchronisation (spec §50).

describe('plx_syn_001 — CRDT merge converges (commutative, idempotent)', () => {
  it('test_plx_syn_001_convergence', () => {
    // Two replicas edit concurrently, then merge in either order -> same result.
    let a = orAdd(newORSet<string>(), 'x', 'a1')
    let b = orAdd(newORSet<string>(), 'y', 'b1')
    a = orRemove(a, 'x') // replica A removes x it added
    const ab = orMerge(a, b)
    const ba = orMerge(b, a)
    expect(orValues(ab).sort()).toEqual(orValues(ba).sort()) // commutative
    expect(orValues(ab)).toEqual(['y'])
    // Idempotent: merging with itself changes nothing.
    expect(orValues(orMerge(ab, ab)).sort()).toEqual(orValues(ab).sort())
  })
  it('test_plx_syn_001_concurrent_add_remove_add_wins', () => {
    // A removes x; B concurrently re-adds x with a fresh tag -> x survives (OR-Set).
    let a = orAdd(newORSet<string>(), 'x', 't1')
    const b = orAdd(a, 'x', 't2') // B re-adds with a new observed tag
    a = orRemove(a, 'x') // A removes the tag it observed (t1)
    expect(orValues(orMerge(a, b))).toEqual(['x'])
  })
})

describe('plx_syn_002 — tombstone compaction bounds growth', () => {
  it('test_plx_syn_002_compact', () => {
    let s = orAdd(newORSet<string>(), 'x', 't1')
    s = orRemove(s, 'x')
    expect(s.adds.has('t1')).toBe(true) // dead tag still present pre-compaction
    const c = orCompact(s)
    expect(c.adds.has('t1')).toBe(false) // dropped
    expect(orValues(c)).toEqual([]) // value unchanged by compaction
  })
})

describe('plx_syn_003 — deterministic conflict resolution, no AI for deterministic classes', () => {
  it('test_plx_syn_003_lww_and_class_policy', () => {
    const a = { value: 'A', timestamp: 100, actor: 'user:a' }
    const b = { value: 'B', timestamp: 200, actor: 'user:b' }
    expect(lwwMerge(a, b).value).toBe('B') // higher timestamp wins
    // Tie broken deterministically by actor id.
    expect(lwwMerge({ value: 'A', timestamp: 100, actor: 'user:z' }, { value: 'B', timestamp: 100, actor: 'user:a' }).value).toBe('A')
    expect(isDeterministicClass('text')).toBe(true)
    expect(aiMayResolveConflict('text')).toBe(false) // AI never resolves deterministic classes
    expect(aiMayResolveConflict('decision')).toBe(true)
  })
})

describe('plx_syn_010 / plx_syn_011 — offline reconciliation without renumber/dup/loss', () => {
  const evts: OfflineEvent[] = [
    { id: 'c-1', timestamp: '2026-07-30T00:00:00Z', partitionKey: 'd', sequence: 1 },
    { id: 'c-2', timestamp: '2026-07-30T00:01:00Z', partitionKey: 'd', sequence: 2 }
  ]
  it('test_plx_syn_010_client_ids_reconcile', () => {
    // c-1 already reached the server; c-2 is new. Ids are kept, no duplication, no loss.
    const r = reconcileOffline(evts, new Set(['c-1']))
    expect(r.ingested.map((e) => e.id)).toEqual(['c-2'])
    expect(r.duplicates).toEqual(['c-1'])
    expect(r.ingested[0].id).toBe('c-2') // id preserved, not renumbered
  })
  it('test_plx_syn_011_preserves_timestamp_distinct_recordedAt', () => {
    const ing = ingestOffline(evts[0], '2026-07-30T06:00:00Z')
    expect(ing.timestamp).toBe('2026-07-30T00:00:00Z') // occurrence time preserved
    expect(ing.recordedAt).toBe('2026-07-30T06:00:00Z') // distinct ingestion time
  })
})

describe('plx_syn_012 — unmergeable class surfaces both versions intact', () => {
  it('test_plx_syn_012_conflict_surfaced', () => {
    const c = surfaceConflict('decision', { pick: 'A' }, { pick: 'B' })
    expect(c.bothIntact).toBe(true)
    expect(c.requiresUserResolution).toBe(true)
    expect(c.local).toEqual({ pick: 'A' })
    expect(c.remote).toEqual({ pick: 'B' })
    // A deterministic class must NOT surface a manual conflict.
    expect(() => surfaceConflict('text', 'A', 'B')).toThrow(/PLX-SYN-003/)
  })
})
