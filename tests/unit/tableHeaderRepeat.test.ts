// The per-table "repeat header row" flag has to survive the round trip that
// matters: it is stored on the node, and it must reach the exported HTML, which
// is what the .docx and PDF exports are built from.
import { describe, it, expect } from 'vitest'
import { generateHTML, generateJSON } from '@tiptap/html'
import { Document } from '@tiptap/extension-document'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Text } from '@tiptap/extension-text'
import { TableKit } from '@tiptap/extension-table'
import { TableHeaderRepeat } from '../../src/renderer/src/components/documents/editor/tableHeaderRepeat'

const EXTS = [Document, Paragraph, Text, TableKit.configure({ table: { resizable: false } }), TableHeaderRepeat]

const tableDoc = (headerRepeat: boolean): Record<string, unknown> => ({
  type: 'doc',
  content: [
    {
      type: 'table',
      attrs: { headerRepeat },
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H' }] }] }
          ]
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }
          ]
        }
      ]
    }
  ]
})

describe('table headerRepeat attribute', () => {
  it('reaches the exported HTML when on — the .docx and PDF are built from this', () => {
    expect(generateHTML(tableDoc(true), EXTS)).toContain('data-header-repeat="true"')
  })

  it('adds nothing when off, so an ordinary table exports unchanged', () => {
    expect(generateHTML(tableDoc(false), EXTS)).not.toContain('data-header-repeat')
  })

  it('round-trips back from HTML, so a re-imported document keeps the setting', () => {
    const json = generateJSON(generateHTML(tableDoc(true), EXTS), EXTS) as {
      content: { type: string; attrs: Record<string, unknown> }[]
    }
    const table = json.content.find((n) => n.type === 'table')
    expect(table?.attrs.headerRepeat).toBe(true)
  })
})

// ── The .docx side ──────────────────────────────────────────────────────────
// html-to-docx cannot express a repeating header (no "tblHeader" exists in the
// library), so the flag is written into the finished package. These pin the XML
// rewrite that does it.
import { repeatHeaderFlags, withRepeatingHeaders } from '../../src/main/officeDocx'

const tbl = (rows: string): string => `<w:tbl>${rows}</w:tbl>`
const row = (inner = '', trPr = ''): string => `<w:tr>${trPr}${inner}</w:tr>`

describe('repeatHeaderFlags', () => {
  it('reads the flag per table, in document order', () => {
    const html = '<table><tr></tr></table><table data-header-repeat="true"><tr></tr></table>'
    expect(repeatHeaderFlags(html)).toEqual([false, true])
  })
})

describe('withRepeatingHeaders', () => {
  it('marks the first row of a flagged table', () => {
    const out = withRepeatingHeaders(tbl(row('<w:tc/>') + row('<w:tc/>')), [true])
    expect(out).toContain('<w:trPr><w:tblHeader/></w:trPr>')
    // First row only — a repeated data row would be wrong.
    expect(out.match(/<w:tblHeader\/>/g)).toHaveLength(1)
  })

  it('leaves an unflagged table untouched', () => {
    const src = tbl(row('<w:tc/>'))
    expect(withRepeatingHeaders(src, [false])).toBe(src)
  })

  it('merges into an existing trPr instead of emitting a second one', () => {
    const out = withRepeatingHeaders(tbl(row('<w:tc/>', '<w:trPr><w:trHeight/></w:trPr>')), [true])
    expect(out.match(/<w:trPr>/g)).toHaveLength(1)
    expect(out).toContain('<w:trPr><w:tblHeader/><w:trHeight/>')
  })

  it('applies flags to the matching table by order', () => {
    const out = withRepeatingHeaders(tbl(row('<w:tc>a</w:tc>')) + tbl(row('<w:tc>b</w:tc>')), [false, true])
    const [first, second] = out.split('</w:tbl>')
    expect(first).not.toContain('tblHeader')
    expect(second).toContain('tblHeader')
  })
})
