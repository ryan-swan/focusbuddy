import type { Widget } from '@shared/types'
import type { ObjectLayout } from '@shared/deskLayout'

// Per-(user, device class) Object-geometry overlay (PLX-APP-010 Phase 2, ADR-0006).
//
// The overlay is OPT-IN per Desk and device class ("customise this device's
// layout"). When off, the shipping behaviour is unchanged: geometry lives in the
// shared `widgets` base and every consumer reads it directly. When a user opts a
// Desk in, their position/size changes for eligible Objects route to their
// personal overlay instead of the shared base, and the overlay wins for them on
// reopen. Only top-level, non-section, non-pinned Objects are eligible: section
// children have no coherent per-user coordinate (four of five section layouts
// compute child positions from index, and section frames are derived, not
// stored), so they stay shared (section-owner guidance).
//
// z-order is deliberately NOT overlaid in this slice (it stays shared via the
// separate bringToFront path); only position and size are per-user here.

// The geometry fields this overlay owns when opted in. z-order is intentionally
// excluded (see module note).
export const OVERLAY_GEOMETRY_KEYS = ['x', 'y', 'width', 'height'] as const
export type OverlayGeometryKey = (typeof OVERLAY_GEOMETRY_KEYS)[number]

// A widget is eligible for the per-user overlay only if it is a free, top-level,
// non-section Object. This is the single boolean the whole feature gates on, the
// same test WidgetFrame (isChildOfSection) and SectionWidget (children filter)
// already use, plus the section-kind and pinned exclusions.
export function isOverlayEligible(w: Pick<Widget, 'parentSectionId' | 'kind' | 'pinned'>): boolean {
  return w.parentSectionId === null && w.kind !== 'section' && !w.pinned
}

// True when a patch touches any overlay-owned geometry key.
export function patchTouchesOverlayGeometry(patch: Record<string, unknown>): boolean {
  return OVERLAY_GEOMETRY_KEYS.some((k) => k in patch)
}

// Split a patch into the geometry keys the overlay owns and the remainder that
// still belongs on the shared base row.
export function splitOverlayPatch<T extends Record<string, unknown>>(
  patch: T
): { geometry: Partial<Record<OverlayGeometryKey, number>>; rest: Partial<T> } {
  const geometry: Partial<Record<OverlayGeometryKey, number>> = {}
  const rest: Partial<T> = {}
  for (const [k, v] of Object.entries(patch)) {
    if ((OVERLAY_GEOMETRY_KEYS as readonly string[]).includes(k)) {
      geometry[k as OverlayGeometryKey] = v as number
    } else {
      rest[k as keyof T] = v as T[keyof T]
    }
  }
  return { geometry, rest }
}

// Apply a saved overlay over base widgets: for each eligible widget with a saved
// entry, override its position and size (not z-order). Ineligible widgets and
// widgets without a saved entry are returned unchanged, so this is a safe no-op
// for a shared Desk. Returns a new array; never mutates the input.
export function applyOverlayGeometry(widgets: Widget[], objects: ObjectLayout[]): Widget[] {
  if (!objects.length) return widgets
  const byId = new Map(objects.map((o) => [o.objectId, o]))
  return widgets.map((w) => {
    if (!isOverlayEligible(w)) return w
    const o = byId.get(w.id)
    if (!o) return w
    return { ...w, x: o.x, y: o.y, width: o.width, height: o.height }
  })
}

// Serialize the current eligible widgets into an overlay object list. Ineligible
// widgets (section children, sections, pinned) are dropped, so a widget that was
// just adopted into a section naturally leaves the overlay, and one just ejected
// re-enters with its fresh geometry (section-owner's eject/adopt requirement,
// satisfied by always writing the full eligible set).
export function serializeOverlayObjects(widgets: Widget[]): ObjectLayout[] {
  const out: ObjectLayout[] = []
  for (const w of widgets) {
    if (!isOverlayEligible(w)) continue
    out.push({ objectId: w.id, x: w.x, y: w.y, width: w.width, height: w.height, zIndex: w.zIndex })
  }
  return out
}
