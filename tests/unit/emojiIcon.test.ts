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

// The hast-level transform (the AI-41 glitch fix): swapping happens in the
// tree BEFORE the reveal pipeline wraps words, so streaming never paints a
// raw emoji.
import { applySectionIcon } from '../../src/renderer/src/lib/rehypeSectionIcons'

function h2(text: string) {
  return {
    type: 'element' as const,
    tagName: 'h2',
    children: [{ type: 'text' as const, value: text }]
  }
}

describe('applySectionIcon', () => {
  it('replaces a heading emoji with the icon span in place', () => {
    const el = h2('🚀 Next steps')
    applySectionIcon(el)
    expect(el.children).toHaveLength(2)
    const icon = el.children[0] as { tagName: string; children: Array<{ value: string }> }
    expect(icon.tagName).toBe('span')
    expect(icon.children[0].value).toBe('rocket_launch')
    expect((el.children[1] as { value: string }).value).toBe('Next steps')
  })

  it('holds back a lone trailing high surrogate instead of painting tofu', () => {
    const el = h2('\uD83D')
    applySectionIcon(el)
    expect((el.children[0] as { value: string }).value).toBe('')
  })

  it('strips an unmapped emoji to a plain heading', () => {
    const el = h2('🦄 Wild Ideas')
    applySectionIcon(el)
    expect(el.children).toHaveLength(1)
    expect((el.children[0] as { value: string }).value).toBe('Wild Ideas')
  })

  it('never touches a paragraph', () => {
    const el = { ...h2('🚀 mid prose'), tagName: 'p' }
    applySectionIcon(el)
    expect((el.children[0] as { value: string }).value).toBe('🚀 mid prose')
  })
})
