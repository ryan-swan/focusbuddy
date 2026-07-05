import { describe, it, expect } from 'vitest'
import { alignBoxes, distributeBoxes } from '../../src/renderer/src/components/documents/map/mapAlign'

type Box = { id: string; x: number; y: number; w: number; h: number }

const boxes: Box[] = [
  { id: 'a', x: 0, y: 0, w: 100, h: 40 },
  { id: 'b', x: 50, y: 100, w: 60, h: 40 },
  { id: 'c', x: 200, y: 300, w: 80, h: 40 }
]

describe('alignBoxes', () => {
  it('left aligns every box to the min x', () => {
    const m = alignBoxes(boxes, 'left')
    expect(m.get('a')!.x).toBe(0)
    expect(m.get('b')!.x).toBe(0)
    expect(m.get('c')!.x).toBe(0)
  })

  it('right aligns every box to the max right edge', () => {
    // max right = 200+80 = 280.
    const m = alignBoxes(boxes, 'right')
    expect(m.get('a')!.x).toBe(280 - 100)
    expect(m.get('b')!.x).toBe(280 - 60)
    expect(m.get('c')!.x).toBe(280 - 80)
  })

  it('hcenter centres each box on the bounding-box centre', () => {
    // bbox x: [0, 280], centre 140.
    const m = alignBoxes(boxes, 'hcenter')
    expect(m.get('a')!.x).toBe(140 - 50)
    expect(m.get('c')!.x).toBe(140 - 40)
  })

  it('top/bottom/vcenter work on the y axis', () => {
    expect(alignBoxes(boxes, 'top').get('c')!.y).toBe(0)
    // max bottom = 300+40 = 340.
    expect(alignBoxes(boxes, 'bottom').get('a')!.y).toBe(340 - 40)
    // bbox y [0,340], centre 170.
    expect(alignBoxes(boxes, 'vcenter').get('a')!.y).toBe(170 - 20)
  })

  it('does nothing with fewer than two boxes', () => {
    expect(alignBoxes([boxes[0]], 'left').size).toBe(0)
  })
})

describe('distributeBoxes', () => {
  it('spaces centres evenly along x, keeping the extremes fixed', () => {
    // centres x: a=50, b=80, c=240. After distribute: a=50, mid=145, c=240.
    const m = distributeBoxes(boxes, 'h')
    expect(m.get('a')!.x).toBe(Math.round(50 - 100 / 2))
    expect(m.get('b')!.x).toBe(Math.round(145 - 60 / 2))
    expect(m.get('c')!.x).toBe(Math.round(240 - 80 / 2))
  })

  it('needs at least three boxes', () => {
    expect(distributeBoxes(boxes.slice(0, 2), 'h').size).toBe(0)
  })
})
