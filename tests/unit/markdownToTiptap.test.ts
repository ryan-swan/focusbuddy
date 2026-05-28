import { describe, it, expect } from 'vitest'
import { markdownToTiptap } from '../../src/main/ai/markdownToTiptap'

describe('markdownToTiptap', () => {
  it('produces a doc node with empty paragraph for empty input', () => {
    const doc = markdownToTiptap('')
    expect(doc.type).toBe('doc')
    expect(doc.content.length).toBe(1)
    expect(doc.content[0].type).toBe('paragraph')
  })

  it('parses headings at three levels', () => {
    const doc = markdownToTiptap('# H1\n\n## H2\n\n### H3')
    expect(doc.content.map((b) => b.type)).toEqual(['heading', 'heading', 'heading'])
    expect(doc.content[0].attrs?.level).toBe(1)
    expect(doc.content[1].attrs?.level).toBe(2)
    expect(doc.content[2].attrs?.level).toBe(3)
  })

  it('parses bullet list', () => {
    const doc = markdownToTiptap('- alpha\n- beta\n- gamma')
    expect(doc.content[0].type).toBe('bulletList')
    expect(doc.content[0].content?.length).toBe(3)
  })

  it('parses task list with checked + unchecked items', () => {
    const doc = markdownToTiptap('- [ ] open thing\n- [x] done thing')
    expect(doc.content[0].type).toBe('taskList')
    const items = doc.content[0].content ?? []
    expect(items.length).toBe(2)
    expect(items[0].attrs?.checked).toBe(false)
    expect(items[1].attrs?.checked).toBe(true)
  })

  it('parses ordered list', () => {
    const doc = markdownToTiptap('1. first\n2. second')
    expect(doc.content[0].type).toBe('orderedList')
    expect(doc.content[0].content?.length).toBe(2)
  })

  it('parses inline bold + italic + code + link', () => {
    const doc = markdownToTiptap('Hello **bold** *italic* `code` [link](https://x.com).')
    const para = doc.content[0]
    expect(para.type).toBe('paragraph')
    const marks = (para.content ?? [])
      .map((n) => ('marks' in n && n.marks ? n.marks[0]?.type : null))
      .filter(Boolean)
    expect(marks).toEqual(['bold', 'italic', 'code', 'link'])
  })

  it('parses blockquote and horizontal rule', () => {
    const doc = markdownToTiptap('> a quote\n\n---\n\nafter')
    const types = doc.content.map((b) => b.type)
    expect(types).toContain('blockquote')
    expect(types).toContain('horizontalRule')
  })

  it('falls back to paragraph for unknown content (no crash on code fence)', () => {
    const doc = markdownToTiptap('```\nfenced code that we do not support\n```\nplain text after')
    // The fence lines collapse into paragraphs — we just need it not to throw
    // and to produce SOMETHING that the renderer can display.
    expect(doc.content.length).toBeGreaterThan(0)
  })
})
