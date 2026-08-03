import { describe, it, expect } from 'vitest'
import { firstHttpUrl } from '../../src/renderer/src/lib/dropUrl'

describe('firstHttpUrl', () => {
  it('returns a single plain URL', () => {
    expect(firstHttpUrl('https://example.com/page')).toBe('https://example.com/page')
  })

  it('reads the first URL of a multi-line uri-list, skipping comment lines', () => {
    const uriList = '# some comment\r\nhttps://news.ycombinator.com\r\nhttps://example.org'
    expect(firstHttpUrl(uriList)).toBe('https://news.ycombinator.com')
  })

  it('accepts http and https only, rejecting other schemes and bare text', () => {
    expect(firstHttpUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(firstHttpUrl('ftp://files.example.com')).toBeNull()
    expect(firstHttpUrl('just some dragged text')).toBeNull()
    expect(firstHttpUrl('file:///Users/me/x.pdf')).toBeNull()
  })

  it('handles empty / null / whitespace input', () => {
    expect(firstHttpUrl('')).toBeNull()
    expect(firstHttpUrl(null)).toBeNull()
    expect(firstHttpUrl(undefined)).toBeNull()
    expect(firstHttpUrl('   \n  ')).toBeNull()
  })

  it('trims surrounding whitespace on the matched line', () => {
    expect(firstHttpUrl('   https://example.com  ')).toBe('https://example.com')
  })
})
