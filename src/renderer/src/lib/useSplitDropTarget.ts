import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { PaneCell, PaneSource, SplitState } from '@shared/types'
import { previewLayout, type PreviewLayout } from './splitGeometry'
import { useSplitDrag } from './focusSplitDrag'

// Headless drop-target logic for the make-room split (ported from split-mock.html).
// It owns NO rendering. Given the body element and the current split state, it
// computes the preview layout (existing panes remapped + which cells are wells),
// tracks whether the pointer is inside the body and which cell it is over, and
// registers the drop resolver so a release lands the source.
//
// Hit-testing reads the REAL rendered cell rects by [data-split-cell] (SplitGrid
// tags each pane/well cell), so the target the user sees IS the target that
// commits — exactly like the mock's `document.querySelector('[data-well]')`.
//
// CRITICAL (fixes the 2→3→4 stale-resolver bug): the resolver and hit-test read
// LIVE state through refs, not captured closure values. When the first drop
// commits, `splitEngaged` flips true and WidgetFocusMode re-keys its focus card
// (widget.id → 'split'), which remounts the body subtree mid-gesture. A resolver
// that captured `drag.source`/`preview` by closure went stale across that remount
// — it fired with `source:null` and silently dropped the 2nd/3rd/4th pane. Reading
// through refs (updated every render, registered ONCE) makes the resolver immune
// to the remount, so every drop from 1→2→3→4 lands. This is the mock's model: the
// mock's onUp reads the live `drag` variable, never a stale copy.

// How far outside the body still counts as "inside" — so you needn't be
// pixel-accurate to trigger the reflow / drop.
const BODY_INFLATE = 40

interface DropTarget {
  // Is a drag active AND the pointer within the (inflated) body region? This is
  // what triggers the make-room reflow.
  insideBody: boolean
  // Which cell is under the pointer (a well cell, or an occupied pane cell), or null.
  hoveredCell: PaneCell | null
  // The previewed layout to render while dragging (panes remapped + well cells).
  preview: PreviewLayout
}

export function useSplitDropTarget(
  bodyRef: RefObject<HTMLElement | null>,
  state: SplitState,
  onDrop: (source: PaneSource, cell: PaneCell) => void
): DropTarget {
  const { drag, setDropResolver } = useSplitDrag()
  const [insideBody, setInsideBody] = useState(false)
  const [hoveredCell, setHoveredCell] = useState<PaneCell | null>(null)
  // Which side the pointer is toward (only the 1→2 halves split is directional).
  const [side, setSide] = useState<'left' | 'right'>('right')

  // The preview is pure geometry — recompute on panes/shape AND the drag side so
  // the halves split opens the well on the side you drag toward.
  const preview = useMemo(() => previewLayout(state, side), [state, side])

  // LIVE refs the resolver reads at release time. Updated every render so the
  // resolver — registered once below — always sees the current drag source,
  // preview, and onDrop, never a closure snapshot orphaned by the body remount.
  const previewRef = useRef(preview)
  previewRef.current = preview
  const dragSourceRef = useRef<PaneSource | null>(drag.source)
  dragSourceRef.current = drag.source
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  // Hit-test the pointer against the body + the rendered cell rects.
  useEffect(() => {
    if (!drag.active) {
      setInsideBody(false)
      setHoveredCell(null)
      return
    }
    const body = bodyRef.current
    if (!body) return

    const bodyRect = body.getBoundingClientRect()
    const inBody =
      drag.x >= bodyRect.left - BODY_INFLATE &&
      drag.x <= bodyRect.right + BODY_INFLATE &&
      drag.y >= bodyRect.top - BODY_INFLATE &&
      drag.y <= bodyRect.bottom + BODY_INFLATE
    setInsideBody(inBody)

    // Update the drag side from which half of the body the pointer is in. This
    // drives the directional 1→2 split (existing pane slides opposite, well opens
    // toward the drag). A small hysteresis-free midpoint split is fine here.
    if (inBody) {
      setSide(drag.x > bodyRect.left + bodyRect.width / 2 ? 'right' : 'left')
    }

    if (!inBody) {
      setHoveredCell(null)
      return
    }

    // Which cell rect is under the pointer? Read the real DOM rects the grid
    // rendered for this preview shape (wells + occupied panes are both valid
    // targets; a drop on an occupied pane routes to the canonical incoming cell
    // via the store, so we still report the cell honestly).
    const cell = cellUnderPoint(body, drag.x, drag.y)
    setHoveredCell(cell)
  }, [drag.active, drag.x, drag.y, bodyRef, preview])

  // Register the resolver ONCE (not per drag) — it reads live refs, so it never
  // goes stale even when the body remounts mid-gesture on the first commit.
  useEffect(() => {
    setDropResolver((x, y) => {
      const body = bodyRef.current
      const source = dragSourceRef.current
      if (!body || !source) return
      const cell = cellUnderPoint(body, x, y)
      // Prefer the cell under the pointer; if released over an occupied pane (or
      // ambiguous), fall back to the first well so a drop inside the body always
      // lands somewhere sensible rather than being lost.
      const target = cell ?? previewRef.current.wells[0] ?? null
      if (target) onDropRef.current(source, target)
    })
    return () => setDropResolver(null)
  }, [bodyRef, setDropResolver])

  return { insideBody, hoveredCell, preview }
}

// Find the split cell whose rendered rect contains (x,y). Reads elements tagged
// data-split-cell="<PaneCell>" by SplitGrid. Returns the innermost match.
function cellUnderPoint(body: HTMLElement, x: number, y: number): PaneCell | null {
  const cells = body.querySelectorAll<HTMLElement>('[data-split-cell]')
  for (const el of Array.from(cells)) {
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return (el.dataset.splitCell as PaneCell) ?? null
    }
  }
  return null
}
