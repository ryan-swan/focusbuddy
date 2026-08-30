import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { titleFromCapture } from '../../src/main/ai/intentRules'
import { CAPTURE_LEADINS } from '../../src/renderer/src/lib/captureCopy'

// The Capture rebuild (operator spec, 2026-08-30) — Book time's sibling.
// DEC number assigned at commit time.

const read = (p: string): string => readFileSync(p, 'utf8')
const console_ = read('src/renderer/src/components/CaptureConsole.tsx')
const card = read('src/renderer/src/components/AttentionConfirmCard.tsx')

describe('step 1 — two fields, two Enters, no tab bar', () => {
  it('the tab bar is gone: destination lives on the commit, not a mode', () => {
    expect(console_).not.toContain("'routed'")
    expect(console_).not.toContain('modeBtn')
    expect(console_).not.toContain("useState<Mode>")
    expect(console_).toContain('fileVerbatim')
  })

  it('both commit paths, stated in the footer', () => {
    expect(console_).toContain("e.key === 'Enter' && (e.metaKey || e.ctrlKey)")
    expect(console_).toContain('file exactly as typed')
    expect(console_).toContain('Continue')
  })

  it('the rotating placeholder teaches seven category lead-ins, ~2.6s', () => {
    expect(CAPTURE_LEADINS).toHaveLength(7)
    expect(read('src/renderer/src/lib/captureCopy.ts')).toContain('export const ROTATE_MS = 2600')
    // …and never rotates under a cursor or over typed text.
    expect(console_).toContain('if (!open || text || titleFocused) return')
  })

  it('both fields are labelled — the split is explicit, not behind Tab', () => {
    expect(console_).toContain('WHAT NEEDS YOU?')
    expect(console_).toContain('NOTES')
    expect(console_).not.toContain('(optional)')
  })
})

describe('step 2 — four labelled pills, one drawer, a stated default', () => {
  it('the four dimensions render as labelled pills with chevrons', () => {
    for (const k of ['category', 'urgency', 'when', 'desk'])
      expect(card).toContain(`'${k}'`)
    expect(card).toContain('expand_more')
    expect(card).toContain('rotate-180')
    expect(card).toContain('border-[var(--edge-strong)]')
  })

  it('one drawer at a time, each led by its question', () => {
    expect(card).toContain("useState<'category' | 'urgency' | 'when' | 'desk' | null>")
    expect(card).toContain('What is this item asking you to do?')
    expect(card).toContain('How hard is it pushing?')
    expect(card).toContain('When should this come back to you?')
    expect(card).toContain('Where does this work already live?')
  })

  it('accent means "a machine guessed this": category/when/desk can light, urgency cannot', () => {
    expect(card).toContain('const catAccent = !catTouched')
    expect(card).toContain('const whenAccent = whenInferred && !whenTouched')
    expect(card).toContain("pill('urgency', 'URGENCY', urgency[0].toUpperCase() + urgency.slice(1), false)")
  })

  it('number keys 1–8 set the category directly, drawer open or not', () => {
    expect(card).toContain("/^[1-8]$/.test(e.key)")
  })

  it('Esc is two-stage and never destroys work on the first press', () => {
    const esc = card.slice(card.indexOf("e.key === 'Escape'"), card.indexOf('onCancel()', card.indexOf("e.key === 'Escape'")))
    expect(esc).toContain('if (openDrawer)')
    expect(esc).toContain('setOpenDrawer(null)')
  })

  it('the WHEN default is Someday — filing semantics unchanged (null dueAt)', () => {
    expect(card).toContain("'someday'")
    expect(card).toContain('default:\n            return null')
  })

  it('the @ input lives inside the Desk drawer — the product-wide grammar', () => {
    const drawer = card.slice(card.indexOf("openDrawer === 'desk' && ("))
    expect(drawer).toContain('TagMentionInput')
  })

  it('File it toasts "Filed to …" with an R008-honest Undo (dismiss, never delete)', () => {
    expect(card).toContain('`Filed to ${CLASS_LABEL')
    expect(card).toContain("await store.setState(id, 'dismissed')")
  })
})

describe('title cleanup — scaffolding never survives into the item', () => {
  it('strips the capture lead-ins the classifier was told through', () => {
    expect(titleFromCapture('remind me to call Doug about the vendor contract')).toBe(
      'Call Doug about the vendor contract'
    )
    expect(titleFromCapture('i need to review the Q3 deck')).toBe('Review the Q3 deck')
    expect(titleFromCapture('todo: ship the palette')).toBe('Ship the palette')
    expect(titleFromCapture('note to self: buy stamps')).toBe('Buy stamps')
    expect(titleFromCapture("don't forget to file taxes")).toBe('File taxes')
  })
})
