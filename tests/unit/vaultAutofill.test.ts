import { describe, it, expect } from 'vitest'
import { buildAutofillScript } from '../../src/renderer/src/lib/vaultAutofill'

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
})
