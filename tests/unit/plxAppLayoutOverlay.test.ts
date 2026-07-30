import { describe, it, expect } from 'vitest'
import type { Widget } from '@shared/types'
import type { ObjectLayout } from '@shared/deskLayout'
import {
  isOverlayEligible,
  patchTouchesOverlayGeometry,
  splitOverlayPatch,
  applyOverlayGeometry,
  serializeOverlayObjects,
  OVERLAY_GEOMETRY_KEYS
} from '../../src/renderer/src/lib/deskLayoutOverlay'

// Per-(user, device class) object-geometry overlay pure logic (spec §21 /
// PLX-APP-010 Phase 2, ADR-0006). Only top-level, non-section, non-pinned Objects
// are eligible; the overlay owns position + size, never z-order or membership.

function w(over: Partial<Widget> = {}): Widget {
  return {
    id: 'w1', taskId: 't1', kind: 'sticky', title: '', content: '',
    x: 10, y: 20, width: 200, height: 150, zIndex: 1, color: null,
    pinned: false, pinnedScreenX: null, pinnedScreenY: null, pinnedZone: null,
    parentSectionId: null, layout: null, sourceAppId: null, mode: null,
    livingQuery: null, livingGeneratedAt: null, livingPaused: false,
    createdAt: 0, updatedAt: 0, archived: false, syncGroupId: null,
    ...over
  } as Widget
}

describe('plx_app_010 phase2 — overlay eligibility and merge', () => {
  it('test_plx_app_010_overlay_eligibility_excludes_sections_children_pinned', () => {
    expect(isOverlayEligible(w())).toBe(true)
    expect(isOverlayEligible(w({ parentSectionId: 'sec-1' }))).toBe(false) // section child
    expect(isOverlayEligible(w({ kind: 'section' }))).toBe(false) // section itself
    expect(isOverlayEligible(w({ pinned: true }))).toBe(false) // pinned
  })

  it('test_plx_app_010_overlay_splits_geometry_from_rest', () => {
    expect(patchTouchesOverlayGeometry({ x: 5 })).toBe(true)
    expect(patchTouchesOverlayGeometry({ color: 'red' })).toBe(false)
    const { geometry, rest } = splitOverlayPatch({ x: 5, y: 6, width: 100, color: 'red', parentSectionId: null })
    expect(geometry).toEqual({ x: 5, y: 6, width: 100 })
    expect(rest).toEqual({ color: 'red', parentSectionId: null })
    // z-order is not an overlay key in this slice.
    expect(OVERLAY_GEOMETRY_KEYS).not.toContain('zIndex')
    expect(splitOverlayPatch({ zIndex: 9 }).rest).toEqual({ zIndex: 9 })
  })

  it('test_plx_app_010_overlay_apply_overrides_position_size_not_zorder', () => {
    const base = [w({ id: 'a', x: 0, y: 0, width: 100, height: 100, zIndex: 3 })]
    const saved: ObjectLayout[] = [{ objectId: 'a', x: 500, y: 400, width: 250, height: 180, zIndex: 99 }]
    const [merged] = applyOverlayGeometry(base, saved)
    expect(merged.x).toBe(500)
    expect(merged.y).toBe(400)
    expect(merged.width).toBe(250)
    expect(merged.height).toBe(180)
    expect(merged.zIndex).toBe(3) // z-order stays from the shared base
  })

  it('test_plx_app_010_overlay_apply_ignores_ineligible_and_missing', () => {
    const base = [
      w({ id: 'child', parentSectionId: 'sec-1', x: 1, y: 1 }),
      w({ id: 'free-no-entry', x: 7, y: 8 })
    ]
    const saved: ObjectLayout[] = [{ objectId: 'child', x: 999, y: 999, width: 10, height: 10, zIndex: 1 }]
    const merged = applyOverlayGeometry(base, saved)
    expect(merged[0].x).toBe(1) // section child never overlaid even with a saved row
    expect(merged[1].x).toBe(7) // eligible but no saved entry -> unchanged
  })

  it('test_plx_app_010_overlay_apply_empty_is_noop_identity', () => {
    const base = [w({ id: 'a' })]
    expect(applyOverlayGeometry(base, [])).toBe(base) // same reference, cheap no-op
  })

  it('test_plx_app_010_overlay_serialize_only_eligible', () => {
    const widgets = [
      w({ id: 'free', x: 3, y: 4, width: 120, height: 90, zIndex: 2 }),
      w({ id: 'child', parentSectionId: 'sec-1' }),
      w({ id: 'sec', kind: 'section' }),
      w({ id: 'pin', pinned: true })
    ]
    const objs = serializeOverlayObjects(widgets)
    expect(objs).toEqual([{ objectId: 'free', x: 3, y: 4, width: 120, height: 90, zIndex: 2 }])
  })
})
