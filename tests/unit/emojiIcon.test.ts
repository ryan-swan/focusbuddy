import { describe, it, expect } from 'vitest'
import { splitLeadingEmoji, EMOJI_ICON_MAP } from '../../src/renderer/src/lib/emojiIcon'

// A5.5, AI-41 (the R25 amendment): a leading emoji is an icon HINT — mapped
// to a premium icon when known, stripped when not, untouched when absent.

describe('splitLeadingEmoji', () => {
  it("maps the screenshot's own headings", () => {
    expect(splitLeadingEmoji('🚀 Open Commitments')).toEqual({
      matched: true,
      icon: 'rocket_launch',
      rest: 'Open Commitments'
    })
    expect(splitLeadingEmoji('💡 Other Context')).toEqual({
      matched: true,
      icon: 'lightbulb',
      rest: 'Other Context'
    })
  })

  it('variation-selector forms map both ways', () => {
    expect(splitLeadingEmoji('⚠️ Risks').icon).toBe('warning')
    expect(splitLeadingEmoji('⚠ Risks').icon).toBe('warning')
    expect(splitLeadingEmoji('📅 Timeline').icon).toBe('calendar_month')
  })

  it('an unmapped emoji strips to a plain heading', () => {
    const r = splitLeadingEmoji('🦄 Wild Ideas')
    expect(r.matched).toBe(true)
    expect(r.icon).toBeNull()
    expect(r.rest).toBe('Wild Ideas')
  })

  it('plain text passes through untouched', () => {
    expect(splitLeadingEmoji('Open Commitments')).toEqual({
      matched: false,
      icon: null,
      rest: 'Open Commitments'
    })
  })

  it('a numbered heading keeps its number (keycaps never match)', () => {
    expect(splitLeadingEmoji('1. First step').matched).toBe(false)
  })

  it('an emoji mid-sentence is not a section marker', () => {
    expect(splitLeadingEmoji('We ship 🚀 tomorrow').matched).toBe(false)
  })

  it('every map value is a plausible Material name', () => {
    for (const v of Object.values(EMOJI_ICON_MAP)) {
      expect(v).toMatch(/^[a-z][a-z0-9_]+$/)
    }
  })
})
