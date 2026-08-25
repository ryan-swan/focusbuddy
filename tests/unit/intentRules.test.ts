import { describe, it, expect } from 'vitest'
import {
  classifyByRules,
  scanDeadline,
  needsDeadlineClarification,
  titleFromCapture,
  isActionableClass,
  Q1_CONFIDENCE_THRESHOLD
} from '../../src/main/ai/intentRules'

// Attention S5 — the deterministic classifier rules (R011's fast path: these
// captures never pay model latency) and DEC-016's Q1 machinery. Includes the
// synthesis's deterministic scenarios (analysis/20 Δ12) at the rules level.

const NOW = new Date('2026-08-25T10:00:00') // a Tuesday

describe('hard triggers — every class, deterministically', () => {
  const cases: Array<[string, string]> = [
    ['Remind me to call Bob about the lease', 'action'],
    ['need to send the invoice today', 'action'],
    ["don't forget the standup notes", 'action'],
    ['todo: fix the login flow', 'action'],
    ['Can you review the pricing doc before Thursday?', 'review'],
    ['Need your sign-off on the proposal', 'review'],
    ['Schedule a 30-min sync Thursday afternoon', 'scheduling'],
    ['book time with the design team next week', 'scheduling'],
    ['fyi: the vendor moved the deadline', 'fyi'],
    ['Note to self: the API key rotates monthly', 'fyi'],
    ['Just confirming you got the contract', 'acknowledgment'],
    ['Bring up at next 1:1 — the hiring plan', 'discussion'],
    ["Let's discuss the rebrand direction", 'discussion'],
    ['What is the wifi password?', 'action'] // question → needs-answer action
  ]
  it.each(cases)('"%s" → %s', (text, expected) => {
    const r = classifyByRules(text)
    expect(r?.intentClass).toBe(expected)
    expect(r?.confidence).toBeGreaterThanOrEqual(Q1_CONFIDENCE_THRESHOLD)
  })

  it('idea language files lightly — unless an explicit action verb outranks it', () => {
    // The live-QA case: an idea capture must not become a task.
    expect(classifyByRules('Flesh out LakeDash idea — DoorDash but on lakes')?.intentClass).toBe(
      'loose_thought'
    )
    expect(classifyByRules('what if we bundled the onboarding into one desk')?.intentClass).toBe(
      'loose_thought'
    )
    // An explicit commitment keeps its action routing even when it says "idea".
    expect(classifyByRules('need to flesh out the pricing idea by friday')?.intentClass).toBe(
      'action'
    )
  })

  it('short idle fragments become loose thoughts; long ambiguous prose goes to the model', () => {
    expect(classifyByRules('mountain cabin idea')?.intentClass).toBe('loose_thought')
    expect(classifyByRules('')?.intentClass).toBe('loose_thought')
    expect(
      classifyByRules(
        'The vendor conversation yesterday went in an interesting direction around pricing tiers and support'
      )
    ).toBeUndefined() // model territory
  })
})

describe('deadline scanning — resolvable anchors vs the Q1 trigger', () => {
  it('resolves weekday, tomorrow, today, next week silently', () => {
    const thu = scanDeadline('review the doc by thursday', NOW)
    expect(thu?.dueAt).toBeTruthy()
    expect(new Date(thu!.dueAt!).getDay()).toBe(4) // Thursday
    expect(new Date(thu!.dueAt!).getTime()).toBeGreaterThan(NOW.getTime())
    const tmrw = scanDeadline('send it tomorrow', NOW)
    expect(new Date(tmrw!.dueAt!).getDate()).toBe(26)
    expect(scanDeadline('finish today', NOW)?.dueAt).toBeTruthy()
    const nextWeek = scanDeadline('due next week', NOW)
    expect(new Date(nextWeek!.dueAt!).getDay()).toBe(1) // Monday
  })

  it('flags UNANCHORED deadline language for the one Q1 question', () => {
    for (const text of ['do this asap', 'need it before the launch', 'send by the deadline']) {
      const scan = scanDeadline(text, NOW)
      expect(scan, text).not.toBeNull()
      expect(scan!.dueAt, text).toBeNull()
    }
  })

  it('plain text with no deadline language scans null', () => {
    expect(scanDeadline('review the pricing doc', NOW)).toBeNull()
  })

  it('Q1 fires ONLY for unanchored deadlines on actionable classes (DEC-016)', () => {
    const unanchored = { phrase: 'asap', dueAt: null }
    const anchored = { phrase: 'by thursday', dueAt: '2026-08-27T17:00:00.000Z' }
    expect(needsDeadlineClarification('action', unanchored)).toBe(true)
    expect(needsDeadlineClarification('review', unanchored)).toBe(true)
    expect(needsDeadlineClarification('action', anchored)).toBe(false) // silent anchor
    expect(needsDeadlineClarification('fyi', unanchored)).toBe(false) // not actionable
    expect(needsDeadlineClarification('loose_thought', unanchored)).toBe(false)
    expect(needsDeadlineClarification('action', null)).toBe(false)
  })
})

describe('Δ12 scenarios at the rules level', () => {
  it('mixed-intent review with resolvable deadline files silently as review + due', () => {
    const text = "Here's the new pricing doc. Can you review it before Thursday?"
    const r = classifyByRules(text)
    const scan = scanDeadline(text, NOW)
    expect(r?.intentClass).toBe('review')
    expect(scan?.dueAt).toBeTruthy()
    expect(needsDeadlineClarification(r!.intentClass, scan)).toBe(false)
  })

  it('a scheduling hold classifies without touching the calendar machinery', () => {
    expect(classifyByRules("Let's schedule a 30-min sync Thursday afternoon")?.intentClass).toBe(
      'scheduling'
    )
  })

  it('actionable-class helper matches the DEC-016 set', () => {
    expect(isActionableClass('action')).toBe(true)
    expect(isActionableClass('review')).toBe(true)
    expect(isActionableClass('scheduling')).toBe(true)
    expect(isActionableClass('fyi')).toBe(false)
    expect(isActionableClass('direct')).toBe(false)
  })
})

describe('title extraction', () => {
  it('takes the first sentence, strips capture prefixes, caps length', () => {
    expect(titleFromCapture('fyi: the vendor moved the deadline. Also more detail here.')).toBe(
      'the vendor moved the deadline.'
    )
    expect(titleFromCapture('Remind me to call Bob')).toBe('Remind me to call Bob')
    expect(titleFromCapture('x'.repeat(200)).length).toBeLessThanOrEqual(120)
    expect(titleFromCapture('   ')).toBe('Untitled work item')
  })
})
