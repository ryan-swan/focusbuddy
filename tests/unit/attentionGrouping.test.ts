import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import {
  orderWithGroups,
  planDrop,
  planUngroup
} from '../../src/renderer/src/lib/attentionGrouping'

// DEC-035 — grouping + manual order. A sibling reference (groupId), exactly
// one level deep, so the queue can never become an unbounded outline.

const wi = (over: Partial<FbNode> & { id: string }): FbNode =>
  ({
    parentId: null,
    kind: 'work_item',
    title: over.id,
    description: '',
    status: 'open',
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    workItemState: 'open',
    intentClass: 'to_do',
    groupId: null,
    ...over
  }) as FbNode

// Rank stands in for the real ranker: higher id-number ranks higher.
const rank = (i: FbNode): number => Number(i.id.replace(/\D/g, '')) || 0

const ids = (rows: ReturnType<typeof orderWithGroups>): string[] => rows.map((r) => r.item.id)

describe('orderWithGroups', () => {
  it('ranks ungrouped items when nothing has been placed by hand', () => {
    const rows = orderWithGroups([wi({ id: 'a1' }), wi({ id: 'a3' }), wi({ id: 'a2' })], rank)
    expect(ids(rows)).toEqual(['a3', 'a2', 'a1'])
    expect(rows.every((r) => !r.isChild && r.childCount === 0)).toBe(true)
  })

  it('keeps a group together, children directly under their leader', () => {
    const rows = orderWithGroups(
      [wi({ id: 'a1' }), wi({ id: 'a9' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3', groupId: 'a1' })],
      rank
    )
    // a9 outranks a1, but a1's children still travel with a1.
    expect(ids(rows)).toEqual(['a9', 'a1', 'a3', 'a2'])
    expect(rows.find((r) => r.item.id === 'a1')!.childCount).toBe(2)
    expect(rows.filter((r) => r.isChild).map((r) => r.item.id).sort()).toEqual(['a2', 'a3'])
  })

  it('hand-placed items sort before merely-ranked ones, by their number', () => {
    const rows = orderWithGroups(
      [wi({ id: 'a1', sortOrder: 2 }), wi({ id: 'a9' }), wi({ id: 'a5', sortOrder: 1 })],
      rank
    )
    expect(ids(rows)).toEqual(['a5', 'a1', 'a9'])
  })

  it('NEVER hides a child whose leader left the queue', () => {
    // The leader was completed / reclassified / snoozed away. The orphan is
    // promoted, not vanished — an item disappearing because of something that
    // happened to a DIFFERENT item is the one unacceptable failure here.
    const rows = orderWithGroups([wi({ id: 'a2', groupId: 'gone' })], rank)
    expect(ids(rows)).toEqual(['a2'])
    expect(rows[0].isChild).toBe(false)
  })

  it('treats a self-reference as standing alone', () => {
    const rows = orderWithGroups([wi({ id: 'a1', groupId: 'a1' })], rank)
    expect(rows[0].isChild).toBe(false)
  })
})

describe('planDrop', () => {
  const base = [wi({ id: 'a1' }), wi({ id: 'a2' }), wi({ id: 'a3' })]
  const ordered = (items: FbNode[]) => orderWithGroups(items, rank)

  it('dropping INTO a row groups the dragged item under it', () => {
    const writes = planDrop('a1', 'a3', 'into', ordered(base))
    const dragged = writes.find((w) => w.id === 'a1')!
    expect(dragged.groupId).toBe('a3')
  })

  it('dropping INTO a CHILD joins that child’s group, never nests deeper', () => {
    const items = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3' })]
    const writes = planDrop('a3', 'a2', 'into', ordered(items))
    expect(writes.find((w) => w.id === 'a3')!.groupId).toBe('a1')
  })

  it('refuses to group a LEADER under anything (one level, always)', () => {
    const items = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3' })]
    expect(planDrop('a1', 'a3', 'into', ordered(items))).toEqual([])
  })

  it('never groups an item under itself', () => {
    expect(planDrop('a1', 'a1', 'into', ordered(base))).toEqual([])
  })

  it('before/after reorders and renumbers every row from 1', () => {
    const writes = planDrop('a1', 'a3', 'before', ordered(base))
    // Ranked order is a3,a2,a1; moving a1 before a3 gives a1,a3,a2.
    const order = writes.sort((x, y) => x.sortOrder! - y.sortOrder!).map((w) => w.id)
    expect(order).toEqual(['a1', 'a3', 'a2'])
    expect(writes.map((w) => w.sortOrder)).toEqual([1, 2, 3])
  })

  it('a row dropped between two children JOINS their group', () => {
    // Otherwise it would sit visually inside a group while not belonging to
    // it — the order would lie about the relationship.
    const items = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3' })]
    const writes = planDrop('a3', 'a2', 'after', ordered(items))
    expect(writes.find((w) => w.id === 'a3')!.groupId).toBe('a1')
  })

  it('a no-op drag produces no writes', () => {
    expect(planDrop('a1', 'missing', 'into', ordered(base))).toEqual([])
  })
})

describe('planUngroup', () => {
  it('detaches exactly one item and touches nothing else', () => {
    expect(planUngroup('a2')).toEqual([{ id: 'a2', groupId: null }])
  })
})
