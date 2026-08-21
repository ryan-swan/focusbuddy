import { describe, expect, it } from 'vitest'
import {
  SIZE_SPAN,
  bestInsertionIndex,
  cellRect,
  packGrid,
  packedRows,
  pointerCell,
  type GridMetrics,
  type SizedInstance,
  type WidgetSize
} from '../../src/renderer/src/components/views/homeGridLayout'

const COLS = 4

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
    expect(pos.get('b')).toEqual({ col: 2, row: 0 })
    expect(pos.get('c')).toEqual({ col: 0, row: 2 })
    // The four small widgets fill the gap beside the third large one.
    expect(packedRows(items, pos)).toBe(4)
  })

  it('fills gaps left by earlier large widgets (dense packing)', () => {
    const items = [inst('big', 'lg'), inst('wide', 'md'), inst('s1', 'sm'), inst('s2', 'sm')]
    const pos = packGrid(items, COLS)
    assertValid(items, pos)
    // md lands beside lg on row 0; the sm pair fills the row-1 remainder.
    expect(pos.get('wide')).toEqual({ col: 2, row: 0 })
    expect(pos.get('s1')).toEqual({ col: 2, row: 1 })
    expect(pos.get('s2')).toEqual({ col: 3, row: 1 })
  })

  it('handles every size, in any order, without overlap', () => {
    const sizes: WidgetSize[] = ['sm', 'md', 'lg', 'stack']
    for (let seed = 0; seed < 32; seed++) {
      const items = Array.from({ length: 12 }, (_, i) => inst(`k${i}`, sizes[(i * 7 + seed) % 4]))
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
      width: 416,
      height: 384
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
    expect(packGrid(trial, COLS).get('x')).toEqual({ col: 0, row: 1 })
  })

  it('is stable at ties (earliest index wins on repeated calls)', () => {
    const dragged = inst('x', 'sm')
    const p = { x: METRICS.originX + 1, y: METRICS.originY + 1 }
    const first = bestInsertionIndex(board, dragged, p.x, p.y, METRICS)
    expect(bestInsertionIndex(board, dragged, p.x, p.y, METRICS)).toBe(first)
    expect(first).toBe(0)
  })
})
