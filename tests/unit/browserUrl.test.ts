import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '../../src/renderer/src/lib/browserUrl'

describe('normalizeUrl — address bar input', () => {
  it('returns null only for empty input', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
  })

  it('navigates to a real dotted host, adding https when missing', () => {
    expect(normalizeUrl('github.com')).toBe('https://github.com/')
    expect(normalizeUrl('github.com/saasmouth')).toBe('https://github.com/saasmouth')
    expect(normalizeUrl('news.ycombinator.com')).toBe('https://news.ycombinator.com/')
  })

  it('respects an explicit scheme', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/')
    expect(normalizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
  })

  it('treats localhost, ports and IPs as navigations', () => {
    expect(normalizeUrl('localhost:3000')).toBe('https://localhost:3000/')
    expect(normalizeUrl('127.0.0.1:8080')).toBe('https://127.0.0.1:8080/')
    expect(normalizeUrl('192.168.1.10')).toBe('https://192.168.1.10/')
  })

  it('runs a multi-word query as a Google search instead of a broken page', () => {
    expect(normalizeUrl('best pizza recipes')).toBe(
      'https://www.google.com/search?q=best%20pizza%20recipes'
    )
    // The percent-encoded broken page is exactly what we are avoiding.
    expect(normalizeUrl('best pizza recipes')).not.toContain('best%20pizza%20recipes/')
  })

  it('runs a bare word with no dot as a search, not https://word', () => {
    expect(normalizeUrl('weather')).toBe('https://www.google.com/search?q=weather')
    expect(normalizeUrl('react')).toBe('https://www.google.com/search?q=react')
  })

  it('searches a question and encodes punctuation safely', () => {
    expect(normalizeUrl('what is 2+2?')).toBe('https://www.google.com/search?q=what%20is%202%2B2%3F')
  })

  it('searches a domain-looking phrase that contains a space', () => {
    // A space means search even if a dotted token is present.
    expect(normalizeUrl('apple.com vs google.com')).toContain('https://www.google.com/search?q=')
  })

  it('falls back to a search when a scheme is typed but the rest is unparseable', () => {
    expect(normalizeUrl('https://')).toBe('https://www.google.com/search?q=https%3A%2F%2F')
  })
})
