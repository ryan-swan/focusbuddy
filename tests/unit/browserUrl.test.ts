import { describe, it, expect } from 'vitest'
import { normalizeUrl, resolveAddressInput, sanitizeWebviewUrl } from '../../src/renderer/src/lib/browserUrl'

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

describe('sanitizeWebviewUrl — guard for <webview src> and stored webview content', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeWebviewUrl('')).toBe('')
    expect(sanitizeWebviewUrl('   ')).toBe('')
  })

  it('passes a valid absolute http/https URL through', () => {
    expect(sanitizeWebviewUrl('https://github.com')).toBe('https://github.com/')
    expect(sanitizeWebviewUrl('http://localhost:5173/foo')).toBe('http://localhost:5173/foo')
  })

  it('preserves a valid fb-file:// content value (pdf/file widgets)', () => {
    expect(sanitizeWebviewUrl('fb-file://abc-123')).toContain('fb-file://abc-123')
  })

  it('never returns a relative/scheme-less string that would resolve against the bundle', () => {
    // The exact bug class: a relative asset path must NOT pass through, or
    // Electron would resolve it against file:///.../out/renderer/ and render
    // the bundle source as text.
    const asset = sanitizeWebviewUrl('assets/index-C5zD_VfV.js')
    expect(asset.startsWith('https://www.google.com/search')).toBe(true)
    expect(asset).not.toContain('assets/index')

    const relative = sanitizeWebviewUrl('plexioffice.html')
    expect(relative.startsWith('https://')).toBe(true)
    expect(relative).not.toBe('plexioffice.html')
  })

  it('turns free-text AI prose (the observed corruption) into a safe search', () => {
    const out = sanitizeWebviewUrl('Origin of the Name Michael Etymology derives from Hebrew')
    expect(out.startsWith('https://www.google.com/search?q=')).toBe(true)
  })
})

describe('resolveAddressInput — the unified surface, engine-aware (A2 unification)', () => {
  const brave = (q: string): string => `https://search.brave.com/search?q=${encodeURIComponent(q)}`

  it('navigates a real address without consulting the engine', () => {
    expect(resolveAddressInput('github.com', brave)).toBe('https://github.com/')
    expect(resolveAddressInput('https://example.com/a?b=1', brave)).toBe('https://example.com/a?b=1')
  })

  it("hands searchy input to the CALLER'S engine, not a hard-coded one", () => {
    expect(resolveAddressInput('best pizza recipes', brave)).toBe(
      'https://search.brave.com/search?q=best%20pizza%20recipes'
    )
    expect(resolveAddressInput('weather', brave)).toBe('https://search.brave.com/search?q=weather')
  })

  it('returns null only for empty input', () => {
    expect(resolveAddressInput('', brave)).toBeNull()
    expect(resolveAddressInput('   ', brave)).toBeNull()
  })

  it('normalizeUrl stays the fixed-Google special case of the same logic', () => {
    expect(normalizeUrl('best pizza recipes')).toBe(
      resolveAddressInput('best pizza recipes', (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`)
    )
  })
})
