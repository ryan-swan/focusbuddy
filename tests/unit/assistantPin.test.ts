import { describe, it, expect } from 'vitest'
import {
  shouldAutoPin,
  shouldClearPin,
  type PinnedWidgetRef
} from '../../src/renderer/src/lib/assistantPin'

// The canvas-click decision rules (Phase 3a.1), pure and store-free. Phase 4.3
// moved what a reference IS into lib/assistantMentions (and its own suite);
// these two rules stayed, unchanged, because they are about the GESTURE.

const OPTS = {
  panelOpen: true,
  onDeskView: true,
  focusModeShowing: false,
  followingElsewhere: false
}

describe('shouldAutoPin — a widget click becomes a pin only in the right circumstances', () => {
  it('pins on a genuine activation change while the panel is open on a desk', () => {
    expect(shouldAutoPin(null, 'w1', OPTS)).toBe(true)
    expect(shouldAutoPin('w1', 'w2', OPTS)).toBe(true)
  })

  it('does not pin when the panel is closed', () => {
    expect(shouldAutoPin(null, 'w1', { ...OPTS, panelOpen: false })).toBe(false)
  })

  it('does not pin off the desk (rooms, docs, segment screens)', () => {
    expect(shouldAutoPin(null, 'w1', { ...OPTS, onDeskView: false })).toBe(false)
  })

  it('does not pin while focus mode is showing (its own chat owns that surface)', () => {
    expect(shouldAutoPin(null, 'w1', { ...OPTS, focusModeShowing: true })).toBe(false)
  })

  it('does not pin while following a citation-pinned thread from elsewhere', () => {
    expect(shouldAutoPin(null, 'w1', { ...OPTS, followingElsewhere: true })).toBe(false)
  })

  it('does not pin when nothing changed, or on deactivation', () => {
    expect(shouldAutoPin('w1', 'w1', OPTS)).toBe(false)
    expect(shouldAutoPin('w1', null, OPTS)).toBe(false)
    expect(shouldAutoPin(null, null, OPTS)).toBe(false)
  })
})

describe('shouldClearPin — sticky until dismissed, thread switch, or the widget disappears', () => {
  const pin: PinnedWidgetRef = {
    widgetId: 'w1',
    taskId: 't1',
    title: 'Widget one',
    kind: 'sticky',
    icon: 'sticky_note_2',
    threadKey: 't1'
  }

  it('keeps the pin in the steady state (same thread, widget present)', () => {
    expect(
      shouldClearPin(pin, { threadKey: 't1', activeTaskId: 't1', widgetIds: ['w1', 'w2'], widgetsLoading: false })
    ).toBe(false)
  })

  it('clears on a thread switch', () => {
    expect(
      shouldClearPin(pin, { threadKey: 'room', activeTaskId: null, widgetIds: [], widgetsLoading: false })
    ).toBe(true)
  })

  it('clears when its own desk has loaded and the widget is gone (deleted or archived)', () => {
    expect(
      shouldClearPin(pin, { threadKey: 't1', activeTaskId: 't1', widgetIds: ['w2'], widgetsLoading: false })
    ).toBe(true)
  })

  it('does not clear while the widget list is still loading (transient empty list)', () => {
    expect(
      shouldClearPin(pin, { threadKey: 't1', activeTaskId: 't1', widgetIds: [], widgetsLoading: true })
    ).toBe(false)
  })

  it("does not clear from another desk's widget list (absence there means nothing)", () => {
    expect(
      shouldClearPin(pin, { threadKey: 't1', activeTaskId: 't-other', widgetIds: [], widgetsLoading: false })
    ).toBe(false)
  })
})
