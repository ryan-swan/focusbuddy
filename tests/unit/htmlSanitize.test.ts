import { describe, it, expect } from 'vitest'
import { sanitizeHtml, sanitizeStyle } from '@renderer/lib/htmlSanitize'

// The sanitizer is the gate between untrusted HTML (AI replies, imported .docx)
// and the editor schema. It must keep the safe formatting subset and drop
// everything else without losing the underlying text.

describe('sanitizeHtml — allowed content survives', () => {
  it('keeps headings, paragraphs, lists and inline marks', () => {
    const out = sanitizeHtml(
      '<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> text</p><ul><li>one</li></ul>'
    )
    expect(out).toContain('<h1>Title</h1>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>italic</em>')
    expect(out).toContain('<li>one</li>')
  })

  it('keeps allowed inline styles (color, font, align)', () => {
    const out = sanitizeHtml('<p style="color: #ff0000; text-align: center">x</p>')
    expect(out).toContain('color: #ff0000')
    expect(out).toContain('text-align: center')
  })

  it('keeps a safe link href and image src', () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>')
    expect(out).toContain('href="https://example.com"')
    const img = sanitizeHtml('<img src="https://example.com/a.png" alt="a">')
    expect(img).toContain('src="https://example.com/a.png"')
  })

  it('keeps base64 image data URIs', () => {
    const out = sanitizeHtml('<img src="data:image/png;base64,AAAA">')
    expect(out).toContain('data:image/png;base64')
  })

  it('preserves table structure with colspan', () => {
    const out = sanitizeHtml('<table><tbody><tr><td colspan="2">c</td></tr></tbody></table>')
    expect(out).toContain('<td colspan="2">c</td>')
  })
})

describe('sanitizeHtml — dangerous content is removed', () => {
  it('drops script tags and their contents', () => {
    const out = sanitizeHtml('<p>safe</p><script>alert(1)</script>')
    expect(out).toContain('safe')
    expect(out.toLowerCase()).not.toContain('alert')
    expect(out.toLowerCase()).not.toContain('<script')
  })

  it('strips event handler attributes', () => {
    const out = sanitizeHtml('<p onclick="evil()">x</p>')
    expect(out.toLowerCase()).not.toContain('onclick')
    expect(out).toContain('x')
  })

  it('removes javascript: hrefs but keeps the text', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(out.toLowerCase()).not.toContain('javascript:')
    expect(out).toContain('click')
  })

  it('rejects non-image data URIs on img', () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>1</script>">')
    expect(out).not.toContain('data:text/html')
  })

  it('unwraps unknown tags but keeps their text', () => {
    const out = sanitizeHtml('<section><custom-thing>hello</custom-thing></section>')
    expect(out).toContain('hello')
    expect(out.toLowerCase()).not.toContain('custom-thing')
    expect(out.toLowerCase()).not.toContain('<section')
  })

  it('drops disallowed style properties and url() payloads', () => {
    const out = sanitizeHtml('<p style="position: fixed; background: url(javascript:1); color: blue">x</p>')
    expect(out).not.toContain('position')
    expect(out).not.toContain('url(')
    expect(out).toContain('color: blue')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml('   ')).toBe('')
  })
})

describe('sanitizeStyle', () => {
  it('keeps only allowlisted declarations', () => {
    expect(sanitizeStyle('color: red; display: none; font-size: 14px')).toBe(
      'color: red; font-size: 14px'
    )
  })
})
