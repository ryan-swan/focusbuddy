import { describe, it, expect } from 'vitest'
import {
  parseSelectionList,
  normalizeSelectionText,
  MAX_LIST_ITEMS
} from '../../src/renderer/src/lib/selectionList'

// DEC-046 — deterministic list-splitting, shaped by the pressure test:
// structure only when the text PROVES it; siblings when flattened; prose never.

describe('normalizeSelectionText', () => {
  it('collapses the sloppy spacing a rendered copy carries', () => {
    expect(normalizeSelectionText('a   \n\n\n\nb\r\nc  ')).toBe('a\n\nb\nc')
  })
})

describe('marker mode — structure the text proves', () => {
  it('five primary bullets → five sibling items', () => {
    const r = parseSelectionList('- call bob\n- send invoice\n- book venue\n- draft deck\n- ping legal')
    expect(r?.kind).toBe('flat')
    expect(r?.lines.map((l) => l.text)).toEqual([
      'call bob', 'send invoice', 'book venue', 'draft deck', 'ping legal'
    ])
  })

  it('headers + indented sub-bullets → primaries with CHILDREN (the grouping shape)', () => {
    const r = parseSelectionList(
      '- Cetra follow-ups\n  - send revised pricing\n  - book the walkthrough\n- Prospect B\n  - intro email'
    )
    expect(r?.kind).toBe('nested')
    expect(r?.lines).toEqual([
      { text: 'Cetra follow-ups', depth: 0 },
      { text: 'send revised pricing', depth: 1 },
      { text: 'book the walkthrough', depth: 1 },
      { text: 'Prospect B', depth: 0 },
      { text: 'intro email', depth: 1 }
    ])
  })

  it('numbered and checkbox lists count as markers too', () => {
    expect(parseSelectionList('1. first thing\n2. second thing')?.lines).toHaveLength(2)
    expect(parseSelectionList('[ ] buy domain\n[x] wire dns')?.lines).toHaveLength(2)
  })

  it('a continuation line joins its entry rather than becoming an item', () => {
    const r = parseSelectionList('- send the invoice\n  with the updated rates\n- call bob')
    expect(r?.lines.map((l) => l.text)).toEqual(['send the invoice with the updated rates', 'call bob'])
  })

  it('a selection starting mid-list promotes the orphan child — never drops it', () => {
    const r = parseSelectionList('  - orphan sub-item\n- Real header\n  - its child')
    expect(r?.lines[0]).toEqual({ text: 'orphan sub-item', depth: 0 })
  })
})

describe('flattened mode — rendered lists lose their markers', () => {
  it('3+ short unpunctuated lines become SIBLINGS (nesting is not guessed)', () => {
    const r = parseSelectionList('send revised pricing\nbook the walkthrough\nintro email for B')
    expect(r?.kind).toBe('flat')
    expect(r?.lines.every((l) => l.depth === 0)).toBe(true)
  })

  it('PROSE is never shredded into fake items', () => {
    expect(
      parseSelectionList(
        'The vendor conversation went well.\nThey want revised pricing before the board call.\nWe agreed to follow up next week.'
      )
    ).toBeNull()
    expect(parseSelectionList('just one line')).toBeNull()
    // Two plain lines are ambiguous — stay a single capture.
    expect(parseSelectionList('line one\nline two')).toBeNull()
  })

  it('over the cap → null (one gesture must not flood the queue)', () => {
    const many = Array.from({ length: MAX_LIST_ITEMS + 2 }, (_, i) => `- item ${i}`).join('\n')
    expect(parseSelectionList(many)).toBeNull()
  })
})
