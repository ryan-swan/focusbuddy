import { describe, it, expect } from 'vitest'
import { mentionReplaceRange } from '../../src/renderer/src/lib/mentionRange'

// The "@att" + Tab → "att @attention" leftover (operator live QA): the
// suggestion plugin's range can lag the caret by a keystroke, so the picked
// mention replaced only part of what the user typed.

describe('mentionReplaceRange', () => {
  it('replaces from the "@" to the caret when the hint is current', () => {
    // doc: "hello @att", caret at 10, "@" at 6.
    expect(mentionReplaceRange(10, 'hello @att', { from: 6, to: 10 })).toEqual({ from: 6, to: 10 })
  })

  it('THE BUG: a hint that lags the caret still consumes the whole query', () => {
    // The plugin still reports the range from when only "@" had been typed.
    // Trusting it verbatim is what left "att" in the box.
    expect(mentionReplaceRange(10, 'hello @att', { from: 6, to: 7 })).toEqual({ from: 6, to: 10 })
  })

  it('a hint that starts BEFORE the "@" is honoured (never leaves a fragment)', () => {
    expect(mentionReplaceRange(10, 'hello @att', { from: 5, to: 10 })).toEqual({ from: 5, to: 10 })
  })

  it('uses the "@" NEAREST the caret — an earlier one is a finished mention', () => {
    // doc: "@Design notes @att", caret 18; the live query starts at 14.
    expect(mentionReplaceRange(18, '@Design notes @att', { from: 14, to: 15 })).toEqual({
      from: 14,
      to: 18
    })
  })

  it('falls back to the hint when no "@" is in the window', () => {
    expect(mentionReplaceRange(10, 'plain text', { from: 4, to: 10 })).toEqual({ from: 4, to: 10 })
  })

  it('never ends before the caret, even with a stale hint and no anchor', () => {
    expect(mentionReplaceRange(12, 'plain text', { from: 4, to: 7 })).toEqual({ from: 4, to: 12 })
  })

  it('handles the "@" being the very first character of the window', () => {
    expect(mentionReplaceRange(4, '@att', { from: 0, to: 1 })).toEqual({ from: 0, to: 4 })
  })
})
