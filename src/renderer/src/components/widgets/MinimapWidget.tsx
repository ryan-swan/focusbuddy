import { useEffect, useMemo, useRef, useState } from 'react'
import { useWidgetStore } from '../../stores/widgets'
import { computeSectionFrame, effectiveLayout } from '../../lib/sectionGeometry'
import { useZonePosition } from '../../lib/pinLayout'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import WidgetPreview from '../WidgetPreview'
import Icon from '../Icon'

// The hover-magnifier preview popup is deprecated for now. The minimap
// thumbnails are still live previews and a click still jumps the camera to a
// widget; we just no longer pop a floating magnified card on hover. The
// Magnifier component and its sizing helper were removed with this change and
// live in git history if we want them back.

interface Props {
  widget: Widget
  inline?: boolean
}

// MinimapWidget — the canvas's bird's-eye overview, packaged as a regular
// widget. It used to be a hardcoded fixed-position element rendered by
// Canvas.tsx; promoting it to a widget kind gives it:
//   - the standard widget chrome (+/− buttons, pin picker, focus mode,
//     close, drag-to-canvas, drag-between-sections)
//   - per-task persistence via fb_widgets (each task gets its own minimap
//     widget — survives reload, follows the task across devices)
//   - a place in the widget picker so the user can re-add after deleting
//
// Auto-create lives in Canvas.tsx — on task open, if no minimap widget
// exists for the task AND localStorage 'fb-minimap-dismissed:{taskId}' is
// not set, we spawn one pinned to the BR zone. Deleting the minimap sets
// the dismissed flag so we don't recreate it on next task switch.
//
// Layout inside the widget body: SVG scales to fill the available space
// (widget body minus header). Aspect ratio is fixed at 1.5:1; we letterbox
// in whichever axis is constrained so the silhouettes stay correctly
// proportional regardless of widget resize.
export default function MinimapWidget({ widget, inline = false }: Props): JSX.Element {
  const widgets = useWidgetStore((s) => s.widgets)
  const zoom = useWidgetStore((s) => s.zoom)
  const panX = useWidgetStore((s) => s.panX)
  const panY = useWidgetStore((s) => s.panY)
  const setPan = useWidgetStore((s) => s.setPan)

  // Live viewport size — the visible-rectangle calculation needs the
  // outer canvas's pixel dimensions, not the minimap widget's own size.
  // We read this from the canvas-surface element so the minimap stays
  // accurate as the user resizes their window.
  const [canvasViewport, setCanvasViewport] = useState<{ w: number; h: number }>({
    w: window.innerWidth,
    h: window.innerHeight
  })
  useEffect(() => {
    function measure(): void {
      const el = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
      if (el) {
        const r = el.getBoundingClientRect()
        setCanvasViewport({ w: r.width, h: r.height })
      } else {
        setCanvasViewport({ w: window.innerWidth, h: window.innerHeight })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    const el = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    let ro: ResizeObserver | null = null
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => {
      window.removeEventListener('resize', measure)
      if (ro) ro.disconnect()
    }
  }, [])

  // Minimize behaviour: the minimap is an aid for moving around the canvas, so it
  // only needs to be open while the user is navigating. When they click into and
  // focus a widget it collapses to a small button, and it reopens whenever they
  // pan or zoom (navigating), when nothing is focused, or when they click the
  // button. inline mode (e.g. the control-room panel) never collapses.
  const activeId = useWidgetStore((s) => s.activeWidgetId)
  const focusedId = useWidgetStore((s) => s.focusedWidgetId)
  const zone = useZonePosition(widget.id)
  const [navExpanded, setNavExpanded] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const navTimer = useRef<number | undefined>(undefined)

  // Any pan/zoom counts as navigating: reopen and keep it open for a short
  // window after the movement stops.
  useEffect(() => {
    setNavExpanded(true)
    if (navTimer.current) window.clearTimeout(navTimer.current)
    navTimer.current = window.setTimeout(() => setNavExpanded(false), 2200)
    return () => {
      if (navTimer.current) window.clearTimeout(navTimer.current)
    }
  }, [panX, panY, zoom])

  // Focusing a different widget re-collapses (a manual open only lasts until the
  // user turns their attention to another widget).
  useEffect(() => {
    setManualOpen(false)
  }, [activeId, focusedId])

  const hasFocusTarget = activeId !== null || focusedId !== null
  const collapsed = !inline && hasFocusTarget && !navExpanded && !manualOpen

  if (collapsed) {
    // Sit in the bottom-right of the minimap's reserved pin slot; fall back to the
    // viewport corner if the zone position has not resolved yet.
    const pos = zone
      ? { left: zone.x + zone.width - 44, top: zone.y + zone.height - 44 }
      : { right: 16, bottom: 16 }
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setManualOpen(true)
        }}
        data-testid="minimap-collapsed"
        title="Show minimap"
        className="absolute w-9 h-9 rounded-full bg-[var(--surface-raised)]/95 shadow-lg ring-1 ring-black/10 dark:ring-white/10 flex items-center justify-center text-[var(--ink-50)] hover:text-accent pointer-events-auto"
        style={{ position: 'absolute', ...pos }}
      >
        <Icon name="map" size={18} />
      </button>
    )
  }

  const body = (
    <MinimapBody
      widget={widget}
      widgets={widgets}
      zoom={zoom}
      panX={panX}
      panY={panY}
      setPan={setPan}
      viewportWidth={canvasViewport.w}
      viewportHeight={canvasViewport.h}
    />
  )

  if (inline) return body
  return (
    <WidgetFrame widget={widget} headerLabel="Minimap" headerAccent="bg-stone-300/60 dark:bg-white/[0.09]">
      {body}
    </WidgetFrame>
  )
}

