import { describe, it, expect } from 'vitest'
import { renderAttachments } from '../../src/main/ai/chatAttachments'
import type { ChatAttachment } from '../../src/shared/types'

function att(partial: Partial<ChatAttachment>): ChatAttachment {
  return { widgetId: 'w', kind: 'browser page', title: 'T', text: 'hello', ...partial }
}

describe('renderAttachments', () => {
  it('returns empty string when there is nothing to attach', () => {
    expect(renderAttachments(undefined)).toBe('')
    expect(renderAttachments([])).toBe('')
    expect(renderAttachments([att({ text: '   ' })])).toBe('')
  })

  it('includes the schedule-event instruction and the content', () => {
    const out = renderAttachments([att({ title: 'Concert tickets', kind: 'browser page', source: 'https://tix.example', text: 'Show at 8pm on 12 Aug' })])
    expect(out).toContain("Content open on the user's canvas")
    expect(out).toContain('schedule-event')
    expect(out).toContain('Concert tickets')
    expect(out).toContain('https://tix.example')
    expect(out).toContain('Show at 8pm on 12 Aug')
  })

  it('labels each attachment with its kind and title', () => {
    const out = renderAttachments([att({ kind: 'PDF', title: 'Invoice', text: 'Due 2026-09-01' })])
    expect(out).toContain('--- PDF: "Invoice" ---')
  })

  it('caps a single attachment to the per-widget limit', () => {
    const big = 'x'.repeat(20000)
    const out = renderAttachments([att({ text: big })])
    // 8000-char per-widget cap: the rendered slice must be far under the raw size.
    const body = out.split('---').pop() ?? ''
    expect(body.length).toBeLessThan(9000)
    expect(body.length).toBeGreaterThan(7000)
  })

  it('bounds the total across many attachments', () => {
    const many = Array.from({ length: 10 }, (_, i) => att({ widgetId: `w${i}`, text: 'y'.repeat(8000) }))
    const out = renderAttachments(many)
    // 24000 total budget over 8000/each = at most ~3 attachments' worth of text.
    expect(out.length).toBeLessThan(24000 + 2000)
  })

  it('skips empty attachments but keeps non-empty ones', () => {
    const out = renderAttachments([att({ title: 'Empty', text: '' }), att({ title: 'Real', text: 'meeting 3pm' })])
    expect(out).not.toContain('Empty')
    expect(out).toContain('Real')
    expect(out).toContain('meeting 3pm')
  })
})

// The pinned primary reference (Phase 3a.1). The honesty invariant matters more
// than the feature: the prompt may claim a pin ONLY for an attachment that is
// genuinely rendered into it. An id that matches nothing (widget deleted or on
// another desk, extraction yielded nothing) must produce zero pin language.
describe('renderAttachments — pinned primary reference', () => {
  it('marks the pinned attachment block and announces it as the primary reference', () => {
    const out = renderAttachments(
      [
        att({ widgetId: 'w-pin', kind: 'document', title: 'Launch spec', text: 'The launch plan says…' }),
        att({ widgetId: 'w-other', kind: 'PDF', title: 'Invoice', text: 'Due 2026-09-01' })
      ],
      'w-pin'
    )
    expect(out).toContain('--- [PINNED · primary reference] document: "Launch spec" ---')
    expect(out).toContain('The user pinned "Launch spec" as the primary reference')
    // The marker sits on the pinned block only.
    expect(out).toContain('--- PDF: "Invoice" ---')
    expect(out).not.toContain('[PINNED · primary reference] PDF')
  })

  it('never fabricates: a pinned id matching no attachment produces no pin language', () => {
    const out = renderAttachments([att({ widgetId: 'w1', title: 'Notes', text: 'abc' })], 'w-gone')
    expect(out).not.toContain('PINNED')
    expect(out).not.toContain('primary reference')
  })

  it('never fabricates: a pinned widget whose text is empty produces no pin language', () => {
    const out = renderAttachments(
      [
        att({ widgetId: 'w-pin', title: 'Empty pin', text: '   ' }),
        att({ widgetId: 'w2', title: 'Real', text: 'content here' })
      ],
      'w-pin'
    )
    expect(out).not.toContain('PINNED')
    expect(out).not.toContain('primary reference')
  })

  it('without a pinnedWidgetId the output is byte-identical to the one-arg call', () => {
    const as = [att({ widgetId: 'w1', text: 'abc' })]
    expect(renderAttachments(as, undefined)).toBe(renderAttachments(as))
    expect(renderAttachments(as)).not.toContain('PINNED')
  })
})
