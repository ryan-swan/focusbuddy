// Unit locks for the PURE live-ingest policy (plexi-brain I2b — src/shared/liveIngest.ts).
// No DB, no timers, no Electron: the clock is an argument, so every rule is asserted at an
// exact instant rather than by sleeping. Same isolation discipline as indexReconcile.test.ts
// (the delete policy) and rrf.test.ts (the fusion policy).

import { describe, it, expect } from 'vitest'
import {
  createState,
  markDirty,
  flushDecision,
  takeBatch,
  graphPassDue,
  markGraphClean,
  discardAll,
  DEFAULT_POLICY,
  type LiveIngestPolicy
} from '../../src/shared/liveIngest'

const P: LiveIngestPolicy = { quietMs: 1000, maxWaitMs: 5000, maxBatch: 3, graphIdleMs: 2000 }
const ref = (t: string, id: string): { sourceType: string; sourceId: string } => ({
  sourceType: t,
  sourceId: id
})

describe('I2b live-ingest policy — coalescing', () => {
  it('collapses a burst of edits to ONE source into ONE queue entry', () => {
    const s = createState(0)
    for (let i = 0; i < 50; i++) markDirty(s, ref('widget', 'w1'), 100 + i * 10)
    expect(s.dirty.size).toBe(1)
    expect(takeBatch(s, 2000, P).refs).toEqual([ref('widget', 'w1')])
  })

  it('keeps distinct sources distinct, and orders a batch deterministically', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'b'), 10)
    markDirty(s, ref('task', 'z'), 10)
    markDirty(s, ref('widget', 'a'), 10)
    expect(takeBatch(s, 100, P).refs).toEqual([ref('task', 'z'), ref('widget', 'a'), ref('widget', 'b')])
  })
})

describe('I2b live-ingest policy — when to flush', () => {
  it('does NOT flush while the burst is still going', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'w1'), 1000)
    expect(flushDecision(s, 1500, P)).toBeNull() // 500ms of quiet — not enough
  })

  it('flushes once the burst goes QUIET', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'w1'), 1000)
    expect(flushDecision(s, 2000, P)).toBe('quiet') // exactly quietMs
  })

  it('flushes on the CEILING even when writes never stop — the bounded-latency guarantee', () => {
    const s = createState(0)
    // A user typing continuously: a write every 300ms forever. The quiet window NEVER
    // opens, so without the ceiling this source would never be indexed.
    let t = 1000
    markDirty(s, ref('widget', 'w1'), t)
    for (; t < 5900; t += 300) {
      markDirty(s, ref('widget', 'w1'), t)
      expect(flushDecision(s, t, P)).toBeNull()
    }
    expect(flushDecision(s, 6000, P)).toBe('ceiling') // firstMarkAt(1000) + maxWaitMs(5000)
  })

  it('a continuously-edited source cannot starve itself — the ceiling clock is the OLDEST mark', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'w1'), 1000)
    markDirty(s, ref('widget', 'w1'), 4000) // re-marking must NOT push firstMarkAt out
    expect(s.firstMarkAt).toBe(1000)
    expect(flushDecision(s, 6000, P)).toBe('ceiling')
  })

  it('an empty queue never flushes', () => {
    const s = createState(0)
    expect(flushDecision(s, 999_999, P)).toBeNull()
  })
})

describe('I2b live-ingest policy — batching', () => {
  it('caps a batch at maxBatch and reports that more remain', () => {
    const s = createState(0)
    for (const id of ['a', 'b', 'c', 'd', 'e']) markDirty(s, ref('widget', id), 10)
    const first = takeBatch(s, 100, P)
    expect(first.refs).toHaveLength(3)
    expect(first.more).toBe(true)
    const second = takeBatch(s, 200, P)
    expect(second.refs).toHaveLength(2)
    expect(second.more).toBe(false)
  })

  it('leftovers are re-based to now, so they are not instantly "overdue"', () => {
    const s = createState(0)
    for (const id of ['a', 'b', 'c', 'd']) markDirty(s, ref('widget', id), 10)
    takeBatch(s, 9_000, P)
    expect(s.firstMarkAt).toBe(9_000)
  })

  it('a drained queue resets its clocks and starts the idle window', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'a'), 10)
    takeBatch(s, 500, P)
    expect(s.dirty.size).toBe(0)
    expect(s.firstMarkAt).toBeNull()
    expect(s.lastMarkAt).toBeNull()
    expect(s.emptySince).toBe(500)
  })
})

