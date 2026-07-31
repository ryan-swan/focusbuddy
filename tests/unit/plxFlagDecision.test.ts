import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flagAsDecision } from '../../src/renderer/src/lib/contextMenu/actions'
import { useActionHistory } from '../../src/renderer/src/stores/actionHistory'
import type { MenuContext } from '../../src/renderer/src/lib/contextMenu/types'

// Decision-creation entry point (spec §37). "Flag as a decision" on a widget must
// create a human-owned Decision referencing the widget AND its desk (so both the
// widget frame and the desk decisions-at-risk see it), show a confirmation toast,
// and be undoable by cancelling the Decision.

function ctxFor(widget: { id: string; kind: string; title: string | null }, taskId: string): MenuContext {
  return {
    object: { type: 'widget', widget: widget as never },
    taskId,
    canvasPoint: { x: 0, y: 0 },
    clientPoint: { x: 0, y: 0 }
  } as MenuContext
}

describe('plx_dom_040 — flag a widget as a decision', () => {
  const create = vi.fn(async () => ({ id: 'd1' }))
  const cancel = vi.fn(async () => true)

  beforeEach(() => {
    create.mockClear()
    cancel.mockClear()
    ;(window as unknown as { api: unknown }).api = { decisions: { create, cancel } }
    useActionHistory.setState({ past: [], future: [], toast: null } as never)
  })

  it('test_plx_dom_040_flag_creates_decision_referencing_widget_and_desk', async () => {
    await flagAsDecision(ctxFor({ id: 'w1', kind: 'sticky', title: 'Q3 pricing' }, 'desk-1'))
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      title: 'Q3 pricing',
      relatedObjectIds: ['w1', 'desk-1'],
      affectedDeskIds: ['desk-1']
    })
    // Confirmation toast recorded.
    expect(useActionHistory.getState().toast?.label).toBe('Flagged as a decision')
  })

  it('test_plx_dom_040_untitled_widget_gets_a_sensible_decision_title', async () => {
    await flagAsDecision(ctxFor({ id: 'w2', kind: 'markdown', title: null }, 'desk-1'))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decision on markdown' }))
  })

  it('test_plx_dom_040_flag_is_undoable_by_cancelling_the_decision', async () => {
    await flagAsDecision(ctxFor({ id: 'w1', kind: 'sticky', title: 'Vendor choice' }, 'desk-1'))
    // Undo (the toast's Undo / Cmd-Z) cancels the created Decision.
    await useActionHistory.getState().undo()
    expect(cancel).toHaveBeenCalledWith('d1')
  })
})
