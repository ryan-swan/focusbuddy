// The dictation sink for the Whisper talk button: track the last-focused editable
// and insert a transcript into it. The full mic->Whisper->insert flow needs a real
// microphone (not automatable), but the target-tracking + insertion seam is pure
// DOM and tested here. execCommand('insertText') is a no-op in jsdom, so these
// exercise the manual value-splice fallback for inputs/textareas (the path that
// guarantees insertion when execCommand is unavailable).

import { describe, it, expect, beforeEach } from 'vitest'
import { initDictationTracker, getDictationTarget, dictateInto } from '@renderer/lib/dictation'

beforeEach(() => {
  document.body.innerHTML = ''
  initDictationTracker() // idempotent
})

describe('dictation target tracking', () => {
  it('tracks the last-focused textarea as the dictation target', () => {
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(getDictationTarget()).toBe(ta)
  })

  it('ignores editables inside the voice FAB (data-voice-fab)', () => {
    const outer = document.createElement('div')
    outer.setAttribute('data-voice-fab', '')
    const inner = document.createElement('textarea')
    outer.appendChild(inner)
    document.body.appendChild(outer)
    inner.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(getDictationTarget()).toBeNull()
  })

  it('drops a target that has been removed from the DOM', () => {
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(getDictationTarget()).toBe(ta)
    ta.remove()
    expect(getDictationTarget()).toBeNull()
  })

  it('does not treat a plain div or a button as a target', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(getDictationTarget()).toBeNull()
  })
})

describe('dictateInto', () => {
  it('inserts at the caret of a textarea and fires input', () => {
    const ta = document.createElement('textarea')
    ta.value = 'ab'
    document.body.appendChild(ta)
    ta.setSelectionRange(1, 1) // caret between a and b
    let fired = false
    ta.addEventListener('input', () => {
      fired = true
    })
    const ok = dictateInto(ta, 'X')
    expect(ok).toBe(true)
    expect(fired).toBe(true)
    // "a" + "X " + "b"
    expect(ta.value).toBe('aX b')
  })

  it('appends a trailing space so successive dictations do not run together', () => {
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.value = ''
    document.body.appendChild(inp)
    inp.setSelectionRange(0, 0)
    dictateInto(inp, 'hello')
    expect(inp.value).toBe('hello ')
  })

  it('returns false for empty/whitespace text', () => {
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    expect(dictateInto(ta, '   ')).toBe(false)
  })
})
