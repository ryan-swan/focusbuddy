// Pure align + distribute maths for the Draw canvas, kept out of the React Flow
// editor so it can be unit-tested without the whole editor tree. Each function
// returns new x/y for the moved boxes keyed by id.

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

export interface NodeBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

// Align the selected boxes to a shared edge of their combined bounding box.
export function alignBoxes(boxes: NodeBox[], edge: AlignEdge): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (boxes.length < 2) return out
  const minX = Math.min(...boxes.map((b) => b.x))
  const maxR = Math.max(...boxes.map((b) => b.x + b.w))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxB = Math.max(...boxes.map((b) => b.y + b.h))
  const cx = (minX + maxR) / 2
  const cy = (minY + maxB) / 2
  for (const b of boxes) {
    let { x, y } = b
    if (edge === 'left') x = minX
    else if (edge === 'right') x = maxR - b.w
    else if (edge === 'hcenter') x = cx - b.w / 2
    else if (edge === 'top') y = minY
    else if (edge === 'bottom') y = maxB - b.h
    else if (edge === 'vcenter') y = cy - b.h / 2
    out.set(b.id, { x: Math.round(x), y: Math.round(y) })
  }
  return out
}

// Space the boxes evenly by their centres along an axis, keeping the two extremes
// fixed. Needs at least three to do anything.
export function distributeBoxes(boxes: NodeBox[], axis: 'h' | 'v'): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (boxes.length < 3) return out
  const center = (b: NodeBox): number => (axis === 'h' ? b.x + b.w / 2 : b.y + b.h / 2)
  const sorted = boxes.slice().sort((a, b) => center(a) - center(b))
  const first = center(sorted[0])
  const last = center(sorted[sorted.length - 1])
  const step = (last - first) / (sorted.length - 1)
  sorted.forEach((b, i) => {
    const target = first + i * step
    if (axis === 'h') out.set(b.id, { x: Math.round(target - b.w / 2), y: Math.round(b.y) })
    else out.set(b.id, { x: Math.round(b.x), y: Math.round(target - b.h / 2) })
  })
  return out
}
