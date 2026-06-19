// Pure geometry for aligning + distributing a multi-selection of widgets.
// Returns a map of widget id -> the position fields to change (only the axis
// that moves), so the caller can apply them in one batched undo. Integer
// coordinates throughout, matching the canvas convention.

export interface Box {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type AlignMode = 'left' | 'right' | 'center-h' | 'top' | 'bottom' | 'center-v'
export type DistributeAxis = 'horizontal' | 'vertical'

// Align every box to the selection's shared edge / centre line. Needs >= 2.
export function computeAlign(boxes: Box[], mode: AlignMode): Record<string, { x?: number; y?: number }> {
  const out: Record<string, { x?: number; y?: number }> = {}
  if (boxes.length < 2) return out
  const minX = Math.min(...boxes.map((b) => b.x))
  const maxR = Math.max(...boxes.map((b) => b.x + b.width))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxB = Math.max(...boxes.map((b) => b.y + b.height))
  const cx = (minX + maxR) / 2
  const cy = (minY + maxB) / 2
  for (const b of boxes) {
    switch (mode) {
      case 'left':
        out[b.id] = { x: Math.round(minX) }
        break
      case 'right':
        out[b.id] = { x: Math.round(maxR - b.width) }
        break
      case 'center-h':
        out[b.id] = { x: Math.round(cx - b.width / 2) }
        break
      case 'top':
        out[b.id] = { y: Math.round(minY) }
        break
      case 'bottom':
        out[b.id] = { y: Math.round(maxB - b.height) }
        break
      case 'center-v':
        out[b.id] = { y: Math.round(cy - b.height / 2) }
        break
    }
  }
  return out
}

// Distribute boxes so the GAPS between consecutive boxes are equal along the
// axis. The two extreme boxes stay put; the middles are spaced evenly. Needs
// >= 3 (with 2 there's nothing to distribute).
export function computeDistribute(
  boxes: Box[],
  axis: DistributeAxis
): Record<string, { x?: number; y?: number }> {
  const out: Record<string, { x?: number; y?: number }> = {}
  if (boxes.length < 3) return out
  if (axis === 'horizontal') {
    const sorted = [...boxes].sort((a, b) => a.x - b.x)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.x + last.width - first.x
    const totalW = sorted.reduce((s, b) => s + b.width, 0)
    const gap = (span - totalW) / (sorted.length - 1)
    let cursor = first.x
    for (const b of sorted) {
      out[b.id] = { x: Math.round(cursor) }
      cursor += b.width + gap
    }
    out[last.id] = { x: Math.round(last.x) } // pin the extreme against rounding drift
  } else {
    const sorted = [...boxes].sort((a, b) => a.y - b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last.y + last.height - first.y
    const totalH = sorted.reduce((s, b) => s + b.height, 0)
    const gap = (span - totalH) / (sorted.length - 1)
    let cursor = first.y
    for (const b of sorted) {
      out[b.id] = { y: Math.round(cursor) }
      cursor += b.height + gap
    }
    out[last.id] = { y: Math.round(last.y) }
  }
  return out
}
