import { describe, it, expect } from 'vitest'
import {
  presetForWidget,
  presetForDesk,
  presetForMulti
} from '../../src/renderer/src/lib/attentionPresets'
import { INTENT_CLASSES } from '../../src/shared/workItems'

// CR-09 D-A — object marking. "Intelligent" means the system knows what the
// thing IS: a pure table, zero AI, works with the key removed (Layer 0).

const CLASSES = INTENT_CLASSES as readonly string[]

describe('presetForWidget', () => {
  const cases: Array<[string, string, RegExp, string]> = [
    ['slack', 'Design channel', /^Follow up in Design channel$/, 'to_respond'],
    ['mail', 'Renewal thread', /^Follow up in Renewal thread$/, 'to_respond'],
    ['page', 'Q3 brief', /^Review Q3 brief$/, 'to_review'],
    ['markdown', 'Notes', /^Review Notes$/, 'to_review'],
    ['table', 'Leads', /^Update Leads$/, 'to_do'],
    ['webview', 'Pricing page', /^Check Pricing page$/, 'to_review'],
    ['agent', 'Nightly sync', /^Check on Nightly sync$/, 'to_review'],
    ['mindmap', 'Launch map', /^Work through Launch map$/, 'to_do'],
    ['calendar', 'Team sync', /^Schedule Team sync$/, 'to_meet'],
    ['gizmo', 'Whatsit', /^Attend to Whatsit$/, 'to_do'] // unknown kind
  ]
  it.each(cases)('%s → %s', (kind, title, titleRe, cls) => {
    const p = presetForWidget(kind, title)
    expect(p.text).toMatch(titleRe)
    expect(p.intentClass).toBe(cls)
  })

  it('a sticky IS its text — marking must not rename the thought', () => {
    const p = presetForWidget('sticky', '', 'call the notary before Friday')
    expect(p.text).toBe('call the notary before Friday')
    expect(p.intentClass).toBe('to_remember')
  })

  it('every preset names a REAL intent class', () => {
    for (const [kind, title] of cases.map(([k, t]) => [k, t] as const)) {
      expect(CLASSES).toContain(presetForWidget(kind, title).intentClass)
    }
    expect(CLASSES).toContain(presetForDesk('X').intentClass)
    expect(CLASSES).toContain(presetForMulti(3).intentClass)
  })

  it('long titles are trimmed so a queue row stays readable', () => {
    const p = presetForWidget('table', 'x'.repeat(200))
    expect(p.text.length).toBeLessThanOrEqual(70)
    expect(p.text.endsWith('…')).toBe(true)
  })

  it('an untitled, textless object still yields something sayable', () => {
    expect(presetForWidget('note', '').text).toBe('Review this')
    expect(presetForWidget('gizmo', '   ').text).toBe('Attend to this')
  })
})

describe('desk + multi marking', () => {
  it('a desk mark is an ITEM that references the desk (never a plan, never a feeder)', () => {
    expect(presetForDesk('Cetra Partners')).toEqual({
      text: 'Attend to Cetra Partners',
      intentClass: 'to_do'
    })
    expect(presetForDesk('').text).toBe('Attend to this desk')
  })

  it('marking several objects yields ONE item naming the count', () => {
    expect(presetForMulti(4).text).toBe('Attend to 4 items')
    expect(presetForMulti(4, 'Meeting Prep').text).toBe('Attend to 4 items on Meeting Prep')
  })
})
