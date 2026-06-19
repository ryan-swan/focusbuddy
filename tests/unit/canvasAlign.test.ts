import { describe, it, expect } from 'vitest'
import { computeAlign, computeDistribute, type Box } from '../../src/renderer/src/lib/canvasAlign'

const boxes: Box[] = [
  { id: 'a', x: 0, y: 0, width: 100, height: 50 },
  { id: 'b', x: 200, y: 100, width: 60, height: 80 },
  { id: 'c', x: 400, y: 300, width: 40, height: 40 }
]

describe('computeAlign', () => {
  it('returns nothing for < 2 boxes', () => {
    expect(computeAlign([boxes[0]], 'left')).toEqual({})
  })
  it('aligns left edges to the min x', () => {
    const r = computeAlign(boxes, 'left')
    expect(r.a.x).toBe(0)
    expect(r.b.x).toBe(0)
    expect(r.c.x).toBe(0)
  })
  it('aligns right edges to the max right', () => {
    const r = computeAlign(boxes, 'right') // maxR = 440
    expect(r.a.x).toBe(340) // 440 - 100
    expect(r.b.x).toBe(380) // 440 - 60
    expect(r.c.x).toBe(400) // 440 - 40
  })
  it('aligns top edges to the min y', () => {
    const r = computeAlign(boxes, 'top')
    expect(r.a.y).toBe(0)
    expect(r.b.y).toBe(0)
    expect(r.c.y).toBe(0)
  })
  it('centre-h centres each box on the selection mid-x', () => {
    const r = computeAlign(boxes, 'center-h') // cx = (0+440)/2 = 220
    expect(r.a.x).toBe(220 - 50) // 170
    expect(r.b.x).toBe(220 - 30) // 190
    expect(r.c.x).toBe(220 - 20) // 200
  })
  it('only touches the relevant axis', () => {
    const r = computeAlign(boxes, 'left')
    expect(r.a.y).toBeUndefined()
  })
})

describe('computeDistribute', () => {
  it('returns nothing for < 3 boxes', () => {
    expect(computeDistribute(boxes.slice(0, 2), 'horizontal')).toEqual({})
  })
  it('equalises horizontal gaps, pinning the extremes', () => {
    // span = 440 - 0 = 440; totalW = 100+60+40 = 200; gap = (440-200)/2 = 120
    const r = computeDistribute(boxes, 'horizontal')
    expect(r.a.x).toBe(0) // first stays
    expect(r.b.x).toBe(220) // 0 + 100 + 120
    expect(r.c.x).toBe(400) // last stays (220 + 60 + 120 = 400)
  })
  it('equalises vertical gaps', () => {
    // sorted by y: a(0,h50), b(100,h80), c(300,h40); span=340; totalH=170; gap=(340-170)/2=85
    const r = computeDistribute(boxes, 'vertical')
    expect(r.a.y).toBe(0)
    expect(r.b.y).toBe(135) // 0 + 50 + 85
    expect(r.c.y).toBe(300) // last pinned
  })
})
