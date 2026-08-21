import { describe, expect, it } from 'vitest'
import {
  SIZE_SPAN,
  bestInsertionIndex,
  cellRect,
  clampSize,
  packGrid,
  packedRows,
  pointerCell,
  sizedFromColumns,
  type GridMetrics,
  type SizedInstance,
  type WidgetSize
} from '../../src/renderer/src/components/views/homeGridLayout'
import { widgetDef } from '../../src/renderer/src/components/views/homeWidgetDefs'

// Subunit columns: 4 visual columns x the 2x2 subdivision (SUBDIV).
const COLS = 8

function inst(key: string, size: WidgetSize): SizedInstance {
  return { key, widget: 'standup', size }
}

// A board has no overlaps and no item outside the columns.
function assertValid(items: SizedInstance[], positions: Map<string, { col: number; row: number }>): void {
  const claimed = new Set<string>()
  for (const item of items) {
    const pos = positions.get(item.key)
    expect(pos, `no position for ${item.key}`).toBeTruthy()
    const span = SIZE_SPAN[item.size]
    expect(pos!.col + span.w).toBeLessThanOrEqual(COLS)
    for (let r = pos!.row; r < pos!.row + span.h; r++) {
      for (let c = pos!.col; c < pos!.col + span.w; c++) {
        const cell = `${c},${r}`
        expect(claimed.has(cell), `overlap at ${cell}`).toBe(false)
        claimed.add(cell)
      }
    }
  }
}

describe('packGrid', () => {
  it('packs the stock board (3 lg + 4 sm) into a tight 4x4', () => {
    const items = [
      inst('a', 'lg'),
      inst('b', 'lg'),
      inst('c', 'lg'),
      inst('d', 'sm'),
      inst('e', 'sm'),
      inst('f', 'sm'),
      inst('g', 'sm')
    ]
    const pos = packGrid(items, COLS)
    assertValid(items, pos)
    expect(pos.get('a')).toEqual({ col: 0, row: 0 })
    expect(pos.get('b')).toEqual({ col: 4, row: 0 })
    expect(pos.get('c')).toEqual({ col: 0, row: 4 })
    // The four small widgets fill the gap beside the third large one.
    expect(packedRows(items, pos)).toBe(8)
  })

  it('fills gaps left by earlier large widgets (dense packing)', () => {
    const items = [inst('big', 'lg'), inst('wide', 'md'), inst('s1', 'sm'), inst('s2', 'sm')]
    const pos = packGrid(items, COLS)
    assertValid(items, pos)
    // md lands beside lg on row 0; the sm pair fills the remainder below it.
    expect(pos.get('wide')).toEqual({ col: 4, row: 0 })
    expect(pos.get('s1')).toEqual({ col: 4, row: 2 })
    expect(pos.get('s2')).toEqual({ col: 6, row: 2 })
  })

  it('packs four icons into a small widget footprint (the Apple ratio)', () => {
    const items = [inst('s', 'sm'), inst('i1', 'icon'), inst('i2', 'icon'), inst('i3', 'icon'), inst('i4', 'icon')]
    const pos = packGrid(items, COLS)
    assertValid(items, pos)
    // The four icons tile the 2x2 block beside the small widget.
    expect(pos.get('i1')).toEqual({ col: 2, row: 0 })
    expect(pos.get('i2')).toEqual({ col: 3, row: 0 })
    expect(pos.get('i3')).toEqual({ col: 4, row: 0 })
    expect(pos.get('i4')).toEqual({ col: 5, row: 0 })
    expect(packedRows(items, pos)).toBe(2)
  })

  it('handles every size, in any order, without overlap', () => {
    const sizes: WidgetSize[] = ['icon', 'sm', 'md', 'lg', 'stack']
    for (let seed = 0; seed < 32; seed++) {
      const items = Array.from({ length: 12 }, (_, i) => inst(`k${i}`, sizes[(i * 7 + seed) % 5]))
      assertValid(items, packGrid(items, COLS))
    }
  })

  it('is deterministic', () => {
    const items = [inst('a', 'stack'), inst('b', 'lg'), inst('c', 'sm'), inst('d', 'md')]
    expect(packGrid(items, COLS)).toEqual(packGrid(items, COLS))
  })
})

const METRICS: GridMetrics = {
  originX: 100,
  originY: 50,
  cellW: 200,
  cellH: 184,
  gap: 16,
  cols: COLS
}

