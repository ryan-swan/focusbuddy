import { describe, it, expect } from 'vitest'
import { resolvePosition } from '../../src/renderer/src/lib/floatingChrome'
import type { MenuRect } from '../../src/renderer/src/stores/overlay'

// jsdom defaults the viewport to 1024x768.
const overlaps = (a: { left: number; top: number }, w: number, h: number, o: MenuRect): boolean =>
  a.left < o.right && a.left + w > o.left && a.top < o.bottom && a.top + h > o.top

describe('resolvePosition — anti-magnetic menu placement', () => {
  it('leaves a position that overlaps nothing untouched (aside from the 8px margin clamp)', () => {
    const p = resolvePosition(100, 100, 200, 120, [])
    expect(p).toEqual({ left: 100, top: 100 })
  })

  it('clamps an off-screen position back into the viewport', () => {
    const p = resolvePosition(5000, 5000, 200, 120, [])
    expect(p.left).toBeLessThanOrEqual(1024 - 200 - 8)
    expect(p.top).toBeLessThanOrEqual(768 - 120 - 8)
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })

  it('nudges a menu off an obstacle it would overlap', () => {
    const obstacle: MenuRect = { left: 90, top: 90, right: 290, bottom: 210 }
    const p = resolvePosition(100, 100, 200, 120, [obstacle])
    expect(overlaps(p, 200, 120, obstacle)).toBe(false)
    // still on screen
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeGreaterThanOrEqual(8)
    expect(p.left + 200).toBeLessThanOrEqual(1024 - 8 + 1)
    expect(p.top + 120).toBeLessThanOrEqual(768 - 8 + 1)
  })

  it('clears two obstacles at once (settles after successive nudges)', () => {
    const a: MenuRect = { left: 0, top: 0, right: 300, bottom: 80 } // top band (breadcrumb-like)
    const b: MenuRect = { left: 0, top: 0, right: 80, bottom: 768 } // left band (sidebar-like)
    const p = resolvePosition(20, 20, 200, 120, [a, b])
    expect(overlaps(p, 200, 120, a)).toBe(false)
    expect(overlaps(p, 200, 120, b)).toBe(false)
  })
})
