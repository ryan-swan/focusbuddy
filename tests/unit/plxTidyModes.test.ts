import { describe, it, expect } from 'vitest'
import { tidyPositions, type TidyItem } from '../../src/renderer/src/lib/autoArrange'

// Tidy layout modes (plx-app widget-link overhaul N5): square / vertical /
// horizontal / mosaic / custom rows×cols. The caller passes items already ordered
// so linked widgets are contiguous (clustering); these tests pin the geometry per
// mode. Pure function, no DB, deterministic.

const items = (n: number, w = 100, h = 80): TidyItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `w${i}`, w, h }))

const byId = (pos: { id: string; x: number; y: number }[]): Record<string, { x: number; y: number }> =>
  Object.fromEntries(pos.map((p) => [p.id, { x: p.x, y: p.y }]))

describe('tidyPositions — vertical (single column)', () => {
  it('stacks every item in one column at the same x, increasing y', () => {
    const p = byId(tidyPositions(items(4), { mode: 'vertical' }, 2000, 40, 60))
    const xs = new Set(Object.values(p).map((v) => v.x))
    expect(xs.size).toBe(1) // one column
    expect(p.w0.y).toBeLessThan(p.w1.y)
    expect(p.w1.y).toBeLessThan(p.w2.y)
  })
})

describe('tidyPositions — horizontal (single row)', () => {
  it('places every item in one row at the same y, increasing x', () => {
    const p = byId(tidyPositions(items(4), { mode: 'horizontal' }, 2000, 40, 60))
    const ys = new Set(Object.values(p).map((v) => v.y))
    expect(ys.size).toBe(1)
    expect(p.w0.x).toBeLessThan(p.w1.x)
    expect(p.w1.x).toBeLessThan(p.w2.x)
  })
})

describe('tidyPositions — square grid', () => {
  it('lays 4 items into a 2×2 grid', () => {
    const p = byId(tidyPositions(items(4), { mode: 'square' }, 2000, 40, 60))
    // 2 columns → w0,w1 top row; w2,w3 bottom row.
    expect(p.w0.y).toBe(p.w1.y)
    expect(p.w2.y).toBe(p.w3.y)
    expect(p.w2.y).toBeGreaterThan(p.w0.y)
    expect(p.w0.x).toBe(p.w2.x) // column aligned
    expect(p.w1.x).toBe(p.w3.x)
  })
})

describe('tidyPositions — custom columns and rows', () => {
  it('binds to a requested column count', () => {
    const p = tidyPositions(items(6), { mode: 'custom', cols: 3 }, 2000, 40, 60)
    const cols = new Set(p.slice(0, 3).map((x) => x.x))
    expect(cols.size).toBe(3) // first three items span three columns
    // 4th item wraps under the first column.
    expect(p[3].x).toBe(p[0].x)
    expect(p[3].y).toBeGreaterThan(p[0].y)
  })
  it('derives columns from a requested row count', () => {
    // 6 items, 2 rows → 3 columns.
    const p = tidyPositions(items(6), { mode: 'custom', rows: 2 }, 2000, 40, 60)
    const distinctX = new Set(p.map((x) => x.x))
    expect(distinctX.size).toBe(3)
  })
})

describe('tidyPositions — mosaic', () => {
  it('drops each item into the shortest column so varying heights pack tightly', () => {
    // Two columns; first two items seed the columns, the third (after a taller
    // first item) lands under the shorter column.
    const mixed: TidyItem[] = [
      { id: 'a', w: 100, h: 200 },
      { id: 'b', w: 100, h: 80 },
      { id: 'c', w: 100, h: 80 }
    ]
    const p = byId(tidyPositions(mixed, { mode: 'mosaic', cols: 2 }, 2000, 40, 60))
    // a in col0, b in col1; col1 now shorter, so c stacks under b (same x as b).
    expect(p.c.x).toBe(p.b.x)
    expect(p.c.y).toBeGreaterThan(p.b.y)
  })
})

describe('tidyPositions — flow', () => {
  it('wraps into rows at the flow width', () => {
    // width 260, items 100 wide, gap 40 → 2 per row (100 + 40 + 100 = 240 < 260,
    // third would exceed).
    const p = byId(tidyPositions(items(3), { mode: 'flow' }, 260, 40, 60))
    expect(p.w0.y).toBe(p.w1.y) // first two on row 1
    expect(p.w2.y).toBeGreaterThan(p.w0.y) // third wraps
    expect(p.w2.x).toBe(p.w0.x) // back to the left edge
  })
  it('returns empty for no items', () => {
    expect(tidyPositions([], { mode: 'flow' }, 800)).toEqual([])
  })
})