function MinimapBody({
  widget,
  widgets,
  zoom,
  panX,
  panY,
  setPan,
  viewportWidth,
  viewportHeight
}: {
  widget: Widget
  widgets: Widget[]
  zoom: number
  panX: number
  panY: number
  setPan: (x: number, y: number) => void
  viewportWidth: number
  viewportHeight: number
}): JSX.Element {
  // The inner SVG sizes itself to fill the widget body (minus the standard
  // header height). We use a ref + ResizeObserver because react-rnd's
  // resize doesn't dispatch React state updates for us — we just need to
  // know the current pixel size of the body so the SVG scales.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [bodyPx, setBodyPx] = useState<{ w: number; h: number }>({
    w: widget.width - 16,
    h: widget.height - 40
  })
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    function measure(): void {
      const r = el.getBoundingClientRect()
      setBodyPx({ w: r.width, h: r.height })
    }
    measure()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => {
      if (ro) ro.disconnect()
    }
  }, [])

  const PADDING = 6
  const MAP_W = Math.max(60, Math.floor(bodyPx.w))
  const MAP_H = Math.max(40, Math.floor(bodyPx.h))

  // Top-level visible widgets — same filter as the old CanvasMinimap:
  // non-archived, non-pinned, non-section-children, AND not this minimap
  // itself (otherwise the minimap would render its own silhouette).
  const visible = useMemo(
    () =>
      widgets.filter(
        (w) =>
          !w.archived &&
          !w.pinned &&
          w.parentSectionId === null &&
          w.id !== widget.id
      ),
    [widgets, widget.id]
  )

  const bbox = useMemo(() => {
    if (visible.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const w of visible) {
      let width = w.width
      let height = w.height
      if (w.kind === 'section') {
        const sChildren = widgets.filter((c) => c.parentSectionId === w.id)
        const frame = computeSectionFrame(sChildren, effectiveLayout(w.layout))
        width = frame.width
        height = frame.height
      }
      minX = Math.min(minX, w.x)
      minY = Math.min(minY, w.y)
      maxX = Math.max(maxX, w.x + width)
      maxY = Math.max(maxY, w.y + height)
    }
    // Inflate by the visible viewport so panning past widget cluster still
    // maps usefully — same as the legacy CanvasMinimap.
    const viewportW = viewportWidth / zoom
    const viewportH = viewportHeight / zoom
    minX -= viewportW / 2
    minY -= viewportH / 2
    maxX += viewportW / 2
    maxY += viewportH / 2
    return { minX, minY, maxX, maxY }
  }, [visible, widgets, viewportWidth, viewportHeight, zoom])

  const scale = useMemo(() => {
    if (!bbox) return 1
    const bbW = Math.max(1, bbox.maxX - bbox.minX)
    const bbH = Math.max(1, bbox.maxY - bbox.minY)
    const sx = (MAP_W - 2 * PADDING) / bbW
    const sy = (MAP_H - 2 * PADDING) / bbH
    return Math.min(sx, sy)
  }, [bbox, MAP_W, MAP_H])

  const viewportRect = useMemo(() => {
    if (!bbox) return null
    const worldX = -panX / zoom
    const worldY = -panY / zoom
    const worldW = viewportWidth / zoom
    const worldH = viewportHeight / zoom
    const x = PADDING + (worldX - bbox.minX) * scale
    const y = PADDING + (worldY - bbox.minY) * scale
    const w = worldW * scale
    const h = worldH * scale
    return { x, y, w, h }
  }, [bbox, panX, panY, zoom, viewportWidth, viewportHeight, scale])

  const zoomToWidget = useWidgetStore((s) => s.zoomToWidget)

  const draggingRef = useRef(false)
  function panFromMinimapPoint(e: React.MouseEvent<SVGSVGElement>): void {
    if (!bbox) return
    const rect = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    const worldX = (localX - PADDING) / scale + bbox.minX
    const worldY = (localY - PADDING) / scale + bbox.minY
    const newPanX = viewportWidth / 2 - worldX * zoom
    const newPanY = viewportHeight / 2 - worldY * zoom
    setPan(newPanX, newPanY)
  }

  useEffect(() => {
    function onUp(): void {
      draggingRef.current = false
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])

  // Empty-canvas affordance: when there's nothing to map, show a hint so
  // the widget doesn't look broken. The user can still resize / pin /
  // delete it from this state.
  if (visible.length === 0) {
    return (
      <div
        ref={wrapRef}
        className="h-full w-full flex flex-col items-center justify-center gap-1.5 bg-[var(--surface-sunken)] text-[var(--ink-40)]"
      >
        <Icon name="map" size={20} />
        <div className="text-[10px] uppercase tracking-[0.12em]">Empty canvas</div>
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      className="h-full w-full relative bg-[var(--surface-sunken)] select-none"
    >
      {/* Zoom badge — small monospaced indicator so users at a glance know
          where they are on the zoom scale. */}
      <div className="absolute top-1 right-1.5 text-[9px] font-mono text-[var(--ink-40)] pointer-events-none">
        {Math.round(zoom * 100)}%
      </div>
      <svg
        width={MAP_W}
        height={MAP_H}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="block cursor-crosshair"
        onMouseDown={(e) => {
          e.stopPropagation()
          draggingRef.current = true
          panFromMinimapPoint(e)
        }}
        onMouseMove={(e) => {
          if (!draggingRef.current) return
          panFromMinimapPoint(e)
        }}
      >
        {bbox &&
          visible.map((w) => {
            let width = w.width
            let height = w.height
            if (w.kind === 'section') {
              const sChildren = widgets.filter((c) => c.parentSectionId === w.id)
              const frame = computeSectionFrame(sChildren, effectiveLayout(w.layout))
              width = frame.width
              height = frame.height
            }
            const x = PADDING + (w.x - bbox.minX) * scale
            const y = PADDING + (w.y - bbox.minY) * scale
            const ww = Math.max(2, width * scale)
            const hh = Math.max(2, height * scale)
            // Sections stay a translucent frame (they have no content of their
            // own — their children render as their own thumbnails).
            if (w.kind === 'section') {
              return (
                <rect
                  key={w.id}
                  x={x}
                  y={y}
                  width={ww}
                  height={hh}
                  fill="rgb(var(--accent) / 0.06)"
                  stroke="rgb(var(--accent) / 0.30)"
                  strokeWidth={0.75}
                  rx={2}
                />
              )
            }
            // Everything else renders a true, content-aware thumbnail: the real
            // widget content drawn at full size and scaled down to fit the map.
            return (
              <foreignObject
                key={w.id}
                x={x}
                y={y}
                width={ww}
                height={hh}
                data-testid={`minimap-thumb-${w.id}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  zoomToWidget(w.id)
                }}
                style={{ cursor: 'pointer', overflow: 'hidden' }}
              >
                <div
                  className="h-full w-full overflow-hidden rounded-[2px] ring-1 ring-black/10 dark:ring-white/10"
                  style={{ position: 'relative' }}
                >
                  <div
                    style={{
                      width,
                      height,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      pointerEvents: 'none'
                    }}
                  >
                    <WidgetPreview widget={w} />
                  </div>
                </div>
              </foreignObject>
            )
          })}
        {viewportRect && (
          <rect
            x={Math.max(0, viewportRect.x)}
            y={Math.max(0, viewportRect.y)}
            width={Math.min(MAP_W - viewportRect.x, viewportRect.w)}
            height={Math.min(MAP_H - viewportRect.y, viewportRect.h)}
            fill="rgb(var(--accent) / 0.12)"
            stroke="rgb(var(--accent))"
            strokeWidth={1.25}
            rx={2}
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  )
}
