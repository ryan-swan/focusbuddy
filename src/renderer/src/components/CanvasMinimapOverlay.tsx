import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWidgetStore } from '../stores/widgets'
import { MinimapBody } from './widgets/MinimapWidget'
import Icon from './Icon'
import type { Widget } from '@shared/types'

const SENTINEL = {
  id: '__minimap-overlay',
  kind: 'minimap',
  taskId: '',
  title: '',
  content: '',
  x: 0,
  y: 0,
  width: 220,
  height: 160,
  pinned: false,
  pinnedZone: null,
  parentSectionId: null,
  archived: false,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  color: null,
  layout: null,
  url: null,
  appId: null,
  sharedFrom: null,
} as unknown as Widget

const EXPANDED_W = 220
const EXPANDED_H = 160

// Dragged position is stored as offset from the default BR anchor.
// null = at rest in the default position.
export default function CanvasMinimapOverlay(): JSX.Element {
  const zoom = useWidgetStore((s) => s.zoom)
  const panX = useWidgetStore((s) => s.panX)
  const panY = useWidgetStore((s) => s.panY)
  const setPan = useWidgetStore((s) => s.setPan)
  const widgets = useWidgetStore((s) => s.widgets)

  const [expanded, setExpanded] = useState(false)
  // drag offset from default bottom-right position; null = resting at default
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, dx: 0, dy: 0 })

  const [canvasViewport, setCanvasViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    function measure(): void {
      const el = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
      if (el) {
        const r = el.getBoundingClientRect()
        setCanvasViewport({ w: r.width, h: r.height })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    let ro: ResizeObserver | null = null
    const el = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => {
      window.removeEventListener('resize', measure)
      if (ro) ro.disconnect()
    }
  }, [])

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if ((e.target as HTMLElement).closest('svg')) return
    if ((e.target as HTMLElement).closest('[data-minimap-btn]')) return
    e.preventDefault()
    dragging.current = true
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      dx: dragOffset?.dx ?? 0,
      dy: dragOffset?.dy ?? 0,
    }

    function onMove(ev: MouseEvent): void {
      if (!dragging.current) return
      setDragOffset({
        dx: dragStart.current.dx + (ev.clientX - dragStart.current.mx),
        dy: dragStart.current.dy + (ev.clientY - dragStart.current.my),
      })
    }
    function onUp(): void {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onDoubleClick(e: React.MouseEvent): void {
    if ((e.target as HTMLElement).closest('svg')) return
    setDragOffset(null)
  }

  // Size of the element in its current state
  const elW = expanded ? EXPANDED_W : 40
  const elH = expanded ? EXPANDED_H : 40

  // Default position: 16px from the BR corner of the canvas surface.
  // Stored as right/bottom so it adapts to window resize automatically.
  // When dragged we compute left/top from the drag offset.
  const isDragged = dragOffset !== null
  const style: React.CSSProperties = isDragged
    ? {
        // Convert BR offset into left/top coordinates
        left: canvasViewport.w - elW - 16 + dragOffset.dx,
        top: canvasViewport.h - elH - 16 + dragOffset.dy,
        transition: dragging.current ? 'none' : 'left 300ms ease, top 300ms ease',
      }
    : {
        // Anchor naturally to BR corner — no JS needed
        right: 16,
        bottom: 16,
        transition: 'right 300ms ease, bottom 300ms ease',
      }

  return (
    <div
      ref={containerRef}
      data-minimap-overlay="true"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onWheel={(e) => e.stopPropagation()}
      className="absolute z-[50] pointer-events-auto select-none"
      style={{ ...style, width: elW, height: elH }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {expanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ width: EXPANDED_W, height: EXPANDED_H, originX: 1, originY: 1 }}
            className="rounded-2xl overflow-hidden flex flex-col fb-glass-chrome ring-1 ring-black/[0.08] dark:ring-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
          >
            {/* Drag handle / header */}
            <div className="h-7 flex items-center justify-between px-2.5 shrink-0 cursor-grab active:cursor-grabbing border-b border-[var(--edge-soft)]">
              <div className="flex items-center gap-1.5">
                <Icon name="drag_indicator" size={11} className="text-[var(--ink-30)] pointer-events-none" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-40)] select-none">Map</span>
              </div>
              <button
                data-minimap-btn
                onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
                className="h-5 w-5 inline-flex items-center justify-center rounded-full text-[var(--ink-40)] hover:text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors"
                title="Collapse minimap"
              >
                <Icon name="close" size={11} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <MinimapBody
                widget={SENTINEL}
                widgets={widgets}
                zoom={zoom}
                panX={panX}
                panY={panY}
                setPan={setPan}
                viewportWidth={canvasViewport.w}
                viewportHeight={canvasViewport.h}
              />
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            data-minimap-btn
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
            title="Show minimap — drag to move, double-click to reset position"
            className="w-10 h-10 rounded-full fb-glass-chrome ring-1 ring-black/[0.08] dark:ring-white/[0.08] shadow-lg flex items-center justify-center text-[var(--ink-50)] hover:text-[rgb(var(--accent))] transition-colors cursor-grab active:cursor-grabbing"
          >
            <Icon name="map" size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
