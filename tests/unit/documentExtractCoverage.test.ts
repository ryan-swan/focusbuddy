// U4a — document extractor coverage. The office doc types the brain could not read.
//
// WHAT WAS ACTUALLY WRONG, measured on the operator's live corpus rather than assumed:
//
//   sheet   22 docs. extractDocText only read the V2 shape (`body.sheets[]`). 18 are the V1 shape
//           (top-level `columns` / `rows`) and returned ''. Of those 18, FIVE hold real content —
//           342,010 · 29,231 · 563 · 560 · 399 characters — and 13 are blank 100x48 default grids.
//   design  2 docs, both returning ''. One is empty; one holds 7 text elements.
//   slides  5 docs. NOT an extractor gap — every deck is a single slide titled "Title slide".
//   map     4 docs. NOT an extractor gap — every map is one node labelled "Start".
//
// That distinction is the point of this file. The headline "33 files invisible" was wrong: most of
// those documents are empty scaffolds, and an extractor that surfaced them would be manufacturing
// filler — precisely what the admission gate (D6 / DEC-022) exists to reject. Six real documents
// were invisible. The extractors below are written so that empty scaffolds keep producing nothing,
// and that property is locked, not hoped for.

import { describe, it, expect } from 'vitest'
import { extractDocText } from '../../src/main/workspaceRank'
import { admitChunk } from '../../src/shared/admission'

// ── Real shapes, taken from the live corpus (sqlite json_each over documents.body) ──────────

const v1Sheet = {
  version: 1,
  columns: ['Company', 'Contact', 'Stage'],
  rows: [
    ['Loop ERP', 'caleb@loop', 'Qualified'],
    ['Flamelit', 'sam@flamelit', 'Discovery']
  ]
}

const v2Sheet = {
  sheets: [{ columns: ['Item', 'Cost'], rows: [['Server', '400']] }],
  activeSheet: 0
}

// 13 of 18 V1 sheets look exactly like this: a default grid, sized but never filled.
const blankGrid = { version: 1, columns: Array(48).fill(''), rows: Array(100).fill(Array(48).fill('')) }

const design = {
  schemaVersion: 1,
  elements: [
    { id: 'e1', type: 'text', paragraphs: [{ runs: [{ text: 'Brand palette' }] }] },
    { id: 'e2', type: 'shape', cornerRadius: 4 },
    { id: 'e3', type: 'text', paragraphs: [{ runs: [{ text: 'Primary ' }, { text: 'navy' }] }] }
  ]
}

const emptyDesign = { schemaVersion: 1, elements: [], pages: [] }

const map = {
  version: 1,
  nodes: [
    { id: 'n1', label: 'Discovery call', shape: 'box' },
    { id: 'n2', label: 'Proposal sent', shape: 'box' }
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'within 3 days' }]
}

const defaultMap = { version: 1, nodes: [{ id: 'n1', label: 'Start', shape: 'box' }], edges: [] }

const slides = {
  slides: [
    {
      id: 's1',
      title: 'Q3 pipeline',
      bullets: ['Two enterprise deals', 'Renewal risk on Acme'],
      notes: 'Lead with the renewal',
      elements: [{ type: 'text', paragraphs: [{ runs: [{ text: 'Pipeline review' }] }] }]
    }
  ]
}

const defaultDeck = { slides: [{ id: 's1', title: 'Title slide', elements: [] }] }

describe('U4a — the V1 sheet shape is read, which is where the real content was', () => {
  it('v1 sheets extract their headers and cells', () => {
    const out = extractDocText('sheet', v1Sheet)
    expect(out).toContain('Company')
    expect(out).toContain('Loop ERP')
    expect(out).toContain('Discovery')
  })

  it('the V2 shape still works — this is additive, not a replacement', () => {
    const out = extractDocText('sheet', v2Sheet)
    expect(out).toContain('Item')
    expect(out).toContain('Server')
  })

  // A document carrying BOTH shapes must not double-count. V2 is the newer authority.
  it('a document with both shapes prefers V2 and does not concatenate both', () => {
    const both = { ...v1Sheet, sheets: v2Sheet.sheets }
    const out = extractDocText('sheet', both)
    expect(out).toContain('Server')
    expect(out).not.toContain('Loop ERP') // V1 arm did not also run
  })
})

describe('U4a — design and map and slides read their real text', () => {
  it('design elements yield their paragraph runs', () => {
    const out = extractDocText('design', design)
    expect(out).toContain('Brand palette')
    expect(out).toContain('Primary navy') // runs joined without a spurious separator
  })

  it('map nodes and edge labels are read', () => {
    const out = extractDocText('map', map)
    expect(out).toContain('Discovery call')
    expect(out).toContain('Proposal sent')
    expect(out).toContain('within 3 days')
  })

  // The pre-existing slides arm only read `elements`. Real decks put most of their text in
  // `title` and `bullets`, which were being dropped.
  it('slides read title and bullets, not only elements', () => {
    const out = extractDocText('slides', slides)
    expect(out).toContain('Q3 pipeline')
    expect(out).toContain('Renewal risk on Acme')
    expect(out).toContain('Pipeline review')
    expect(out).toContain('Lead with the renewal')
  })
})

