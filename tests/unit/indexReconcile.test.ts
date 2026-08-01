import { describe, it, expect } from 'vitest'
import { planReconcile, sourceRefKey, type SourceRef } from '../../src/shared/indexReconcile'

// I0b — the reconcile POLICY (the rule that decides what leaves the index).
//
// The adversarial cases matter more than the happy path here: the failure mode of a
// prune rule is not "it missed something", it is "it deleted a live corpus because a
// collector hiccuped". Every guard below was written against a specific way this could
// destroy data.

const ref = (sourceType: string, sourceId: string): SourceRef => ({ sourceType, sourceId })
const ALL = new Set(['widget', 'task', 'document', 'knowledge'])
const ids = (refs: readonly SourceRef[]): string[] => refs.map((r) => r.sourceId)

describe('sourceRefKey', () => {
  it('does not collide when an id itself contains the separator characters', () => {
    // Connector ids in the spec look like `slack:C04ABC` / `gmail:caleb@…`, so a ':'
    // join would let ('slack', 'a:b') and ('slack:a', 'b') collapse onto one key —
    // and a collision here means one source's delete silently spares another.
    expect(sourceRefKey(ref('slack', 'a:b'))).not.toBe(sourceRefKey(ref('slack:a', 'b')))
  })

  it('is stable and case-sensitive', () => {
    expect(sourceRefKey(ref('widget', 'w1'))).toBe(sourceRefKey(ref('widget', 'w1')))
    expect(sourceRefKey(ref('widget', 'W1'))).not.toBe(sourceRefKey(ref('widget', 'w1')))
  })
})

describe('planReconcile — the core diff', () => {
  it('removes exactly the indexed sources the scan no longer yields', () => {
    const plan = planReconcile(
      [ref('widget', 'live'), ref('widget', 'trashed'), ref('task', 'gone')],
      [ref('widget', 'live')],
      ALL
    )
    expect(ids(plan.remove)).toEqual(['gone', 'trashed'])
    expect(plan.retainedUncovered).toEqual([])
  })

  it('removes nothing when the scan yields everything indexed', () => {
    const both = [ref('widget', 'a'), ref('task', 'b')]
    expect(planReconcile(both, both, ALL).remove).toEqual([])
  })

  it('ignores sources the scan yields that are not yet indexed (those are WRITES, not deletes)', () => {
    const plan = planReconcile([ref('widget', 'a')], [ref('widget', 'a'), ref('widget', 'new')], ALL)
    expect(plan.remove).toEqual([])
  })

  it('collapses the many chunk rows of one source into a single removal', () => {
    // fb_chunks holds N rows per source; the same identity arrives repeatedly and must
    // produce ONE tombstone, not N.
    const plan = planReconcile(
      [ref('document', 'd1'), ref('document', 'd1'), ref('document', 'd1')],
      [],
      ALL
    )
    expect(plan.remove).toHaveLength(1)
    expect(plan.remove[0]).toEqual(ref('document', 'd1'))
  })

  it('treats identical ids under different source types as different sources', () => {
    const plan = planReconcile(
      [ref('widget', 'shared-id'), ref('task', 'shared-id')],
      [ref('task', 'shared-id')],
      ALL
    )
    expect(plan.remove).toEqual([ref('widget', 'shared-id')])
  })

  it('returns a deterministic order so plans, logs and diffs are stable', () => {
    const a = planReconcile(
      [ref('widget', 'b'), ref('task', 'z'), ref('widget', 'a'), ref('task', 'a')],
      [],
      ALL
    )
    const b = planReconcile(
      [ref('task', 'a'), ref('widget', 'a'), ref('task', 'z'), ref('widget', 'b')],
      [],
      ALL
    )
    expect(a.remove).toEqual(b.remove)
    expect(a.remove).toEqual([ref('task', 'a'), ref('task', 'z'), ref('widget', 'a'), ref('widget', 'b')])
  })
})

describe('planReconcile — tombstone safety (the guards against eating a live corpus)', () => {
  it('ADVERSARIAL: a collector that failed (no coverage declared) prunes NOTHING of its type', () => {
    // The scenario: the widget collector threw, so it yielded zero widgets. A naive diff
    // reads that as "the user deleted every widget" and destroys the corpus. Coverage is
    // what distinguishes "gone" from "we failed to look".
    const indexed = [ref('widget', 'w1'), ref('widget', 'w2'), ref('task', 't1')]
    const plan = planReconcile(indexed, [ref('task', 't1')], new Set(['task']))
    expect(plan.remove).toEqual([])
    expect(ids(plan.retainedUncovered)).toEqual(['w1', 'w2'])
  })

  it('ADVERSARIAL: with NO coverage at all, nothing is ever removed', () => {
    const indexed = [ref('widget', 'w1'), ref('task', 't1'), ref('document', 'd1')]
    const plan = planReconcile(indexed, [], new Set())
    expect(plan.remove).toEqual([])
    expect(plan.retainedUncovered).toHaveLength(3)
  })

  it('a partially-failed scan still prunes the types that DID complete', () => {
    // One collector failing must not freeze the whole delete path — that would make a
    // single flaky source enough to keep every deletion in the workspace retrievable.
    const plan = planReconcile(
      [ref('widget', 'w-dead'), ref('task', 't-dead'), ref('task', 't-live')],
      [ref('task', 't-live')],
      new Set(['task'])
    )
    expect(ids(plan.remove)).toEqual(['t-dead'])
    expect(ids(plan.retainedUncovered)).toEqual(['w-dead'])
  })

  it('a covered collector that legitimately yields ZERO prunes everything of its type', () => {
    // The complement of the guard above, and just as important: if the user really did
    // delete every widget, "yielded nothing" must mean nothing — otherwise a total
    // delete is the one case the delete path silently refuses to honour.
    const plan = planReconcile(
      [ref('widget', 'w1'), ref('widget', 'w2')],
      [],
      new Set(['widget'])
    )
    expect(ids(plan.remove)).toEqual(['w1', 'w2'])
    expect(plan.retainedUncovered).toEqual([])
  })

  it('an empty index is a no-op regardless of coverage', () => {
    const plan = planReconcile([], [ref('widget', 'a')], ALL)
    expect(plan.remove).toEqual([])
    expect(plan.retainedUncovered).toEqual([])
  })

  it('does not mutate its inputs', () => {
    const indexed = [ref('widget', 'b'), ref('widget', 'a')]
    const collected = [ref('widget', 'a')]
    const snapshot = JSON.stringify({ indexed, collected })
    planReconcile(indexed, collected, ALL)
    expect(JSON.stringify({ indexed, collected })).toBe(snapshot)
  })
})
