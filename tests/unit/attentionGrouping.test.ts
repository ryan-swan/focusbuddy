import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import {
  MAX_GROUP_DEPTH,
  orderWithGroups,
  planDrop,
  planDropMulti,
  planMoveToQueue,
  planMoveToQueueMulti,
  planUngroup,
  visibleRows,
  subtreeHeight,
  subtreeIds
} from '../../src/renderer/src/lib/attentionGrouping'

// DEC-035 → DEC-048 — grouping + manual order. A sibling reference (groupId)
// that may now NEST, capped at MAX_GROUP_DEPTH levels, so a queue renders a
// bounded outline and a drop that would exceed the cap is refused up front.

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
const ordered = (items: FbNode[]) => orderWithGroups(items, rank)
const node = (rows: FbNode[], id: string): FbNode => rows.find((r) => r.id === id)!

describe('orderWithGroups', () => {
  it('ranks ungrouped items when nothing has been placed by hand', () => {
    const rows = orderWithGroups([wi({ id: 'a1' }), wi({ id: 'a3' }), wi({ id: 'a2' })], rank)
    expect(ids(rows)).toEqual(['a3', 'a2', 'a1'])
    expect(rows.every((r) => !r.isChild && r.childCount === 0 && r.depth === 0)).toBe(true)
  })

  it('keeps a group together, children directly under their parent', () => {
    const rows = orderWithGroups(
      [wi({ id: 'a1' }), wi({ id: 'a9' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3', groupId: 'a1' })],
      rank
    )
    // a9 outranks a1, but a1's children still travel with a1.
    expect(ids(rows)).toEqual(['a9', 'a1', 'a3', 'a2'])
    expect(rows.find((r) => r.item.id === 'a1')!.childCount).toBe(2)
    expect(rows.filter((r) => r.isChild).map((r) => r.item.id).sort()).toEqual(['a2', 'a3'])
  })

  it('renders a 3-level chain with depths 0/1/2 and counts descendants', () => {
    const rows = orderWithGroups(
      [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3', groupId: 'a2' })],
      rank
    )
    expect(ids(rows)).toEqual(['a1', 'a2', 'a3'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2])
    const root = rows[0]
    expect(root.childCount).toBe(1) // direct
    expect(root.descendants).toBe(2) // whole subtree
    expect(rows[1].descendants).toBe(1)
  })

  it('hand-placed items sort before merely-ranked ones, by their number', () => {
    const rows = orderWithGroups(
      [wi({ id: 'a1', sortOrder: 2 }), wi({ id: 'a9' }), wi({ id: 'a5', sortOrder: 1 })],
      rank
    )
    expect(ids(rows)).toEqual(['a5', 'a1', 'a9'])
  })

  it('NEVER hides a child whose parent left the queue — the subtree promotes', () => {
    // The parent was completed / reclassified / snoozed away. The orphan is
    // promoted WITH its own children, not vanished — an item disappearing
    // because of something that happened to a DIFFERENT item is the one
    // unacceptable failure here.
    const rows = orderWithGroups(
      [wi({ id: 'a2', groupId: 'gone' }), wi({ id: 'a1', groupId: 'a2' })],
      rank
    )
    expect(ids(rows)).toEqual(['a2', 'a1'])
    expect(rows[0].depth).toBe(0)
    expect(rows[1].depth).toBe(1) // still nested under its promoted parent
  })

  it('treats a self-reference as standing alone', () => {
    const rows = orderWithGroups([wi({ id: 'a1', groupId: 'a1' })], rank)
    expect(rows[0].isChild).toBe(false)
  })

  it('a corrupted CYCLE renders flat instead of vanishing', () => {
    const rows = orderWithGroups(
      [wi({ id: 'a1', groupId: 'a2' }), wi({ id: 'a2', groupId: 'a1' })],
      rank
    )
    expect(ids(rows).sort()).toEqual(['a1', 'a2'])
  })
})

describe('subtree helpers', () => {
  const chain = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3', groupId: 'a2' }), wi({ id: 'b1' })]

  it('subtreeIds walks the whole chain; subtreeHeight measures it', () => {
    expect([...subtreeIds('a1', chain)].sort()).toEqual(['a1', 'a2', 'a3'])
    expect(subtreeHeight('a1', chain)).toBe(3)
    expect(subtreeHeight('a2', chain)).toBe(2)
    expect(subtreeHeight('b1', chain)).toBe(1)
  })
})

describe('planDrop — nesting to the cap', () => {
  const base = [wi({ id: 'a1' }), wi({ id: 'a2' }), wi({ id: 'a3' })]

  it('dropping INTO a row nests the dragged item under it', () => {
    const writes = planDrop(node(base, 'a1'), 'a3', 'into', ordered(base))
    expect(writes.find((w) => w.id === 'a1')!.groupId).toBe('a3')
  })

  it('dropping INTO a child makes a sub-subtask (level 3) — DEC-048', () => {
    const items = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3' })]
    const writes = planDrop(node(items, 'a3'), 'a2', 'into', ordered(items))
    expect(writes.find((w) => w.id === 'a3')!.groupId).toBe('a2')
  })

  it('REFUSES a drop that would exceed MAX_GROUP_DEPTH', () => {
    // a3 sits at level 3 — nothing can nest under it.
    const items = [
      wi({ id: 'a1' }),
      wi({ id: 'a2', groupId: 'a1' }),
      wi({ id: 'a3', groupId: 'a2' }),
      wi({ id: 'a4' })
    ]
    expect(planDrop(node(items, 'a4'), 'a3', 'into', ordered(items))).toEqual([])
    // A 2-tall subtree cannot nest under a level-2 item either (2+2 > 3)…
    const twoTall = [
      wi({ id: 'b1' }),
      wi({ id: 'b2', groupId: 'b1' }),
      wi({ id: 'c1' }),
      wi({ id: 'c2', groupId: 'c1' })
    ]
    expect(planDrop(node(twoTall, 'c1'), 'b2', 'into', ordered(twoTall))).toEqual([])
    // …but fits under a ROOT (1+2 = 3).
    const okay = planDrop(node(twoTall, 'c1'), 'b1', 'into', ordered(twoTall))
    expect(okay.find((w) => w.id === 'c1')!.groupId).toBe('b1')
  })

  it('a parent WITH children can now be nested when the chain fits', () => {
    const items = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3' })]
    const writes = planDrop(node(items, 'a1'), 'a3', 'into', ordered(items))
    expect(writes.find((w) => w.id === 'a1')!.groupId).toBe('a3')
  })

  it('never drops into its own descendant (cycle refusal)', () => {
    const items = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' })]
    expect(planDrop(node(items, 'a1'), 'a2', 'into', ordered(items))).toEqual([])
    expect(planDrop(node(items, 'a1'), 'a2', 'after', ordered(items))).toEqual([])
  })

  it('never groups an item under itself', () => {
    expect(planDrop(node(base, 'a1'), 'a1', 'into', ordered(base))).toEqual([])
  })

  it('before/after reorders and renumbers every row from 1', () => {
    const writes = planDrop(node(base, 'a1'), 'a3', 'before', ordered(base))
    // Ranked order is a3,a2,a1; moving a1 before a3 gives a1,a3,a2.
    const order = writes.sort((x, y) => x.sortOrder! - y.sortOrder!).map((w) => w.id)
    expect(order).toEqual(['a1', 'a3', 'a2'])
    expect(writes.map((w) => w.sortOrder)).toEqual([1, 2, 3])
  })

  it('a row dropped between two children JOINS their level as a sibling', () => {
    // Otherwise it would sit visually inside a group while not belonging to
    // it — the order would lie about the relationship.
    const items = [wi({ id: 'a1' }), wi({ id: 'a2', groupId: 'a1' }), wi({ id: 'a3' })]
    const writes = planDrop(node(items, 'a3'), 'a2', 'after', ordered(items))
    expect(writes.find((w) => w.id === 'a3')!.groupId).toBe('a1')
  })

  it('a sibling drop beside a DEEP row still honors the cap for tall subtrees', () => {
    // c1+c2 (height 2) beside a level-2 row → parent level 1 + 2 = 3: fits.
    const items = [
      wi({ id: 'a1' }),
      wi({ id: 'a2', groupId: 'a1' }),
      wi({ id: 'c1' }),
      wi({ id: 'c2', groupId: 'c1' })
    ]
    const okay = planDrop(node(items, 'c1'), 'a2', 'after', ordered(items))
    expect(okay.find((w) => w.id === 'c1')!.groupId).toBe('a1')
    // Beside a level-3 row → parent level 2 + 2 = 4: refused.
    const deep = [
      wi({ id: 'a1' }),
      wi({ id: 'a2', groupId: 'a1' }),
      wi({ id: 'a3', groupId: 'a2' }),
      wi({ id: 'c1' }),
      wi({ id: 'c2', groupId: 'c1' })
    ]
    expect(planDrop(node(deep, 'c1'), 'a3', 'after', ordered(deep))).toEqual([])
  })

  it('a no-op drag produces no writes', () => {
    expect(planDrop(node(base, 'a1'), 'missing', 'into', ordered(base))).toEqual([])
  })
})

describe('planDropMulti — one drop for a whole selection (DEC-048)', () => {
  it('nests every selected top under the target, subtree structure intact', () => {
    const items = [
      wi({ id: 'a1' }),
      wi({ id: 'b1' }),
      wi({ id: 'b2', groupId: 'b1' }),
      wi({ id: 'c1' })
    ]
    // Selecting a parent AND its child re-parents only the parent.
    const writes = planDropMulti(['b1', 'b2', 'c1'], 'a1', 'into', ordered(items))
    expect(writes.find((w) => w.id === 'b1')!.groupId).toBe('a1')
    expect(writes.find((w) => w.id === 'c1')!.groupId).toBe('a1')
    expect(writes.find((w) => w.id === 'b2')?.groupId).toBeUndefined() // untouched
  })

  it('refuses when ANY selected subtree would blow the cap, or contains the target', () => {
    const items = [
      wi({ id: 'a1' }),
      wi({ id: 'a2', groupId: 'a1' }),
      wi({ id: 'b1' }),
      wi({ id: 'b2', groupId: 'b1' }),
      wi({ id: 'c1' })
    ]
    // b1's subtree is 2 tall; under a2 (level 2) it would reach level 4.
    expect(planDropMulti(['b1', 'c1'], 'a2', 'into', ordered(items))).toEqual([])
    // Target inside a selected subtree.
    expect(planDropMulti(['b1'], 'b2', 'into', ordered(items))).toEqual([])
    // Target itself selected → dropped from the set; alone that's a no-op.
    expect(planDropMulti(['a1'], 'a1', 'into', ordered(items))).toEqual([])
  })

  it('before/after moves the block as a unit and renumbers', () => {
    const items = [wi({ id: 'a1' }), wi({ id: 'a2' }), wi({ id: 'a3' }), wi({ id: 'a4' })]
    // Ranked: a4,a3,a2,a1. Move {a1,a2} before a4 → a2,a1,a4,a3 (block keeps
    // its own visual order: a2 ranks above a1).
    const writes = planDropMulti(['a1', 'a2'], 'a4', 'before', ordered(items))
    const order = [...writes].sort((x, y) => x.sortOrder! - y.sortOrder!).map((w) => w.id)
    expect(order).toEqual(['a2', 'a1', 'a4', 'a3'])
  })

  it('a cross-queue multi-drop reclassifies every subtree member', () => {
    const items = [wi({ id: 'a1' }), wi({ id: 'b1' }), wi({ id: 'b2', groupId: 'b1' })]
    const writes = planDropMulti(['b1'], 'a1', 'into', ordered(items), 'to_review')
    expect(writes.find((w) => w.id === 'b1')!.intentClass).toBe('to_review')
    expect(writes.find((w) => w.id === 'b2')!.intentClass).toBe('to_review')
  })
})

describe('cross-queue drops (the gesture that silently did nothing)', () => {
  it('an item from ANOTHER queue is inserted AND reclassified', () => {
    const target = [wi({ id: 'b1' }), wi({ id: 'b2' })]
    const incoming = wi({ id: 'a9', intentClass: 'to_do' })
    const writes = planDrop(incoming, 'b1', 'before', orderWithGroups(target, rank), 'to_review')
    const moved = writes.find((w) => w.id === 'a9')!
    // The reclassify rides the SAME gesture — that is the whole point.
    expect(moved.intentClass).toBe('to_review')
    expect(moved.groupId).toBeNull() // it left its old queue's group behind
    // It lands immediately before b1, and the destination is renumbered around
    // it. (Ranked order here is b2 then b1, so "before b1" is position 2.)
    const order = [...writes].sort((x, y) => x.sortOrder! - y.sortOrder!).map((w) => w.id)
    expect(order).toEqual(['b2', 'a9', 'b1'])
  })

  it('planMoveToQueue drops it at the end — and its subtree crosses WITH it', () => {
    const target = [wi({ id: 'b1' }), wi({ id: 'b2' })]
    const source = [wi({ id: 'a9' }), wi({ id: 'a8', groupId: 'a9' })]
    const writes = planMoveToQueue('a9', 'to_meet', orderWithGroups(target, rank), source)
    expect(writes).toEqual([
      { id: 'a9', groupId: null, sortOrder: 3, intentClass: 'to_meet' },
      { id: 'a8', intentClass: 'to_meet' } // still nested, now in the new queue
    ])
  })
})

describe('visibleRows — the collapse filter', () => {
  const items = [
    wi({ id: 'a1' }),
    wi({ id: 'a2', groupId: 'a1' }),
    wi({ id: 'a3', groupId: 'a2' }),
    wi({ id: 'b1' })
  ]

  it('hides the whole subtree under a collapsed row, keeping the row itself', () => {
    const rows = ordered(items)
    const shown = visibleRows(rows, new Set(['a1']))
    expect(shown.map((r) => r.item.id)).toEqual(['a1', 'b1'])
    // Collapsing a MID-level row hides only what sits beneath it.
    const mid = visibleRows(rows, new Set(['a2']))
    expect(mid.map((r) => r.item.id)).toEqual(['a1', 'a2', 'b1'])
  })

  it('no collapsed rows → identity', () => {
    const rows = ordered(items)
    expect(visibleRows(rows, new Set())).toBe(rows)
  })
})

describe('planDropMulti with a cross-queue selection pool', () => {
  it('a selected item from ANOTHER queue joins the drop via sourceItems', () => {
    const here = [wi({ id: 'a1' }), wi({ id: 'a2' })]
    const elsewhere = wi({ id: 'z1', intentClass: 'to_review' })
    const all = [...here, elsewhere]
    const writes = planDropMulti(['a2', 'z1'], 'a1', 'into', ordered(here), 'to_do', all)
    expect(writes.find((w) => w.id === 'z1')!.groupId).toBe('a1')
    expect(writes.find((w) => w.id === 'z1')!.intentClass).toBe('to_do')
  })
})

describe('planMoveToQueueMulti', () => {
  it('tops land at the end in order; subtrees ride; nested-selected stay put', () => {
    const target = [wi({ id: 'b1' })]
    const source = [
      wi({ id: 'p1' }),
      wi({ id: 'p2', groupId: 'p1' }),
      wi({ id: 'q1' })
    ]
    // p2 is selected along with its parent — it moves INSIDE p1, not alone.
    const writes = planMoveToQueueMulti(['p1', 'p2', 'q1'], 'to_meet', orderWithGroups(target, rank), source)
    const p1 = writes.find((w) => w.id === 'p1')!
    const q1 = writes.find((w) => w.id === 'q1')!
    expect(p1.groupId).toBeNull()
    expect([p1.sortOrder, q1.sortOrder].sort()).toEqual([2, 3])
    expect(writes.find((w) => w.id === 'p2')).toEqual({ id: 'p2', intentClass: 'to_meet' })
  })
})

describe('planUngroup', () => {
  it('detaches exactly one item and touches nothing else', () => {
    expect(planUngroup('a2')).toEqual([{ id: 'a2', groupId: null }])
  })
})

describe('the cap constant', () => {
  it('is three levels, per the operator ruling', () => {
    expect(MAX_GROUP_DEPTH).toBe(3)
  })
})
