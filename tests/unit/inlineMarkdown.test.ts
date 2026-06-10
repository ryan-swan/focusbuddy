import { describe, it, expect } from 'vitest'
import { parseInline } from '../../src/renderer/src/lib/inlineMarkdown'

describe('parseInline', () => {
  it('returns a single text token for plain text', () => {
    expect(parseInline('just words')).toEqual([{ type: 'text', value: 'just words' }])
  })

  it('parses bold', () => {
    expect(parseInline('a **b** c')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'bold', value: 'b' },
      { type: 'text', value: ' c' }
    ])
  })

  it('parses italic without eating bold', () => {
    expect(parseInline('**x** and *y*')).toEqual([
      { type: 'bold', value: 'x' },
      { type: 'text', value: ' and ' },
      { type: 'italic', value: 'y' }
    ])
  })

  it('parses a markdown link', () => {
    expect(parseInline('see [docs](https://example.com/d)')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', text: 'docs', href: 'https://example.com/d' }
    ])
  })

  it('autolinks a bare URL (the card acceptance: a pasted URL renders and opens)', () => {
    const out = parseInline('open https://news.ycombinator.com now')
    expect(out).toEqual([
      { type: 'text', value: 'open ' },
      { type: 'link', text: 'https://news.ycombinator.com', href: 'https://news.ycombinator.com' },
      { type: 'text', value: ' now' }
    ])
  })

  it('handles a bold phrase and a pasted URL together (the full card acceptance)', () => {
    const out = parseInline('**Important** see https://example.org')
    expect(out[0]).toEqual({ type: 'bold', value: 'Important' })
    expect(out[out.length - 1]).toEqual({
      type: 'link',
      text: 'https://example.org',
      href: 'https://example.org'
    })
  })
})
