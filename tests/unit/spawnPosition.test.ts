import { describe, it, expect } from 'vitest'
import type { Widget } from '@shared/types'
import { computeSpawnPosition, type SpawnGeometry } from '@renderer/lib/spawnPosition'

// Minimal widget factory — computeSpawnPosition only reads geometry plus the
// id/kind/pinned/parentSectionId/archived flags, so we cast a partial.
function w(partial: Partial<Widget> & { id: string }): Widget {
  return {
    kind: 'sticky',
    archived: false,
    pinned: false,
    parentSectionId: null,
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    ...partial
  } as unknown as Widget
}

// A viewport from (0,0) to (1000,800) in canvas space (pan 0, zoom 1).
function baseGeometry(over: Partial<SpawnGeometry> = {}): SpawnGeometry {
  return {
    newWidth: 240,
    newHeight: 200,
    activeWidgetId: null,
    widgets: [],
    panX: 0,
    panY: 0,
    zoom: 1,
    viewportWidth: 1000,
    viewportHeight: 800,
    ...over
  }
}

describe('computeSpawnPosition', () => {
  it('snaps to the right of the active widget when there is room', () => {
    const active = w({ id: 'a', x: 100, y: 120, width: 200, height: 150 })
    const pos = computeSpawnPosition(
      baseGeometry({ activeWidgetId: 'a', widgets: [active] })
    )
    // Right edge of active is 300; gap is 40; new widget starts at 340, top-aligned.
    expect(pos).toEqual({ x: 340, y: 120 })
  })

  it('falls to the left when the right slot is occupied', () => {
    const active = w({ id: 'a', x: 400, y: 120, width: 200, height: 150 })
    // A blocker sitting immediately to the right of the active widget.
    const blocker = w({ id: 'b', x: 620, y: 120, width: 200, height: 150 })
    const pos = computeSpawnPosition(
      baseGeometry({
        newWidth: 200,
        newHeight: 150,
        activeWidgetId: 'a',
        widgets: [active, blocker]
      })
    )
    // Left of active: 400 - 200 - 40 = 160, top-aligned.
    expect(pos).toEqual({ x: 160, y: 120 })
  })

  it('places near the viewport centre when there is no active widget', () => {
    const pos = computeSpawnPosition(baseGeometry({ activeWidgetId: null, widgets: [] }))
    // Centre of a 1000x800 viewport, minus half the new widget (240x200).
    expect(pos).toEqual({ x: 1000 / 2 - 120, y: 800 / 2 - 100 })
  })

  it('ignores an active widget that is panned off-screen and uses the viewport instead', () => {
    // Active widget far to the right of the visible viewport.
    const active = w({ id: 'a', x: 5000, y: 5000, width: 200, height: 150 })
    const pos = computeSpawnPosition(
      baseGeometry({ activeWidgetId: 'a', widgets: [active] })
    )
    // Should NOT snap beside the off-screen widget (which would be ~5240); it
    // should land in the current viewport instead.
    expect(pos.x).toBeLessThan(1000)
    expect(pos.y).toBeLessThan(800)
  })

  it('does not treat a pinned widget as an active spawn anchor', () => {
    const active = w({ id: 'a', x: 100, y: 120, width: 200, height: 150, pinned: true })
    const pos = computeSpawnPosition(
      baseGeometry({ activeWidgetId: 'a', widgets: [active] })
    )
    // Pinned widgets are filtered out of obstacles, so 'a' is not found as the
    // active anchor and we fall back to the viewport centre.
    expect(pos).toEqual({ x: 1000 / 2 - 120, y: 800 / 2 - 100 })
  })
})
