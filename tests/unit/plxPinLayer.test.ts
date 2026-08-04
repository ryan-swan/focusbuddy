import { describe, it, expect, beforeEach } from 'vitest'
import { usePinLayer } from '../../src/renderer/src/stores/pinLayer'
import { canPlaceKind, pinDropMarkdown, type PinnedItem } from '../../src/renderer/src/lib/pinnable'

// The universal pin layer: dedupe by (kind, refId), track where a pin has been
// placed, and materialise text/link pins honestly. Guards the §7 core.

describe('canPlaceKind', () => {
  it('allows desk + captured content, not open-only kinds', () => {
    expect(canPlaceKind('desk')).toBe(true)
    expect(canPlaceKind('activity')).toBe(true)
    expect(canPlaceKind('link')).toBe(true)
    expect(canPlaceKind('text')).toBe(true)
    expect(canPlaceKind('document')).toBe(false)
    expect(canPlaceKind('widget')).toBe(false)
    expect(canPlaceKind('room')).toBe(false)
  })
})

describe('pinDropMarkdown', () => {
  it('carries title, content, url and source without inventing anything', () => {
    const item = {
      id: 'p1', kind: 'link', refId: 'https://x.test', title: 'A quote',
      content: 'Body text', url: 'https://x.test', source: 'Home activity', placedOn: [], createdAt: 1
    } as PinnedItem
    const md = pinDropMarkdown(item)
    expect(md).toContain('# A quote')
    expect(md).toContain('Body text')
    expect(md).toContain('https://x.test')
    expect(md).toContain('_Home activity_')
  })
  it('omits sections it has no data for', () => {
    const md = pinDropMarkdown({ id: 'p', kind: 'text', refId: 'r', title: 'Just a title', placedOn: [], createdAt: 1 } as PinnedItem)
    expect(md).toBe('# Just a title')
  })
})

describe('pinLayer store', () => {
  beforeEach(() => usePinLayer.getState().clear())

  it('pins, dedupes by (kind, refId), and unpins', () => {
    const s = usePinLayer.getState()
    const a = s.pin({ kind: 'desk', refId: 'd1', title: 'Desk 1' })
    const again = s.pin({ kind: 'desk', refId: 'd1', title: 'Desk 1 (dup)' })
    expect(again.id).toBe(a.id) // dedupe returns the existing pin
    expect(usePinLayer.getState().items).toHaveLength(1)
    expect(usePinLayer.getState().isPinned('desk', 'd1')).toBe(true)
    usePinLayer.getState().unpin(a.id)
    expect(usePinLayer.getState().items).toHaveLength(0)
    expect(usePinLayer.getState().isPinned('desk', 'd1')).toBe(false)
  })

  it('records where a pin has been placed, without duplicates', () => {
    const s = usePinLayer.getState()
    const p = s.pin({ kind: 'text', refId: 't1', title: 'Note', content: 'hi' })
    usePinLayer.getState().markPlaced(p.id, 'deskA')
    usePinLayer.getState().markPlaced(p.id, 'deskA')
    usePinLayer.getState().markPlaced(p.id, 'deskB')
    const after = usePinLayer.getState().items.find((i) => i.id === p.id)!
    expect(after.placedOn).toEqual(['deskA', 'deskB'])
  })
})
