import { describe, it, expect } from 'vitest'
import { resolvePushFromAnchor, type Placeable } from '../../src/renderer/src/lib/sectionGeometry'

// Drag priority: the moved widget (anchor) stays put; overlapping neighbours
// flow out of its way and never end up overlapping the anchor, a blocker, or
// each other. These tests pin that geometry, which the desk drop relies on.

const GAP = 14
type Rect = { x: number; y: number; width: number; height: number }
const overlaps = (a: Rect, b: Rect): boolean =>
  !(a.x + a.width + GAP <= b.x || a.x >= b.x + b.width + GAP || a.y + a.height + GAP <= b.y || a.y >= b.y + b.height + GAP)
const finalRect = (p: Placeable, moved: Map<string, { x: number; y: number }>): Rect => {
  const m = moved.get(p.id)
  return { x: m ? m.x : p.x, y: m ? m.y : p.y, width: p.width, height: p.height }
}

describe('resolvePushFromAnchor', () => {
  it('leaves a non-overlapping neighbour exactly where it is', () => {
    const anchor = { x: 0, y: 0, width: 200, height: 200 }
    const n: Placeable = { id: 'n', x: 500, y: 0, width: 200, height: 200 }
    const moved = resolvePushFromAnchor(anchor, [n])
    expect(moved.has('n')).toBe(false)
  })

  it('pushes an overlapping neighbour off the anchor', () => {
    const anchor = { x: 100, y: 100, width: 200, height: 200 }
    const n: Placeable = { id: 'n', x: 150, y: 150, width: 200, height: 200 }
    const moved = resolvePushFromAnchor(anchor, [n])
    expect(moved.has('n')).toBe(true)
    expect(overlaps(finalRect(n, moved), anchor)).toBe(false)
  })

  it('never moves the anchor and resolves a cascade with no residual overlaps', () => {
    const anchor = { x: 0, y: 0, width: 300, height: 300 }
    const a: Placeable = { id: 'a', x: 40, y: 40, width: 300, height: 300 } // overlaps anchor
    const b: Placeable = { id: 'b', x: 360, y: 40, width: 300, height: 300 } // in the way a would be pushed to
    const moved = resolvePushFromAnchor(anchor, [a, b])
    const rects = [
      { id: 'anchor', ...anchor },
      { id: 'a', ...finalRect(a, moved) },
      { id: 'b', ...finalRect(b, moved) }
    ]
    // Anchor is fixed at origin.
    expect(rects[0].x).toBe(0)
    expect(rects[0].y).toBe(0)
    // No pair overlaps after resolution.
    for (let i = 0; i < rects.length; i++) {
      for (let k = i + 1; k < rects.length; k++) {
        expect(overlaps(rects[i], rects[k])).toBe(false)
      }
    }
  })

  it('slides an overlapping neighbour horizontally, keeping its row (N4 move-boss)', () => {
    const anchor = { x: 100, y: 100, width: 200, height: 200 }
    const n: Placeable = { id: 'n', x: 140, y: 120, width: 200, height: 200 }
    const moved = resolvePushFromAnchor(anchor, [n]) // default axis: 'horizontal'
    const nr = finalRect(n, moved)
    expect(nr.y).toBe(120) // same row — moved sideways, not up/down
    expect(overlaps(nr, anchor)).toBe(false)
    expect(nr.x).toBeGreaterThanOrEqual(anchor.x + anchor.width) // pushed to the right
  })

  it('treats blockers as immovable and routes pushed widgets around them', () => {
    const anchor = { x: 0, y: 0, width: 200, height: 200 }
    const blocker = { x: 260, y: 0, width: 200, height: 600 } // wall to the right
    const n: Placeable = { id: 'n', x: 30, y: 30, width: 200, height: 200 }
    const moved = resolvePushFromAnchor(anchor, [n], [blocker])
    const nr = finalRect(n, moved)
    expect(overlaps(nr, anchor)).toBe(false)
    expect(overlaps(nr, blocker)).toBe(false)
  })
})
