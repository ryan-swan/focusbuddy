// Off-viewport Object virtualisation for the spatial Canvas (PLX-APP-012).
//
// The Canvas mounts every Object as a live DOM subtree inside a single pan/zoom
// transformed container. On a Desk with hundreds of Objects that is hundreds of
// React subtrees, some of them <webview> host processes, so Desk-open and pan
// cost grow with the total Object count. This module computes which top-level
// Objects actually need to be mounted for the current camera, so the render loop
// can skip the ones lying fully outside the viewport. Desk-open latency
// (PLX-PERF-001) then tracks how many Objects are visible, not how many exist on
// the Desk.
//
// The maths are pure (no DOM, no store) so they are unit-testable under the node
// test runner despite the better-sqlite3 ABI split. Invariants this honours, per
// the canvas-camera-owner and widget-link-owner advisories:
//
//   - Never cull a link endpoint, the armed link source, the active/focused
//     Object, a selected or mid-drag Object, or a stateful web-kind Object. The
//     caller passes those ids in `exemptIds`; geometry is not consulted for them.
//   - Hysteresis. An Object mounts at the inner margin but only unmounts once it
//     clears the larger outer margin, so an Object hovering the viewport edge
//     during a slow pan does not mount/unmount every frame.
//   - Animation freeze. While the camera is animating, nothing currently visible
//     is unmounted (an Object sliding out of view must stay mounted for the whole
//     transition); only new arrivals mount. The caller passes `freezeUnmounts`.

const EMPTY: ReadonlySet<string> = new Set<string>()

export interface VirtualizationBox {
  id: string
  // World-space (un-scaled canvas units) bounding box of the Object.
  x: number
  y: number
  width: number
  height: number
}

export interface VirtualizationCamera {
  panX: number
  panY: number
  zoom: number
  // Canvas container size in screen pixels.
  viewportWidth: number
  viewportHeight: number
}

export interface VirtualizationOptions {
  // Ids that must never be culled regardless of geometry.
  exemptIds?: ReadonlySet<string>
  // The ids visible on the previous frame, for hysteresis and the freeze rule.
  previousVisible?: ReadonlySet<string>
  // While true (camera mid-animation) no currently-visible Object is unmounted.
  freezeUnmounts?: boolean
  // A tiny, high-churn exempt list (typically the currently-dragged Object and
  // its parent section) checked directly rather than merged into `exemptIds`, so
  // a value that changes every drag frame never forces the big exempt Set to be
  // rebuilt or copied. Expected length 0-2, so a linear scan is effectively O(1).
  extraExemptIds?: readonly string[]
  // Inner (mount) and outer (unmount) screen-space margins, in px.
  marginIn?: number
  marginOut?: number
}

// Screen-space margins. A fixed screen buffer (not world units) gives a
// predictable pop-in distance across the whole zoom range; the outer margin is
// larger than the inner so the mount/unmount thresholds never coincide.
export const DEFAULT_MARGIN_IN = 300
export const DEFAULT_MARGIN_OUT = 600

// Does the Object's box, projected to screen space, fall within the viewport
// expanded by `margin` px on every side?
function intersectsViewport(
  box: VirtualizationBox,
  cam: VirtualizationCamera,
  margin: number
): boolean {
  const left = box.x * cam.zoom + cam.panX
  const top = box.y * cam.zoom + cam.panY
  const right = (box.x + box.width) * cam.zoom + cam.panX
  const bottom = (box.y + box.height) * cam.zoom + cam.panY
  return (
    right >= -margin &&
    bottom >= -margin &&
    left <= cam.viewportWidth + margin &&
    top <= cam.viewportHeight + margin
  )
}

// Given every top-level Object's world box and the current camera, return the
// set of Object ids that should be mounted this frame.
export function computeVisibleObjectIds(
  boxes: readonly VirtualizationBox[],
  cam: VirtualizationCamera,
  opts: VirtualizationOptions = {}
): Set<string> {
  const exempt = opts.exemptIds ?? EMPTY
  const extra = opts.extraExemptIds
  const prev = opts.previousVisible ?? EMPTY
  const marginIn = opts.marginIn ?? DEFAULT_MARGIN_IN
  // Guard against a caller passing an outer margin smaller than the inner one,
  // which would invert the hysteresis.
  const marginOut = Math.max(opts.marginOut ?? DEFAULT_MARGIN_OUT, marginIn)
  const visible = new Set<string>()
  for (const box of boxes) {
    if (exempt.has(box.id) || (extra !== undefined && extra.includes(box.id))) {
      visible.add(box.id)
      continue
    }
    const wasVisible = prev.has(box.id)
    if (wasVisible && opts.freezeUnmounts) {
      // Never unmount an Object mid-animation.
      visible.add(box.id)
      continue
    }
    // Hysteresis: a visible Object only leaves once it clears the outer margin;
    // a hidden Object only enters at the inner margin.
    const margin = wasVisible ? marginOut : marginIn
    if (intersectsViewport(box, cam, margin)) visible.add(box.id)
  }
  return visible
}
