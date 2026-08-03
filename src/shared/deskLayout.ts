// Desk layout persistence (spec §21, REQ-UX). The platform never repositions,
// resizes or reflows user-placed Objects without explicit action, except for a
// genuine viewport change (UX-030). Layout is persisted per (user, Desk, device
// class) so one device's arrangement does not overwrite another's (UX-032), and
// Desk restoration restores the full working state (UX-031); where an Object can no
// longer be placed (deleted or permission revoked) restoration degrades gracefully
// and says so (UX-033).

export type DeviceClass = 'desktop' | 'tablet' | 'mobile'

export interface ObjectLayout {
  objectId: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}
export interface DeskLayout {
  userId: string
  deskId: string
  deviceClass: DeviceClass
  objects: ObjectLayout[]
  scroll: { x: number; y: number }
  selectedObjectIds: string[]
  zoom: number // viewport zoom level, persisted + restored (PLX-PRD-002)
  // Opt-in per-device object-geometry customisation (PLX-APP-010 Phase 2,
  // ADR-0006). When true, `objects` is authoritative for this user on this
  // device class and wins over the shared base; when false or absent, only the
  // camera + selection restore (Phase 1) and the Desk follows the shared base
  // geometry, unchanged. Gates all Phase 2 routing so the default path is never
  // affected.
  customLayout?: boolean
}

// A Desk persists its COMPLETE visual layout — object positions/sizes/z-order,
// scroll, selection and zoom — and restores it on reopen (PRD-002). This predicate
// confirms a saved layout carries every required dimension.
export function layoutIsComplete(l: DeskLayout): boolean {
  return (
    Array.isArray(l.objects) &&
    l.objects.every((o) => typeof o.x === 'number' && typeof o.y === 'number' && typeof o.width === 'number' && typeof o.height === 'number' && typeof o.zIndex === 'number') &&
    typeof l.scroll?.x === 'number' &&
    typeof l.scroll?.y === 'number' &&
    Array.isArray(l.selectedObjectIds) &&
    typeof l.zoom === 'number'
  )
}

// The per-(user, Desk, device class) key (UX-032). Two device classes never collide.
export function layoutKey(userId: string, deskId: string, deviceClass: DeviceClass): string {
  return `${userId}::${deskId}::${deviceClass}`
}

// UX-030 — a layout mutation is allowed only when the user acted or the viewport
// genuinely changed. An automated reflow with neither is refused.
export function layoutChangeAllowed(reason: 'user-action' | 'viewport-change' | 'automated'): boolean {
  return reason === 'user-action' || reason === 'viewport-change'
}
export function assertLayoutChange(reason: 'user-action' | 'viewport-change' | 'automated'): void {
  if (!layoutChangeAllowed(reason)) {
    throw new Error('The platform MUST NOT reposition user-placed Objects without explicit action (PLX-UX-030).')
  }
}

export interface RestoreResult {
  restored: ObjectLayout[]
  unrestorable: string[] // object ids that could not be placed (deleted / revoked)
  degradedGracefully: boolean
}
// UX-031 / UX-033 — restore what can be restored; report what cannot rather than
// failing or silently dropping it.
export function restoreLayout(saved: DeskLayout, canPlace: (objectId: string) => boolean): RestoreResult {
  const restored = saved.objects.filter((o) => canPlace(o.objectId))
  const unrestorable = saved.objects.filter((o) => !canPlace(o.objectId)).map((o) => o.objectId)
  return { restored, unrestorable, degradedGracefully: true }
}