describe('I2b live-ingest policy — the idle graph pass (F-12)', () => {
  it('does not run when nothing has been flushed', () => {
    const s = createState(0)
    expect(graphPassDue(s, 999_999, P)).toBe(false)
  })

  it('does not run while sources are still waiting to be indexed', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'a'), 10)
    takeBatch(s, 100, P) // graphDirty = true
    markDirty(s, ref('widget', 'b'), 200) // new work arrives
    expect(graphPassDue(s, 999_999, P)).toBe(false)
  })

  it('runs once the queue has been EMPTY for graphIdleMs', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'a'), 10)
    takeBatch(s, 100, P)
    expect(graphPassDue(s, 2_099, P)).toBe(false)
    expect(graphPassDue(s, 2_100, P)).toBe(true)
  })

  it('collapses a THOUSAND edits into ONE graph pass — the whole point of F-12', () => {
    const s = createState(0)
    let t = 0
    let flushes = 0
    for (let i = 0; i < 1000; i++) {
      markDirty(s, ref('widget', `w${i}`), t)
      t += 50
      if (flushDecision(s, t, P)) {
        takeBatch(s, t, P)
        flushes++
      }
    }
    // Drain whatever is left, then let it go idle. BOUNDED deliberately: an
    // implementation whose takeBatch fails to remove what it returned would spin here
    // forever, and a lock that hangs is a lock that reports nothing. Fail loudly instead.
    let guard = 0
    while (s.dirty.size > 0) {
      t += 100
      takeBatch(s, t, P)
      flushes++
      expect(++guard).toBeLessThan(2000) // 1000 sources / maxBatch 3 ⇒ ~334 iterations
    }
    expect(flushes).toBeGreaterThan(1) // many chunk-level flushes…
    expect(graphPassDue(s, t + P.graphIdleMs, P)).toBe(true)
    markGraphClean(s)
    expect(graphPassDue(s, t + 10 * P.graphIdleMs, P)).toBe(false) // …but ONE graph pass
  })
})

describe('I2b live-ingest policy — DEC-012 discard', () => {
  it('discardAll empties the queue and clears the graph-dirty flag', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'a'), 10)
    markDirty(s, ref('task', 'b'), 10)
    takeBatch(s, 100, P)
    markDirty(s, ref('widget', 'c'), 200)
    const dropped = discardAll(s, 300)
    expect(dropped).toBe(1)
    expect(s.dirty.size).toBe(0)
    expect(s.graphDirty).toBe(false)
    expect(flushDecision(s, 999_999, P)).toBeNull()
    expect(graphPassDue(s, 999_999, P)).toBe(false)
  })
})

describe('I2b live-ingest policy — the shipped defaults', () => {
  it('a single edit is findable well inside the "within seconds" claim', () => {
    const s = createState(0)
    markDirty(s, ref('widget', 'w1'), 0)
    expect(flushDecision(s, DEFAULT_POLICY.quietMs, DEFAULT_POLICY)).toBe('quiet')
    expect(DEFAULT_POLICY.quietMs).toBeLessThanOrEqual(2_000)
  })

  it('the worst case is BOUNDED — continuous typing still lands within maxWaitMs', () => {
    expect(DEFAULT_POLICY.maxWaitMs).toBeLessThanOrEqual(10_000)
    expect(DEFAULT_POLICY.maxWaitMs).toBeGreaterThan(DEFAULT_POLICY.quietMs)
  })

  it('the graph cadence is SLOWER than the chunk cadence — chunks first, graph after', () => {
    expect(DEFAULT_POLICY.graphIdleMs).toBeGreaterThan(DEFAULT_POLICY.maxWaitMs)
  })
})