describe('U4a — empty scaffolds must stay empty. Coverage is not the goal; findable CONTENT is', () => {
  // This is the half of the change that matters most. 13 blank grids, 5 default decks and 4
  // default maps exist in the live corpus. An extractor that "improves coverage" by surfacing
  // them would be manufacturing filler, and the admission gate would then be the only thing
  // standing between the user and a search result that says "Start".
  it('a blank default grid extracts to nothing usable', () => {
    expect(extractDocText('sheet', blankGrid).replace(/[\s|]/g, '')).toBe('')
  })

  it('an empty design extracts to nothing', () => {
    expect(extractDocText('design', emptyDesign).trim()).toBe('')
  })

  // FOUND BY MEASURING THE LIVE CORPUS AFTER THE FIRST GREEN, not by reasoning about it. The first
  // implementation emitted ~6,000 characters of "A | B | C | …" for each blank grid — the default
  // column LETTERS, with zero filled data cells — and that sailed through the admission gate on
  // length. A spreadsheet's content is its data; headers describe data that is not there.
  it('a grid whose headers are column letters and whose cells are all empty yields nothing', () => {
    const lettered = {
      version: 1,
      columns: ['A', 'B', 'C', 'D', 'E'],
      rows: Array(100).fill(['', '', '', '', ''])
    }
    expect(extractDocText('sheet', lettered).trim()).toBe('')
    expect(admitChunk(extractDocText('sheet', lettered))).toBe(false)
  })

  it('headers WITH data still extract — the rule is "no filled cell", not "no headers"', () => {
    const oneCell = { version: 1, columns: ['Company', 'Stage'], rows: [['', ''], ['Loop ERP', '']] }
    expect(extractDocText('sheet', oneCell)).toContain('Loop ERP')
    expect(extractDocText('sheet', oneCell)).toContain('Company')
  })

  // Also found by measurement: every real deck produced "Title slide\nTitle slide", because the
  // title is ALSO rendered as a text element. Counting one fact twice is the same error the
  // V1/V2 sheet rule avoids, and de-duplicating it drops the scaffold below the admission floor
  // without special-casing the words "Title slide" anywhere.
  it('a title repeated as a text element is counted once, not twice', () => {
    const dupe = { slides: [{ id: 's1', title: 'Q3 pipeline', elements: [{ type: 'text', paragraphs: [{ runs: [{ text: 'Q3 pipeline' }] }] }] }] }
    expect(extractDocText('slides', dupe)).toBe('Q3 pipeline')
  })

  it('the real default deck shape is not admissible', () => {
    const realScaffold = { slides: [{ id: 's1', title: 'Title slide', bullets: [], elements: [{ type: 'text', paragraphs: [{ runs: [{ text: 'Title slide' }] }] }] }] }
    expect(admitChunk(extractDocText('slides', realScaffold))).toBe(false)
  })

  it('default scaffolds are rejected by the admission gate even if they yield a token', () => {
    // "Start" and "Title slide" are exactly the filler D6 / DEC-022 was written for. Whatever the
    // extractors produce for a default scaffold must not be admissible as an answer.
    expect(admitChunk(extractDocText('map', defaultMap))).toBe(false)
    expect(admitChunk(extractDocText('slides', defaultDeck))).toBe(false)
    expect(admitChunk(extractDocText('sheet', blankGrid))).toBe(false)
  })
})

describe('U4a — extraction is total and bounded', () => {
  it('malformed bodies degrade to empty rather than throwing', () => {
    for (const t of ['sheet', 'design', 'map', 'slides', 'doc']) {
      expect(() => extractDocText(t, null)).not.toThrow()
      expect(() => extractDocText(t, { rows: 'not-an-array', elements: 42, nodes: {} })).not.toThrow()
      expect(extractDocText(t, undefined)).toBe('')
    }
  })

  it('an unknown docType still yields empty rather than guessing', () => {
    expect(extractDocText('hologram', { rows: [['x']] })).toBe('')
  })

  // The 12k ceiling is a pre-existing global bound on every doc type. It is NOT changed here —
  // this lock exists so the truncation is a recorded, deliberate property rather than a surprise.
  // Consequence worth stating: the 342k-character lead engine is indexed to its first 12k, so the
  // brain sees its headers and roughly its first rows. Raising the ceiling is a separate decision
  // with index-size cost, deliberately not taken inside this change.
  it('output is capped at the existing 12k ceiling', () => {
    const huge = { version: 1, columns: ['c'], rows: Array(20000).fill(['some cell text here']) }
    expect(extractDocText('sheet', huge).length).toBeLessThanOrEqual(12000)
  })
})
