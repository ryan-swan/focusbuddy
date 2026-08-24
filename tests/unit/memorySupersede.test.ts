import { describe, it, expect } from 'vitest'
import { memorySupersedes } from '../../src/main/ai/memorySupersede'

// A5, #25 (R23): the deterministic supersession rule, locked with the
// canonical defect phrases and the near-misses that must NOT fire.

const pref = (text: string) => ({ kind: 'preference', text, subject: '' })
const fact = (text: string, subject = '') => ({ kind: 'fact', text, subject })

describe('memorySupersedes', () => {
  it('the canonical #25 pair: Tuesday vs Thursday standups', () => {
    expect(memorySupersedes(pref('prefers Thursday standups'), pref('prefers Tuesday standups'))).toBe(true)
  })

  it('a changed deadline on the same commitment', () => {
    expect(
      memorySupersedes(
        { kind: 'commitment', text: 'Michael delivers the branch by Monday', subject: 'Michael' },
        { kind: 'commitment', text: 'Michael delivers the branch by Friday', subject: 'Michael' }
      )
    ).toBe(true)
  })

  it('one shared word is not the same statement', () => {
    expect(memorySupersedes(pref('likes tea'), pref('likes coffee'))).toBe(false)
  })

  it('different facts about the same subject both stand', () => {
    expect(
      memorySupersedes(fact('Caleb runs the PlexiDesk product', 'Caleb'), fact('Caleb works at AAS', 'Caleb'))
    ).toBe(false)
  })

  it('kinds never cross', () => {
    expect(
      memorySupersedes(fact('prefers Thursday standups'), pref('prefers Tuesday standups'))
    ).toBe(false)
  })

  it('subjects must match', () => {
    expect(
      memorySupersedes(
        { kind: 'commitment', text: 'delivers the deck by Monday', subject: 'Ryan' },
        { kind: 'commitment', text: 'delivers the deck by Friday', subject: 'Michael' }
      )
    ).toBe(false)
  })

  it('subject comparison is normalised, not literal', () => {
    expect(
      memorySupersedes(
        { kind: 'commitment', text: 'delivers the deck by Monday', subject: 'ryan' },
        { kind: 'commitment', text: 'delivers the deck by Friday', subject: 'Ryan' }
      )
    ).toBe(true)
  })

  it('identical restatement supersedes (harmless: dedup catches it first in the store)', () => {
    expect(memorySupersedes(pref('prefers Tuesday standups'), pref('prefers Tuesday standups'))).toBe(true)
  })
})
