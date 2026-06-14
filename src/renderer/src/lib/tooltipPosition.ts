// Pure tooltip placement math, split out from the Tooltip component so the
// flip + clamp behaviour is unit-testable without a DOM. Given the trigger's
// rect, the tip's measured size, and the viewport, it returns the fixed
// top/left for the tip: it flips to the opposite side when the preferred side
// would overflow, then clamps into the viewport with an 8px margin.

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface Rect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

const MARGIN = 8

export function computeTooltipPosition(
  anchor: Rect,
  tip: Size,
  viewport: Size,
  placement: TooltipPlacement,
  gap: number
): { top: number; left: number } {
  const cx = anchor.left + anchor.width / 2
  const cy = anchor.top + anchor.height / 2

  // Flip to the opposite side when the preferred side has no room but the other
  // side does. Only vertical/horizontal pairs flip into each other.
  let p = placement
  const fitsBelow = anchor.bottom + gap + tip.height <= viewport.height
  const fitsAbove = anchor.top - gap - tip.height >= 0
  const fitsRight = anchor.right + gap + tip.width <= viewport.width
  const fitsLeft = anchor.left - gap - tip.width >= 0
  if (p === 'bottom' && !fitsBelow && fitsAbove) p = 'top'
  else if (p === 'top' && !fitsAbove && fitsBelow) p = 'bottom'
  else if (p === 'right' && !fitsRight && fitsLeft) p = 'left'
  else if (p === 'left' && !fitsLeft && fitsRight) p = 'right'

  let top: number
  let left: number
  switch (p) {
    case 'top':
      top = anchor.top - gap - tip.height
      left = cx - tip.width / 2
      break
    case 'right':
      top = cy - tip.height / 2
      left = anchor.right + gap
      break
    case 'left':
      top = cy - tip.height / 2
      left = anchor.left - gap - tip.width
      break
    case 'bottom':
    default:
      top = anchor.bottom + gap
      left = cx - tip.width / 2
      break
  }

  // Clamp into the viewport so an edge trigger never pushes the tip off-screen.
  left = Math.max(MARGIN, Math.min(left, viewport.width - tip.width - MARGIN))
  top = Math.max(MARGIN, Math.min(top, viewport.height - tip.height - MARGIN))
  return { top, left }
}
