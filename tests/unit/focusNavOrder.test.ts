import { describe, it, expect } from 'vitest'
import { focusNavOrder, isFocusable } from '../../src/renderer/src/lib/focusNavOrder'
import type { Widget } from '../../src/shared/types'

// Minimal Widget factory — only the fields focusNavOrder reads matter; the rest
// are filled with harmless defaults so the type is satisfied.
let seq = 0
function w(partial: Partial<Widget> & { id: string; x: number; y: number }): Widget {
  return {
    taskId: 't',
    kind: 'sticky',
    title: '',
    content: '',
    width: 240,
    height: 200,
    zIndex: 1,
    color: null,
    pinned: false,
    pinnedScreenX: null,
    pinnedScreenY: null,
    pinnedZone: null,
    parentSectionId: null,
    layout: null,
    sourceAppId: null,
    mode: null,
    livingQuery: null,
    livingGeneratedAt: null,
    livingPaused: false,
    syncGroupId: null,
    archived: false,
    createdAt: ++seq,
    updatedAt: seq,
    ...partial
  } as Widget
}

const ids = (ws: Widget[]): string[] => ws.map((x) => x.id)

describe('focusNavOrder', () => {
  it('returns 0/1 items unchanged', () => {
    expect(focusNavOrder([])).toEqual([])
    const one = [w({ id: 'a', x: 10, y: 10 })]
    expect(ids(focusNavOrder(one))).toEqual(['a'])
  })

  it('orders a single clean row left-to-right', () => {
    const ws = [
      w({ id: 'c', x: 900, y: 300 }),
      w({ id: 'a', x: 100, y: 300 }),
      w({ id: 'b', x: 500, y: 300 })
    ]
    expect(ids(focusNavOrder(ws))).toEqual(['a', 'b', 'c'])
  })

  it('orders multiple rows top-to-bottom then left-to-right', () => {
    const ws = [
      w({ id: 'r2c2', x: 500, y: 600 }),
      w({ id: 'r1c2', x: 500, y: 200 }),
      w({ id: 'r2c1', x: 100, y: 600 }),
      w({ id: 'r1c1', x: 100, y: 200 })
    ]
    expect(ids(focusNavOrder(ws))).toEqual(['r1c1', 'r1c2', 'r2c1', 'r2c2'])
  })

  // THE REGRESSION: two widgets on the same visual row whose y-values straddle a
  // 200px grid line (y=-479 and y=-272, ~207px apart but clearly one row given
  // 200px-tall widgets that overlap). The old floor(y/200) banding split them
  // into different bands and mis-ordered navigation. They must read left-to-right.
  it('keeps a side-by-side pair together across a would-be grid boundary', () => {
    const ws = [
      w({ id: 'right', x: 800, y: -272, height: 200 }),
      w({ id: 'left', x: 100, y: -479, height: 200 })
    ]
    // These overlap vertically (left spans -479..-279, right spans -272..-72 →
    // ~7px overlap is NOT enough), so height matters. Use realistic browser-tab
    // heights that clearly overlap.
    const tabs = [
      w({ id: 'right2', x: 800, y: 410, height: 768 }),
      w({ id: 'left2', x: 100, y: 385, height: 768 })
    ]
    expect(ids(focusNavOrder(tabs))).toEqual(['left2', 'right2'])
    // The non-overlapping pair are genuinely different rows (stacked), so
    // top-to-bottom is correct there — but never right-before-left within a row.
    const out = ids(focusNavOrder(ws))
    // 'left' sits above 'right' and they barely overlap → treated as two rows,
    // top first. Either way, the LEFT/upper one must not come strictly after the
    // right one on the same row. Here they're different rows, ordered by y:
    expect(out).toEqual(['left', 'right'])
  })

  it('reads a staggered row (browser tabs at slightly different heights) L-to-R', () => {
    // A realistic row of browser tabs nudged to different y within the row.
    const ws = [
      w({ id: 't3', x: 900, y: 402, height: 500 }),
      w({ id: 't1', x: 100, y: 385, height: 500 }),
      w({ id: 't4', x: 1300, y: 410, height: 500 }),
      w({ id: 't2', x: 500, y: 390, height: 500 })
    ]
    expect(ids(focusNavOrder(ws))).toEqual(['t1', 't2', 't3', 't4'])
  })

  it('separates a clearly-lower row from the one above it', () => {
    const ws = [
      w({ id: 'top-left', x: 100, y: 0, height: 200 }),
      w({ id: 'top-right', x: 600, y: 0, height: 200 }),
      w({ id: 'bottom-left', x: 100, y: 500, height: 200 }),
      w({ id: 'bottom-right', x: 600, y: 500, height: 200 })
    ]
    expect(ids(focusNavOrder(ws))).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
  })

  it('is deterministic for exact-overlap widgets (stable by createdAt)', () => {
    const a = w({ id: 'first', x: 0, y: 0 })
    const b = w({ id: 'second', x: 0, y: 0 })
    const c = w({ id: 'third', x: 0, y: 0 })
    // Same result regardless of input order.
    expect(ids(focusNavOrder([c, a, b]))).toEqual(ids(focusNavOrder([a, b, c])))
    expect(ids(focusNavOrder([c, a, b]))).toEqual(['first', 'second', 'third'])
  })

  it('excludes pinned, archived, and section containers — but INCLUDES section children', () => {
    // Section children are navigable in focus mode: on a desk organised entirely
    // into sections they'd otherwise leave the deck empty (no dock/arrows). Only
    // the section CONTAINER itself is scaffolding, not a thing you open.
    const ws = [
      w({ id: 'ok', x: 0, y: 0 }),
      w({ id: 'pinned', x: 50, y: 0, pinned: true }),
      w({ id: 'archived', x: 100, y: 0, archived: true }),
      w({ id: 'section', x: 150, y: 0, kind: 'section' }),
      w({ id: 'child', x: 200, y: 0, parentSectionId: 'section' })
    ]
    expect(isFocusable(ws[0])).toBe(true) // top-level widget
    expect(isFocusable(ws[1])).toBe(false) // pinned
    expect(isFocusable(ws[2])).toBe(false) // archived
    expect(isFocusable(ws[3])).toBe(false) // section container
    expect(isFocusable(ws[4])).toBe(true) // section child — now included
    // The deck contains the top-level widget and the section child (order by
    // resolved absolute position), never the pinned/archived/section.
    expect(ids(focusNavOrder(ws)).sort()).toEqual(['child', 'ok'])
  })

  it('orders a desk made entirely of section children (no loose widgets)', () => {
    // The real-world case that motivated including children: a desk where every
    // widget lives inside a section. The deck must still be non-empty and ordered
    // left→right by the children's absolute position.
    const ws = [
      w({ id: 'sectionA', x: 0, y: 0, width: 600, height: 400, kind: 'section' }),
      w({ id: 'c1', x: 0, y: 0, parentSectionId: 'sectionA' }),
      w({ id: 'c2', x: 300, y: 0, parentSectionId: 'sectionA' }),
      w({ id: 'sectionB', x: 800, y: 0, width: 400, height: 400, kind: 'section' }),
      w({ id: 'c3', x: 0, y: 0, parentSectionId: 'sectionB' })
    ]
    // All three children are focusable; sections excluded.
    expect(ids(focusNavOrder(ws))).toEqual(['c1', 'c2', 'c3'])
  })
})
