import { describe, it, expect } from 'vitest'
import { computeTooltipPosition, type Rect } from '../../src/renderer/src/lib/tooltipPosition'

const viewport = { width: 1000, height: 800 }
const tip = { width: 120, height: 40 }

function rect(left: number, top: number, w = 24, h = 24): Rect {
  return { left, top, right: left + w, bottom: top + h, width: w, height: h }
}

describe('computeTooltipPosition', () => {
  it('places a bottom tooltip centred under the trigger', () => {
    const r = rect(500, 100)
    const { top, left } = computeTooltipPosition(r, tip, viewport, 'bottom', 8)
    expect(top).toBe(100 + 24 + 8) // below the trigger + gap
    expect(left).toBe(512 - 60) // centre (512) minus half tip width (60)
  })

  it('flips a bottom tooltip to the top when there is no room below', () => {
    // Trigger near the bottom edge: 800 - (770+24) = 6px below, tip needs 48.
    const r = rect(500, 770)
    const { top } = computeTooltipPosition(r, tip, viewport, 'bottom', 8)
    // Flipped above: top = anchor.top - gap - tip.height = 770 - 8 - 40 = 722
    expect(top).toBe(722)
  })

  it('clamps a left-edge trigger so the tip stays on screen', () => {
    const r = rect(0, 100) // far left; centred tip would start at -48
    const { left } = computeTooltipPosition(r, tip, viewport, 'bottom', 8)
    expect(left).toBe(8) // clamped to the 8px margin
  })

  it('clamps a right-edge trigger so the tip stays on screen', () => {
    const r = rect(990, 100) // far right
    const { left } = computeTooltipPosition(r, tip, viewport, 'bottom', 8)
    expect(left).toBe(viewport.width - tip.width - 8) // 1000 - 120 - 8 = 872
  })

  it('flips a top tooltip to the bottom when there is no room above', () => {
    const r = rect(500, 4) // near top edge
    const { top } = computeTooltipPosition(r, tip, viewport, 'top', 8)
    // Flipped below: top = anchor.bottom + gap = 4 + 24 + 8 = 36
    expect(top).toBe(36)
  })
})
