import { describe, it, expect } from 'vitest'
import {
  hasChecklist,
  toggleCheckLine,
  toggleChecklist
} from '../../src/renderer/src/lib/stickyText'

describe('stickyText', () => {
  it('detects a checklist body', () => {
    expect(hasChecklist('[ ] buy milk\n[x] walk dog')).toBe(true)
    expect(hasChecklist('just a plain note')).toBe(false)
  })

  it('ticks a line and the ticked state survives a content round-trip (the reload acceptance)', () => {
    const body = '[ ] one\n[ ] two\n[ ] three'
    // Tick lines two and three (indices 1 and 2), as a user would.
    let next = toggleCheckLine(body, 1)
    next = toggleCheckLine(next, 2)
    // This string is exactly what gets persisted to widget.content and reloaded.
    expect(next).toBe('[ ] one\n[x] two\n[x] three')
    // Reloading parses the same string, so the two stay ticked.
    expect(hasChecklist(next)).toBe(true)
    expect(next.split('\n').filter((l) => /^\[x\]/i.test(l))).toHaveLength(2)
  })

  it('untoggles a done line back to open', () => {
    expect(toggleCheckLine('[x] done', 0)).toBe('[ ] done')
  })

  it('leaves non-checklist lines untouched when toggling by index', () => {
    expect(toggleCheckLine('plain line', 0)).toBe('plain line')
  })

  it('converts a plain body into a checklist and back', () => {
    const plain = 'buy milk\nwalk dog'
    const checked = toggleChecklist(plain)
    expect(checked).toBe('[ ] buy milk\n[ ] walk dog')
    // Toggling again strips the boxes.
    expect(toggleChecklist(checked)).toBe('buy milk\nwalk dog')
  })

  it('replaces a leading bullet with a checkbox rather than stacking them', () => {
    expect(toggleChecklist('- task a\n- task b')).toBe('[ ] task a\n[ ] task b')
  })

  it('preserves blank lines when converting', () => {
    expect(toggleChecklist('a\n\nb')).toBe('[ ] a\n\n[ ] b')
  })
})
