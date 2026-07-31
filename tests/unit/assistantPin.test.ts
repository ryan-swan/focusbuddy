import { describe, it, expect } from 'vitest'
import {
  isPinnableWidget,
  pinFromWidget,
  shouldAutoPin,
  shouldClearPin,
  type PinnedWidgetRef
} from '../../src/renderer/src/lib/assistantPin'
import type { Widget } from '../../src/shared/types'

// The click-to-pin decision rules (Phase 3a.1), pure and store-free — the same
// pattern as lib/assistantQuestion. The hook only performs what these decide.

function widget(partial: Partial<Widget>): Widget {
  return {
    id: 'w1',
    taskId: 't1',
    kind: 'sticky',
    title: 'Widget one',
    content: 'hello',
    x: 0,
    y: 0,
    width: 200,
    height: 160,
    zIndex: 1,
    color: null,
    pinned: false,
    pinnedScreenX: null,
    pinnedScreenY: null,
    pinnedZone: null,
    parentSectionId: null,
    layout: null,
    ...partial
  } as Widget
}

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

describe('isPinnableWidget — only kinds whose content can genuinely ride the request', () => {
  it('accepts content-bearing kinds', () => {
    expect(isPinnableWidget('sticky')).toBe(true)
    expect(isPinnableWidget('note')).toBe(true)
    expect(isPinnableWidget('table')).toBe(true)
    expect(isPinnableWidget('webview')).toBe(true)
  })

  it('rejects chrome-only kinds — a pin chip must never claim content that cannot be sent', () => {
    expect(isPinnableWidget('section')).toBe(false)
  })
})

describe('pinFromWidget — the chip renders exactly what was clicked', () => {
  it('maps id, task, title, kind and thread', () => {
    const pin = pinFromWidget(widget({ id: 'w9', taskId: 't3', title: 'Q3 plan' }), 't3')
    expect(pin.widgetId).toBe('w9')
    expect(pin.taskId).toBe('t3')
    expect(pin.title).toBe('Q3 plan')
    expect(pin.kind).toBe('sticky')
    expect(pin.threadKey).toBe('t3')
    expect(pin.icon.length).toBeGreaterThan(0)
  })

  it('falls back to the catalog label when the widget is untitled', () => {
    const pin = pinFromWidget(widget({ title: '' }), 't1')
    expect(pin.title.length).toBeGreaterThan(0)
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
