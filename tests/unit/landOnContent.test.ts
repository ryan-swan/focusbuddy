import { describe, it, expect } from 'vitest'
import { pickMostRecent } from '../../src/renderer/src/hooks/useLandOnContent'

// Landing a module on its most recently touched item (the toll-booth fix) hinges
// on this pick: newest by updatedAt, falling back to createdAt.

describe('pickMostRecent', () => {
  it('returns null for an empty list', () => {
    expect(pickMostRecent([])).toBeNull()
  })
  it('picks the highest updatedAt', () => {
    const items = [
      { id: 'a', updatedAt: 100 },
      { id: 'b', updatedAt: 300 },
      { id: 'c', updatedAt: 200 }
    ]
    expect(pickMostRecent(items)?.id).toBe('b')
  })
  it('falls back to createdAt when updatedAt is absent', () => {
    const items = [
      { id: 'a', createdAt: 50 },
      { id: 'b', createdAt: 90 }
    ]
    expect(pickMostRecent(items)?.id).toBe('b')
  })
  it('does not mutate the input order', () => {
    const items = [{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 9 }]
    pickMostRecent(items)
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
  })
})
