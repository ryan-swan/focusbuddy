import { describe, it, expect } from 'vitest'
import type { Widget } from '../../src/shared/types'
import {
  widgetToText,
  docBodyToText,
  contentToPlainText,
  type WidgetTextResolvers
} from '../../src/shared/widgetText'

// Minimal widget factory; the extractor only reads kind/content/title/id.
function mk(kind: Widget['kind'], content: string, title = ''): Widget {
  return { id: 'w1', kind, content, title } as unknown as Widget
}

describe('widgetToText — one extractor for every kind', () => {
  it('reads plain text kinds directly', () => {
    expect(widgetToText(mk('note', 'buy milk')).text).toBe('buy milk')
    expect(widgetToText(mk('sticky', 'remember this')).text).toBe('remember this')
  })

  it('reads a Tiptap document body as plain text', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'world' }] }
      ]
    })
    expect(widgetToText(mk('page', doc)).text).toContain('Hello')
    expect(widgetToText(mk('page', doc)).text).toContain('world')
  })

  it('reads a table via the resolver (rows, not just the id)', () => {
    const resolvers: WidgetTextResolvers = {
      table: (id) =>
        id === 'tbl1'
          ? {
              title: 'Leads',
              columns: [
                { id: 'c1', label: 'Name' },
                { id: 'c2', label: 'Stage' }
              ],
              rows: [
                { c1: 'Acme', c2: 'Won' },
                { c1: 'Globex', c2: 'Lead' }
              ]
            }
          : null
    }
    const text = widgetToText(mk('table', 'tbl1'), resolvers).text
    expect(text).toContain('Name | Stage')
    expect(text).toContain('Acme | Won')
    expect(text).toContain('Globex | Lead')
  })

  it('reads an office document body via the resolver (not just the doc id)', () => {
    const resolvers: WidgetTextResolvers = { docText: (id) => (id === 'doc1' ? 'The quarterly plan' : null) }
    expect(widgetToText(mk('doc', 'doc1'), resolvers).text).toBe('The quarterly plan')
    // No resolver -> honest placeholder, never the raw id.
    expect(widgetToText(mk('doc', 'doc1')).text).toBe('(empty document)')
  })

  it('summarises a field, a chart and a mind map', () => {
    expect(widgetToText(mk('field', JSON.stringify({ def: { label: 'Budget' }, value: 5000 }))).text).toBe(
      'Budget: 5000'
    )
    const chart = JSON.stringify({ type: 'bar', title: 'Revenue', series: [{ columnId: 'c2', agg: 'sum', label: 'Total' }] })
    expect(widgetToText(mk('chart', chart)).text).toContain('bar chart "Revenue"')
    const mind = JSON.stringify({ root: { label: 'Goal', children: [{ label: 'Step A', children: [] }] } })
    const mm = widgetToText(mk('mindmap', mind)).text
    expect(mm).toContain('Goal')
    expect(mm).toContain('Step A')
  })

  it('uses live page text for a browser when available, else the URL', () => {
    const resolvers: WidgetTextResolvers = { liveText: (id) => (id === 'w1' ? 'Live page contents' : null) }
    expect(widgetToText(mk('webview', 'https://example.com'), resolvers).text).toBe('Live page contents')
    const noLive = widgetToText(mk('webview', 'https://example.com', 'Example'))
    expect(noLive.text).toContain('https://example.com')
    expect(noLive.source).toBe('https://example.com')
  })

  it('never dumps raw JSON for chrome-only kinds', () => {
    expect(widgetToText(mk('color', '#ff0000')).text).toBe('Colour #ff0000')
    expect(widgetToText(mk('minimap', '')).text).toBe('(minimap)')
  })
})

describe('docBodyToText — office bodies to plain text', () => {
  it('extracts a V2 sheet (tabs) and a legacy V1 sheet', () => {
    const v2 = { sheets: [{ name: 'Q1', columns: ['A', 'B'], rows: [['1', '2']] }] }
    expect(docBodyToText('sheet', v2)).toContain('A | B')
    expect(docBodyToText('sheet', v2)).toContain('1 | 2')
    const v1 = { columns: ['X', 'Y'], rows: [['9', '8']] }
    expect(docBodyToText('sheet', v1)).toContain('X | Y')
    expect(docBodyToText('sheet', v1)).toContain('9 | 8')
  })

  it('extracts slide text and speaker notes', () => {
    const body = {
      slides: [
        {
          elements: [{ type: 'text', paragraphs: [{ runs: [{ text: 'Title slide' }] }] }],
          notes: 'say hello'
        }
      ]
    }
    const t = docBodyToText('slides', body)
    expect(t).toContain('Title slide')
    expect(t).toContain('say hello')
  })

  it('extracts map node labels', () => {
    const body = { nodes: [{ data: { label: 'Start' } }, { data: { label: 'End' } }], edges: [{}] }
    const t = docBodyToText('map', body)
    expect(t).toContain('Start')
    expect(t).toContain('End')
  })
})

describe('contentToPlainText', () => {
  it('handles tiptap JSON, HTML, and plain text', () => {
    expect(contentToPlainText('<p>hi <b>there</b></p>')).toBe('hi there')
    expect(contentToPlainText('just text')).toBe('just text')
    expect(contentToPlainText(JSON.stringify({ type: 'doc', content: [{ type: 'text', text: 'json text' }] }))).toBe(
      'json text'
    )
  })
})
