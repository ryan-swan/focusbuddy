import { describe, it, expect } from 'vitest'
import { buildAutofillScript, hostMatches } from '../../src/renderer/src/lib/vaultAutofill'

describe('buildAutofillScript', () => {
  it('JSON-encodes credentials so quotes and backslashes cannot break out', () => {
    const script = buildAutofillScript('user"; drop_table()//', "p\\ass\nword")
    // Both fields are JSON-encoded — drop_table() should appear inside a string
    // literal, not as bare JS that could execute. Same for the backslash and
    // newline in the password.
    expect(script).toContain('"user\\"; drop_table()//"')
    expect(script).toContain('"p\\\\ass\\nword"')
    // And nothing that looks like an unescaped delimiter that could end the IIFE.
    expect(script).not.toContain('user"; drop_table()')
  })

  it('uses the native HTMLInputElement value setter (React-compatible)', () => {
    const script = buildAutofillScript('a', 'b')
    expect(script).toContain(
      "Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')"
    )
  })

  it('prioritises explicit autocomplete attributes over heuristic name matches', () => {
    const script = buildAutofillScript('a', 'b')
    const idxAutocompleteUser = script.indexOf('autocomplete="username"')
    const idxNameUser = script.indexOf('name*="user"')
    expect(idxAutocompleteUser).toBeGreaterThan(-1)
    expect(idxNameUser).toBeGreaterThan(idxAutocompleteUser)
  })

  it('prefers current-password over generic password=type fallback', () => {
    const script = buildAutofillScript('a', 'b')
    const idxCurrent = script.indexOf('current-password')
    const idxTypeFallback = script.indexOf('type="password"')
    expect(idxCurrent).toBeGreaterThan(-1)
    expect(idxTypeFallback).toBeGreaterThan(idxCurrent)
  })

  it('does not overwrite pre-filled inputs (idempotent)', () => {
    const script = buildAutofillScript('a', 'b')
    // The `set` helper inside the script bails when el.value is truthy — that
    // prevents autofill from stomping a value the user typed before the page
    // settled.
    expect(script).toContain('if (!el || el.value) return false')
  })

  it('handles empty credentials without throwing', () => {
    expect(() => buildAutofillScript('', '')).not.toThrow()
    const script = buildAutofillScript('', '')
    // The injected script guards against empty values so it won't blank out
    // pre-filled inputs.
    expect(script).toContain('if (userEl && username) touched = set(userEl, username) || touched')
    expect(script).toContain('if (passEl && password) touched = set(passEl, password) || touched')
  })

  it('wraps the body in a try/catch so a thrown error never breaks the page', () => {
    const script = buildAutofillScript('a', 'b')
    expect(script).toContain('try {')
    expect(script).toContain('} catch (e) {')
    expect(script).toContain('return false')
  })

  it('embeds an in-page origin guard when an expectedHost is supplied (defence in depth)', () => {
    const script = buildAutofillScript('a', 'b', 'github.com')
    // The expected host is embedded and the script checks location.hostname
    // against it before touching any field.
    expect(script).toContain('"github.com"')
    expect(script).toContain('location.hostname')
    expect(script).toContain("__h.endsWith('.' + __e)")
  })

  it('omits the origin guard when no expectedHost is supplied (back-compat)', () => {
    const script = buildAutofillScript('a', 'b')
    // The guard branch only runs when __expected is truthy; with no host it is
    // an empty string so the guard is a no-op.
    expect(script).toContain('const __expected = ""')
  })
})

describe('hostMatches (origin gate)', () => {
  it('matches the exact host', () => {
    expect(hostMatches('github.com', 'github.com')).toBe(true)
  })

  it('matches a subdomain of the bound host (login redirects)', () => {
    expect(hostMatches('accounts.google.com', 'google.com')).toBe(true)
    expect(hostMatches('login.microsoftonline.com', 'microsoftonline.com')).toBe(true)
  })

  it('ignores a leading www. on either side', () => {
    expect(hostMatches('www.figma.com', 'figma.com')).toBe(true)
    expect(hostMatches('figma.com', 'www.figma.com')).toBe(true)
  })

  it('REFUSES a different registrable domain (the credential-exfil case)', () => {
    expect(hostMatches('evil.com', 'github.com')).toBe(false)
    // look-alike suffix without the dot boundary must NOT match
    expect(hostMatches('evilgithub.com', 'github.com')).toBe(false)
    expect(hostMatches('github.com.evil.com', 'github.com')).toBe(false)
  })

  it('fails closed on empty / unparseable hosts', () => {
    expect(hostMatches('', 'github.com')).toBe(false)
    expect(hostMatches('github.com', '')).toBe(false)
  })
})
