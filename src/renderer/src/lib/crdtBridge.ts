import type { Widget } from '@shared/types'

// WS01 sync substrate — the seam between the widgets store and the sync engine.
//
// The store must tell the engine "this widget's geometry/membership just changed
// locally" without importing the engine (which imports the store), so this tiny
// registry breaks the cycle. The engine registers its implementation at init, and
// only when the fb.sync.crdt.widgets flag is on; until then every call here is a
// no-op and the store behaves exactly as before.

export interface CrdtEmit {
  geom: (w: Widget) => void
  membership: (widgetId: string, from: string | null, to: string | null) => void
  nodeTitle: (nodeId: string, title: string) => void
  nodeParent: (nodeId: string, parentId: string | null) => void
}

let impl: CrdtEmit | null = null

export function registerCrdtEmit(e: CrdtEmit | null): void {
  impl = e
}

export function crdtEmitGeom(w: Widget): void {
  impl?.geom(w)
}

export function crdtEmitMembership(widgetId: string, from: string | null, to: string | null): void {
  impl?.membership(widgetId, from, to)
}

export function crdtEmitNodeTitle(nodeId: string, title: string): void {
  impl?.nodeTitle(nodeId, title)
}

export function crdtEmitNodeParent(nodeId: string, parentId: string | null): void {
  impl?.nodeParent(nodeId, parentId)
}
