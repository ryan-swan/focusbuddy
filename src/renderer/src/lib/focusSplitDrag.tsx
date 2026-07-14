import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { PaneSource } from '@shared/types'

// Pointer-based drag context for the split view (spec §6.1). A dock tile starts a
// drag carrying a PaneSource; the view region's SplitDropZones reads the live
// pointer position to hit-test ghost cells; drop reports the chosen cell.
//
// Why pointer events (not HTML5 DnD): the app's Canvas already uses
// setPointerCapture for dragging, the ghost/zone overlay stays in-app (no OS
// drag image), and it works uniformly over the focus overlay + webview panes.

export interface SplitDragState {
  active: boolean
  source: PaneSource | null
  // Live pointer position in viewport coords (for the floating ghost + hit-test).
  x: number
  y: number
  // A short human label for the floating ghost (e.g. widget title / "AI Chat").
  label: string
}

interface SplitDragApi {
  drag: SplitDragState
  // Begin a *potential* drag from a dock tile. Movement past a small threshold
  // promotes it to active (so a plain click still selects the tile, not drags).
  beginDrag: (e: React.PointerEvent, source: PaneSource, label: string) => void
  // Register a drop handler for the current drag session (SplitDropZones sets
  // this so beginDrag's pointerup can consult the hovered zone). Returns cleanup.
  setDropResolver: (fn: DropResolver | null) => void
}

// Given the release position, returns the drop outcome (which cell, or null to
// cancel). SplitDropZones owns the geometry, so it provides this.
export type DropResolver = (x: number, y: number) => void

const SplitDragContext = createContext<SplitDragApi | null>(null)

// Movement (px) before a press becomes a drag. Below this, it's a click.
const DRAG_THRESHOLD = 6

export function SplitDragProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [drag, setDrag] = useState<SplitDragState>({
    active: false,
    source: null,
    x: 0,
    y: 0,
    label: ''
  })
  const dropResolver = useRef<DropResolver | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag

  const setDropResolver = useCallback((fn: DropResolver | null) => {
    dropResolver.current = fn
  }, [])

  const beginDrag = useCallback((e: React.PointerEvent, source: PaneSource, label: string) => {
    // Only left button.
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let promoted = false

    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!promoted) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        promoted = true
        setDrag({ active: true, source, x: ev.clientX, y: ev.clientY, label })
      } else {
        setDrag((d) => ({ ...d, x: ev.clientX, y: ev.clientY }))
      }
    }

    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (promoted && dropResolver.current) {
        // Let the zone overlay decide where (if anywhere) this lands.
        dropResolver.current(ev.clientX, ev.clientY)
      }
      setDrag({ active: false, source: null, x: 0, y: 0, label: '' })
    }

    const onCancel = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setDrag({ active: false, source: null, x: 0, y: 0, label: '' })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }, [])

  return (
    <SplitDragContext.Provider value={{ drag, beginDrag, setDropResolver }}>
      {children}
    </SplitDragContext.Provider>
  )
}

export function useSplitDrag(): SplitDragApi {
  const ctx = useContext(SplitDragContext)
  if (!ctx) {
    // A no-op fallback so a dock rendered outside the provider (e.g. a unit test)
    // doesn't crash — drag simply does nothing there.
    return {
      drag: { active: false, source: null, x: 0, y: 0, label: '' },
      beginDrag: () => {},
      setDropResolver: () => {}
    }
  }
  return ctx
}
