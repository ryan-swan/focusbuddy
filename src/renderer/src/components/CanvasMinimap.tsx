import { useEffect, useMemo, useRef, useState } from 'react'
import { useWidgetStore } from '../stores/widgets'
import { computeSectionFrame, effectiveLayout } from '../lib/sectionGeometry'
import Icon from './Icon'

interface Props {
  // Pixel size of the parent canvas viewport — needed to compute the
  // viewport rectangle on the minimap. Canvas knows this from its own
  // container ref and passes it down so we don't measure twice.
  viewportWidth: number
  viewportHeight: number
}

// Canvas Minimap — bottom-right overview rectangle with widget silhouettes
// and a draggable viewport rect. Lets a user with a sprawling canvas jump
// across it in one click.
//
// Behaviour:
//   - Renders silhouettes of all non-archived widgets in the active task
//   - Draws a viewport rectangle showing the visible region given current
//     pan + zoom
//   - Click anywhere → pan the canvas so that point becomes the viewport
//     centre
//   - Drag the viewport rect → pan in real time
//   - Collapsible via the chevron button so it doesn't compete for canvas
//     real estate when the user wants the canvas to themselves
//
// Not rendered if the user has no widgets on the canvas — the empty
// minimap would add noise without value.
export default function CanvasMinimap({
  viewportWidth,
  viewportHeight
}: Props): JSX.Element | null {
  const widgets = useWidgetStore((s) => s.widgets)
  const zoom = useWidgetStore((s) => s.zoom)
  const panX = useWidgetStore((s) => s.panX)
  const panY = useWidgetStore((s) => s.panY)
  const setPan = useWidgetStore((s) => s.setPan)
  const [collapsed, setCollapsed] = useState(false)

  // Geometry — minimap is fixed in size (180×120 inner area). The viewport
  // rect inside it scales with the worldspace bounding box.
  const MAP_W = 180
  const MAP_H = 120
  const PADDING = 8

  // Only consider top-level (non-section-child, non-archived, non-pinned)
  // widgets for the bounding box — pinned widgets float and shouldn't
  // skew the world bbox.
  const visible = useMemo(
    () =>
      widgets.filter(
        (w) =>
          !w.archived && !w.pinned && w.parentSectionId === null
      ),
    [widgets]
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
    // Inflate bbox by the visible viewport so panning past the edges
    // still maps usefully. Without this, panning outside the widget cluster
    // would push the viewport rect off the minimap.
    const viewportW = viewportWidth / zoom
    const viewportH = viewportHeight / zoom
    minX -= viewportW / 2
    minY -= viewportH / 2
    maxX += viewportW / 2
    maxY += viewportH / 2
    return { minX, minY, maxX, maxY }
  }, [visible, widgets, viewportWidth, viewportHeight, zoom])

  // Scale that maps worldspace → minimap pixels.
  const scale = useMemo(() => {
    if (!bbox) return 1
    const bbW = Math.max(1, bbox.maxX - bbox.minX)
    const bbH = Math.max(1, bbox.maxY - bbox.minY)
    const sx = (MAP_W - 2 * PADDING) / bbW
    const sy = (MAP_H - 2 * PADDING) / bbH
    return Math.min(sx, sy)
  }, [bbox])

  // Viewport rect in minimap coordinates — visible region of the world.
  const viewportRect = useMemo(() => {
    if (!bbox) return null
    // Worldspace coords of the top-left visible canvas corner.
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

  // Drag interaction — clicking or dragging anywhere on the minimap pans
  // the canvas so that point becomes the viewport centre.
  const draggingRef = useRef(false)
  function panFromMinimapPoint(e: React.MouseEvent<SVGSVGElement>): void {
    if (!bbox) return
    const rect = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    // Inverse of viewportRect calculation.
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

  if (visible.length === 0) return null

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-3 right-3 z-30 h-7 w-7 rounded-md fb-glass-chrome border border-[color:var(--glass-chrome-border)] inline-flex items-center justify-center text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 shadow-md"
        title="Show minimap"
        aria-label="Show minimap"
      >
        <Icon name="map" size={14} />
      </button>
    )
  }

  return (
    <div className="absolute bottom-3 right-3 z-30 fb-glass-chrome rounded-md border border-[color:var(--glass-chrome-border)] shadow-md select-none">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[color:var(--glass-chrome-border)]">
        <span className="text-[9px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold">
          Minimap
        </span>
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="h-4 w-4 inline-flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            title="Hide minimap"
            aria-label="Hide minimap"
          >
            <Icon name="close" size={10} />
          </button>
        </div>
      </div>
      <svg
        width={MAP_W}
        height={MAP_H}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="block cursor-crosshair"
        onMouseDown={(e) => {
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
            const fill =
              w.kind === 'section'
                ? 'rgb(var(--accent) / 0.10)'
                : w.kind === 'sticky'
                  ? '#fde68a'
                  : w.kind === 'note'
                    ? '#bae6fd'
                    : 'rgb(120 113 108 / 0.55)'
            return (
              <rect
                key={w.id}
                x={x}
                y={y}
                width={ww}
                height={hh}
                fill={fill}
                rx={1.5}
              />
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
