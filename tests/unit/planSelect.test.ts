import { describe, it, expect } from 'vitest'
import { selectByKeywords } from '../../src/main/ai/planSelect'

// DEC-052 B3 — the intent mode's deterministic floor: with no model (no key,
// timeout, garbage output) the Plan button still selects by keywords, so it
// never dies with the model. Matching covers title AND context (tags,
// mentions, desk title) — "CETRA" finds items on the CETRA desk even when no
// title says so.

const C = [
  { id: 'a', title: 'Draft lease abstract', context: 'CETRA, client' },
  { id: 'b', title: 'Fix the CETRA importer', context: '' },
  { id: 'c', title: 'Plexi seasonal marketing ideas', context: 'marketing' },
  { id: 'd', title: 'Call Bob', context: '' }
]

describe('selectByKeywords', () => {
  it('matches title OR context, ranked by hit count', () => {
    expect(selectByKeywords('take on the CETRA project', C)).toEqual(['a', 'b'])
  })

  it('multi-token intents rank the richer match first', () => {
    expect(selectByKeywords('cetra client work', C)[0]).toBe('a') // 2 hits beats 1
  })

  it('no hits = empty selection (an honest nothing, never everything)', () => {
    expect(selectByKeywords('quarterly taxes', C)).toEqual([])
  })

  it('short noise tokens are ignored', () => {
    expect(selectByKeywords('do it on my og to', C)).toEqual([])
  })
})