describe('cellRect / pointerCell', () => {
  it('maps positions to viewport rects with gaps', () => {
    expect(cellRect({ col: 1, row: 2 }, 'lg', METRICS)).toEqual({
      left: 100 + 216,
      top: 50 + 400,
      width: 4 * 200 + 3 * 16,
      height: 4 * 184 + 3 * 16
    })
  })

  it('round-trips: a cell rect center falls in that cell', () => {
    const r = cellRect({ col: 2, row: 1 }, 'sm', METRICS)
    expect(pointerCell(r.left + r.width / 2, r.top + r.height / 2, METRICS)).toEqual({ col: 2, row: 1 })
  })

  it('clamps outside points onto the board', () => {
    expect(pointerCell(-500, -500, METRICS)).toEqual({ col: 0, row: 0 })
    expect(pointerCell(99999, 200, METRICS).col).toBe(COLS - 1)
  })
})

describe('bestInsertionIndex', () => {
  const board = [inst('a', 'sm'), inst('b', 'sm'), inst('c', 'sm'), inst('d', 'sm')]

  function centerOfIndex(others: SizedInstance[], dragged: SizedInstance, index: number): { x: number; y: number } {
    const trial = [...others.slice(0, index), dragged, ...others.slice(index)]
    const r = cellRect(packGrid(trial, COLS).get(dragged.key)!, dragged.size, METRICS)
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  it('returns the index whose slot sits under the pointer', () => {
    const dragged = inst('x', 'sm')
    for (let target = 0; target <= board.length; target++) {
      const p = centerOfIndex(board, dragged, target)
      expect(bestInsertionIndex(board, dragged, p.x, p.y, METRICS)).toBe(target)
    }
  })

  it('keeps the placeholder where the widget will land (gap contract)', () => {
    // Point at the far end: the widget must land on the row below the four
    // small ones. Index 3 and 4 give the identical board (the displaced small
    // widget refills the row-0 gap), so assert geometry, not list position.
    const dragged = inst('x', 'lg')
    const idx = bestInsertionIndex(board, dragged, 100 + 800, 50 + 2000, METRICS)
    const trial = [...board.slice(0, idx), dragged, ...board.slice(idx)]
    expect(packGrid(trial, COLS).get('x')).toEqual({ col: 0, row: 2 })
  })

  it('is stable at ties (earliest index wins on repeated calls)', () => {
    const dragged = inst('x', 'sm')
    const p = { x: METRICS.originX + 1, y: METRICS.originY + 1 }
    const first = bestInsertionIndex(board, dragged, p.x, p.y, METRICS)
    expect(bestInsertionIndex(board, dragged, p.x, p.y, METRICS)).toBe(first)
    expect(first).toBe(0)
  })
})

describe('clampSize', () => {
  it('keeps a declared size and falls back to the default otherwise', () => {
    const agenda = widgetDef('agenda')
    expect(clampSize(agenda, 'md')).toBe('md')
    expect(clampSize(agenda, 'lg')).toBe(agenda.defaultSize)
    const navigator = widgetDef('navigator')
    expect(clampSize(navigator, 'sm')).toBe('lg')
  })

  it('every def declares its own default among its sizes', () => {
    // Guards the def table itself: a default outside sizes would make
    // clampSize recurse into nonsense.
    const ids = ['standup', 'agenda', 'pulse', 'continue', 'activity', 'overdue', 'navigator', 'pinned-desk', 'room-portal', 'quick-links', 'shortcuts', 'app-launcher', 'quick', 'create', 'focus-timer', 'one-thing', 'where-was-i', 'stalled', 'new-meeting', 'pinned-conversation', 'transcribe'] as const
    for (const id of ids) {
      const def = widgetDef(id)
      expect(def.sizes.length).toBeGreaterThan(0)
      expect(def.sizes).toContain(def.defaultSize)
    }
  })
})

describe('sizedFromColumns (v2 migration)', () => {
  it('maps main to large and rail to small, preserving order', () => {
    const out = sizedFromColumns(
      [
        { key: 'a', widget: 'standup' },
        { key: 'b', widget: 'continue' }
      ],
      [
        { key: 'c', widget: 'agenda' },
        { key: 'd', widget: 'pulse' }
      ]
    )
    expect(out.map((it) => it.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(out[0].size).toBe('lg')
    expect(out[1].size).toBe('lg')
    expect(out[2].size).toBe('sm')
    expect(out[3].size).toBe('sm')
  })

  it('clamps sizes a widget does not support', () => {
    // one-thing sat in main (would be lg) but only supports md/lg; focus-timer
    // in main clamps all the way to its only size, sm.
    const out = sizedFromColumns([{ key: 'f', widget: 'focus-timer' }], [])
    expect(out[0].size).toBe('sm')
  })
})
