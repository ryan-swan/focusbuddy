import { describe, it, expect } from 'vitest'
import { presenceColor, initialsFor, collaborators } from '@renderer/lib/presence'

describe('presence', () => {
  it('presenceColor is deterministic and legible', () => {
    expect(presenceColor('acc-1')).toBe(presenceColor('acc-1'))
    expect(presenceColor('acc-1')).not.toBe(presenceColor('acc-2'))
    expect(presenceColor('acc-1')).toMatch(/^hsl\(\d+ 62% 48%\)$/)
  })

  it('initialsFor derives up to two initials', () => {
    expect(initialsFor('@alex.kim')).toBe('AK')
    expect(initialsFor('alex')).toBe('AL')
    expect(initialsFor('@bob_jones')).toBe('BJ')
    expect(initialsFor('')).toBe('?')
  })

  it('collaborators flags the editor, marks you, and orders the editor first', () => {
    const members = [
      { accountId: 'a', handle: 'alice' },
      { accountId: 'b', handle: 'bob' },
      { accountId: 'a', handle: 'alice' } // duplicate ignored
    ]
    const people = collaborators(members, { holder: { accountId: 'b' } }, 'a')
    expect(people.map((p) => p.accountId)).toEqual(['b', 'a']) // editor first
    expect(people.find((p) => p.accountId === 'b')!.editing).toBe(true)
    expect(people.find((p) => p.accountId === 'a')!.editing).toBe(false)
    expect(people.find((p) => p.accountId === 'a')!.you).toBe(true)
  })

  it('handles no lock and empty members', () => {
    expect(collaborators([], null, null)).toEqual([])
    const p = collaborators([{ accountId: 'a', handle: 'al' }], null, null)
    expect(p[0].editing).toBe(false)
    expect(p[0].you).toBe(false)
  })
})
