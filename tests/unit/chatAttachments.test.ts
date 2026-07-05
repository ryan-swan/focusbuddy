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
