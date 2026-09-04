import { describe, it, expect } from 'vitest'
import { extractDocText } from '../../src/main/workspaceRank'
import { docBodyToText } from '../../src/shared/widgetText'

// Both shapes below were taken from the operator's real workspace, where they
// extracted to nothing and were therefore invisible to retrieval, embedding,
// enrichment and memory alike. Measured on that database: sheets went 18/32 ->
// 32/32 documents yielding text, designs 0/13 -> 8/13 (the remaining five hold
// no text elements at all and correctly yield nothing).

describe('sheet text extraction across both stored shapes', () => {
  const V2 = { version: 2, sheets: [{ columns: ['Item', 'Cost'], rows: [['Widget', '42']] }], activeSheet: 0 }
  // Legacy V1: columns and rows sit at the TOP level, with no `sheets` array.
  const V1 = { columns: ['Item', 'Cost'], rows: [['Widget', '42']] }

  it('reads the V2 nested shape', () => {
    expect(extractDocText('sheet', V2)).toContain('Widget')
    expect(extractDocText('sheet', V2)).toContain('Cost')
  })

  it('reads the legacy V1 flat shape', () => {
    const text = extractDocText('sheet', V1)
    expect(text).toContain('Widget')
    expect(text).toContain('Cost')
  })

  it('prefers V2 when both could apply, and never returns empty for either', () => {
    const both = { ...V1, sheets: [{ columns: ['Only'], rows: [['V2']] }] }
    expect(extractDocText('sheet', both)).toContain('V2')
    expect(extractDocText('sheet', V1).trim().length).toBeGreaterThan(0)
    expect(extractDocText('sheet', V2).trim().length).toBeGreaterThan(0)
  })

  it('still yields nothing for a sheet with no columns or rows', () => {
    expect(extractDocText('sheet', { sheets: [] }).trim()).toBe('')
  })
})

describe('design text extraction', () => {
  // A design element carries copy the way a slide element does — through
  // paragraphs[].runs[].text — not as a flat `text` property.
  const DESIGN = {
    schemaVersion: 1,
    width: 1080,
    height: 1080,
    elements: [
      { id: 'bg', type: 'shape', shape: 'rect' },
      {
        id: 'eyebrow',
        type: 'text',
        paragraphs: [{ runs: [{ text: 'ANNOUNCING', bold: true }], align: 'left' }]
      },
      {
        id: 'headline',
        type: 'text',
        paragraphs: [{ runs: [{ text: 'The new ' }, { text: 'release' }] }]
      }
    ]
  }

  it('recovers copy from paragraphs and runs', () => {
    const text = docBodyToText('design', DESIGN)
    expect(text).toContain('ANNOUNCING')
    // Runs within one paragraph join without a separator.
    expect(text).toContain('The new release')
  })

  it('is reachable through the main-process extractor too', () => {
    expect(extractDocText('design', DESIGN)).toContain('ANNOUNCING')
  })

  it('still honours a flat text property on other element shapes', () => {
    expect(docBodyToText('design', { elements: [{ type: 'text', text: 'flat shape' }] })).toContain('flat shape')
  })

  it('yields nothing for a design that genuinely holds no text', () => {
    expect(docBodyToText('design', { elements: [{ type: 'shape' }, { type: 'line' }] }).trim()).toBe('')
  })
})
