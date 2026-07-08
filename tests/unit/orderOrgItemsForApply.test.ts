// The pure ordering seam of cross-member org sync. A pulled batch is reordered so
// every parent inserts before its children in one FK-checked apply transaction:
// node before widget, table before row, and Rooms/Desks in ancestry order. Tested
// without a DB — the IO half (applyRemoteOrg) is exercised by the e2e HTTP flow.

import { describe, it, expect } from 'vitest'
import { orderOrgItemsForApply, type RemoteItem } from '../../src/main/db/workspaceSync'

function item(over: Partial<RemoteItem> & Pick<RemoteItem, 'id' | 'itemType'>): RemoteItem {
  return { body: {}, rev: 1, deleted: false, ...over }
}

function node(id: string, parentId: string | null): RemoteItem {
  return item({ id, itemType: 'node', body: { id, parent_id: parentId } })
}

describe('orderOrgItemsForApply', () => {
  it('ranks node before widget before row (cross-type FK order)', () => {
    const out = orderOrgItemsForApply([
      item({ id: 'r1', itemType: 'row' }),
      item({ id: 'w1', itemType: 'widget' }),
      item({ id: 'n1', itemType: 'node' })
    ])
    expect(out.map((i) => i.id)).toEqual(['n1', 'w1', 'r1'])
  })

  it('ranks table before row', () => {
    const out = orderOrgItemsForApply([
      item({ id: 'row1', itemType: 'row' }),
      item({ id: 'tbl1', itemType: 'table' })
    ])
    expect(out.map((i) => i.id)).toEqual(['tbl1', 'row1'])
  })

  it('emits a parent node before its child even when the child arrives first', () => {
    const out = orderOrgItemsForApply([node('desk', 'room'), node('room', null)])
    const pos = (id: string): number => out.findIndex((i) => i.id === id)
    expect(pos('room')).toBeLessThan(pos('desk'))
  })

  it('orders a deep chain grandparent -> parent -> child regardless of input order', () => {
    const out = orderOrgItemsForApply([node('c', 'b'), node('a', null), node('b', 'a')])
    const pos = (id: string): number => out.findIndex((i) => i.id === id)
    expect(pos('a')).toBeLessThan(pos('b'))
    expect(pos('b')).toBeLessThan(pos('c'))
  })

  it('keeps the widget after the desk it sits on (node topo must not disturb rank)', () => {
    const out = orderOrgItemsForApply([
      item({ id: 'w', itemType: 'widget', body: { id: 'w', task_id: 'desk' } }),
      node('desk', 'room'),
      node('room', null)
    ])
    const pos = (id: string): number => out.findIndex((i) => i.id === id)
    expect(pos('room')).toBeLessThan(pos('desk'))
    expect(pos('desk')).toBeLessThan(pos('w'))
  })

  it('leaves a node whose parent is not in the batch in place (parent already in DB)', () => {
    // Only the child is present; its parent lives in the DB already. It must still
    // be emitted (not dropped) and no crash from the missing parent.
    const out = orderOrgItemsForApply([node('desk', 'room-in-db')])
    expect(out.map((i) => i.id)).toEqual(['desk'])
  })

  it('does not loop forever on a parent cycle (a -> b -> a)', () => {
    const out = orderOrgItemsForApply([node('a', 'b'), node('b', 'a')])
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b'])
  })

  it('preserves the input array (returns a new array, no mutation)', () => {
    const input = [node('desk', 'room'), node('room', null)]
    const snapshot = input.map((i) => i.id)
    orderOrgItemsForApply(input)
    expect(input.map((i) => i.id)).toEqual(snapshot)
  })
})
