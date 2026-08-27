import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import {
  normalizeTag,
  parseTags,
  serializeTags,
  tagVocabulary,
  hasTag,
  urgencyOf,
  itemContext,
  URGENCY_LEVELS
} from '../../src/renderer/src/lib/itemTags'

// DEC-037 — chips at a glance. DERIVED context (desk, plan, source) is a fact
// about the item; CHOSEN context (urgency, tags) is never mandatory.

const node = (over: Partial<FbNode> & { id: string }): FbNode =>
  ({ kind: 'task', title: over.id, parentId: null, archived: false, isPlan: false, ...over }) as FbNode

describe('tags — normalize / parse / serialize', () => {
  it('lowercases, trims, strips a leading # and collapses whitespace', () => {
    expect(normalizeTag('  #Client   Work ')).toBe('client work')
    expect(normalizeTag('URGENT')).toBe('urgent')
  })

  it('never lets a comma into a tag — it is the delimiter', () => {
    expect(normalizeTag('a,b')).toBe('a b')
    expect(parseTags('one,two')).toEqual(['one', 'two'])
  })

  it('round-trips, de-duplicates and drops empties', () => {
    expect(serializeTags(['Client', 'client', '  ', 'Rush'])).toBe('client,rush')
    expect(parseTags('client,,rush,client')).toEqual(['client', 'rush'])
  })

  it('empty means NULL, not an empty string pretending to be a value', () => {
    expect(serializeTags([])).toBeNull()
    expect(serializeTags(['  '])).toBeNull()
    expect(parseTags(null)).toEqual([])
  })

  it('caps tag length and count so a row can always render', () => {
    expect(normalizeTag('x'.repeat(100)).length).toBeLessThanOrEqual(24)
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`)
    expect(parseTags(serializeTags(many)!).length).toBeLessThanOrEqual(12)
  })

  it('builds a vocabulary ordered by use', () => {
    const items = [
      node({ id: 'a', tags: 'client,rush' }),
      node({ id: 'b', tags: 'client' }),
      node({ id: 'c', tags: null })
    ]
    expect(tagVocabulary(items)).toEqual([
      { tag: 'client', count: 2 },
      { tag: 'rush', count: 1 }
    ])
    expect(hasTag(items[0], 'RUSH')).toBe(true)
    expect(hasTag(items[2], 'rush')).toBe(false)
  })
})

describe('urgency', () => {
  it('shows a chip only when it says something — normal and unset do not', () => {
    expect(urgencyOf({ wiUrgency: 'high' })).toBe('high')
    expect(urgencyOf({ wiUrgency: 'normal' })).toBeNull()
    expect(urgencyOf({ wiUrgency: null })).toBeNull()
    expect(urgencyOf({ wiUrgency: 'nonsense' })).toBeNull()
  })

  it('every level is a real value', () => {
    for (const u of URGENCY_LEVELS) expect(urgencyOf({ wiUrgency: u }) ?? 'normal').toBe(u)
  })
})

describe('itemContext — derived, so it can never be stale', () => {
  const plan = node({ id: 'plan', kind: 'folder', isPlan: true, title: 'Q3 Launch' })
  const room = node({ id: 'room', kind: 'folder', isPlan: false, title: 'Client Work', parentId: 'plan' })
  const desk = node({ id: 'desk', kind: 'task', title: 'Cetra Review', parentId: 'room' })
  const byId = new Map([plan, room, desk].map((n) => [n.id, n]))

  it('names the desk and the plan enclosing it, through intermediate folders', () => {
    const ctx = itemContext(node({ id: 'i', kind: 'work_item', parentId: 'desk' }), byId)
    expect(ctx.desk).toEqual({ id: 'desk', title: 'Cetra Review' })
    expect(ctx.plan).toEqual({ id: 'plan', title: 'Q3 Launch' })
  })

  it('a standalone item has neither', () => {
    const ctx = itemContext(node({ id: 'i', kind: 'work_item', parentId: null }), byId)
    expect(ctx.desk).toBeNull()
    expect(ctx.plan).toBeNull()
  })

  it('a desk outside any plan reports no plan', () => {
    const loose = node({ id: 'loose', kind: 'task', title: 'Loose', parentId: null })
    const m = new Map([[loose.id, loose]])
    expect(itemContext(node({ id: 'i', kind: 'work_item', parentId: 'loose' }), m).plan).toBeNull()
  })

  it('reports a MARKED source, but not an ordinary typed capture', () => {
    const marked = node({ id: 'i', kind: 'work_item', sourceType: 'widget', sourceRef: 'w1' })
    expect(itemContext(marked, byId).source).toEqual({ type: 'widget', ref: 'w1' })
    const typed = node({ id: 'j', kind: 'work_item', sourceType: 'note', sourceRef: null })
    expect(itemContext(typed, byId).source).toBeNull()
  })
})
