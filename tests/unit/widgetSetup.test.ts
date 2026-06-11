import { describe, it, expect } from 'vitest'
import { formatSetupItems } from '../../src/renderer/src/lib/widgetSetup'

describe('formatSetupItems — applies AI setup items in each widget format', () => {
  it('formats a sticky as tickable checklist lines', () => {
    expect(formatSetupItems('sticky-checklist', ['Email Sam', 'Book venue'])).toBe(
      '[ ] Email Sam\n[ ] Book venue'
    )
  })

  it('does not double-prefix an item that already has a checkbox or bullet', () => {
    expect(formatSetupItems('sticky-checklist', ['[ ] already', '- bullet'])).toBe(
      '[ ] already\n[ ] bullet'
    )
  })

  it('formats notes, markdown and a card as bullet lines', () => {
    expect(formatSetupItems('note-lines', ['one', 'two'])).toBe('- one\n- two')
    expect(formatSetupItems('markdown-bullets', ['a', 'b'])).toBe('- a\n- b')
    expect(formatSetupItems('card-bullets', ['x'])).toBe('- x')
  })

  it('drops blank items and trims', () => {
    expect(formatSetupItems('note-lines', ['  keep  ', '', '   '])).toBe('- keep')
  })

  it('returns an empty string when there is nothing to add', () => {
    expect(formatSetupItems('sticky-checklist', [])).toBe('')
  })
})
