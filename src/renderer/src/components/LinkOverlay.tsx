import { useCallback, useEffect, useState } from 'react'
import type { WidgetLink } from '@shared/types'
import { useLinksStore } from '../stores/links'
import { useWidgetStore } from '../stores/widgets'
import Icon from './Icon'

// Spatial backlinks rendered as bezier curves between widget centres.
//
// Positioning strategy: read each widget's ACTUAL rendered bounding rect
// from the DOM on every frame. This is the only reliable source of truth
// while react-rnd is mid-drag (it applies CSS transforms internally that
// don't get reflected back into widget.x/y until onDragStop). Reading
// getBoundingClientRect on the widget element gives us the position the
// user is actually seeing, transform and all.
//
// The SVG sits OUTSIDE the transformed canvas container and renders in
// pure screen-space — no zoom-counter-scaling, no world-coordinate math.
// Endpoints come straight from the DOM in viewport coords.
//
// Live tracking: a rAF loop bumps a render tick whenever the mouse is
// held down (the only time anything can be dragging). This makes
// LinkOverlay re-render every frame during a drag, so the lines visibly
// chase the widget rather than snapping only on drop.

export interface LinkDragGhost {
  // Source widget for the in-flight ghost (the user has armed a link).
  fromWidgetId: string
  // Cursor position in CANVAS-PANE-relative screen coords (left/top offset
  // from the dropRef's bounding rect). Same coord space as the rendered
  // SVG, so no conversion needed.
  cursorScreenX: number
  cursorScreenY: number
}

interface Props {
  ghost: LinkDragGhost | null
}

interface Bounds {
  cx: number
  cy: number
  w: number
  h: number
}

// Read widget bounds in canvas-pane-relative screen coordinates. Returns
// null if the widget isn't currently in the DOM (archived, switched task,
// etc.) — the corresponding link silently drops out of the render until
// the widget reappears.
function readWidgetBounds(widgetId: string, canvasEl: HTMLElement): Bounds | null {
  const el = document.querySelector(
    `[data-widget-id="${cssEscape(widgetId)}"]`
  ) as HTMLElement | null
  if (!el) return null
  const wr = el.getBoundingClientRect()
  const cr = canvasEl.getBoundingClientRect()
  return {
    cx: wr.left - cr.left + wr.width / 2,
    cy: wr.top - cr.top + wr.height / 2,
    w: wr.width,
    h: wr.height
  }
}

// Defensive selector-string escape so widget UUIDs (which can in theory
// contain characters that break CSS selectors) don't blow up the query.
// Browser implementations of CSS.escape have been universal since 2017 but
// we fall back just in case.
function cssEscape(s: string): string {
  if (typeof (window.CSS as { escape?: (s: string) => string }).escape === 'function') {
    return (window.CSS as { escape: (s: string) => string }).escape(s)
  }
  return s.replace(/["\\]/g, '\\$&')
}

// Edge intersection of a ray from (cx,cy) toward (tx,ty) with the
// rectangle of half-width w/2, half-height h/2. Lets us anchor link
// endpoints on the widget border instead of inside its body.
function rectEdgePoint(b: Bounds, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - b.cx
  const dy = ty - b.cy
  if (dx === 0 && dy === 0) return { x: b.cx, y: b.cy }
  const hw = b.w / 2
  const hh = b.h / 2
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx)
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: b.cx + dx * s, y: b.cy + dy * s }
}

// Quadratic-bezier path with the control point offset perpendicular to
// the chord so the curve arcs gently between the endpoints. Arc magnitude
// scales with chord length, capped at 80px so very long links don't bow
// absurdly.
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const px = -dy / len
  const py = dx / len
  const arc = Math.min(len * 0.18, 80)
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const cpX = midX + px * arc
  const cpY = midY + py * arc
  return `M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`
}

function bezierMidpoint(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  if (len < 0.5) return { x: midX, y: midY }
  const px = -dy / len
  const py = dx / len
  const arc = Math.min(len * 0.18, 80)
  const cpX = midX + px * arc
  const cpY = midY + py * arc
  // B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2 for a quadratic bezier
  return {
    x: 0.25 * x1 + 0.5 * cpX + 0.25 * x2,
    y: 0.25 * y1 + 0.5 * cpY + 0.25 * y2
  }
}

interface Segment {
  link: WidgetLink
  x1: number
  y1: number
  x2: number
  y2: number
}

export default function LinkOverlay({ ghost }: Props): JSX.Element | null {
  const links = useLinksStore((s) => s.links)
  const remove = useLinksStore((s) => s.remove)
  // Subscribe to canvas state so re-renders happen on pan, zoom, layout
  // changes, and widget store updates. The DOM-read approach is robust to
  // stale dragOverride but still needs to re-render when widgets are
  // added, removed, archived, etc.
  useWidgetStore((s) => s.widgets)
  useWidgetStore((s) => s.panX)
  useWidgetStore((s) => s.panY)
  useWidgetStore((s) => s.zoom)
  useWidgetStore((s) => s.layoutVersion)

  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)
  // Render-tick — bumped by the rAF loop while mouse is held, so the SVG
  // re-renders every frame during a drag. Without this, the line would
  // snap only on drop because react-rnd's mid-drag transforms don't
  // trigger React re-renders elsewhere in the tree.
  const [, setTick] = useState(0)

  useEffect(() => {
    // While any mouse button is held, run a rAF loop bumping the tick. On
    // mouseup, tear down. This costs nothing when the mouse isn't held —
    // no loop runs — and gives us 60fps re-renders during any drag.
    let rafId: number | null = null
    function loop(): void {
      setTick((t) => (t + 1) & 0x3fffffff) // wrap to avoid overflow
      rafId = requestAnimationFrame(loop)
    }
    function onDown(): void {
      if (rafId !== null) return
      rafId = requestAnimationFrame(loop)
    }
    function onUp(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      // One trailing render so we settle to the FINAL post-drop layout,
      // not whatever frame happened to be mid-rAF when we cancelled.
      setTick((t) => (t + 1) & 0x3fffffff)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mouseleave', onUp)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mouseleave', onUp)
    }
  }, [])

  // Dismiss the delete popover on outside-of-popover click.
  useEffect(() => {
    if (!selectedLinkId) return
    function onDown(e: MouseEvent): void {
      const target = e.target as HTMLElement
      if (target.closest('[data-link-popover]')) return
      if (target.closest('[data-link-line]')) return
      setSelectedLinkId(null)
      setPopoverPos(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selectedLinkId])

  // Locate the canvas surface element ONCE per render. Bail out if it's
  // not in the DOM yet (the very first paint may beat the canvas mount).
  const canvasEl = document.querySelector(
    '[data-canvas-surface="true"]'
  ) as HTMLElement | null
  if (!canvasEl) return null

  // Build the segment list from live DOM positions. Any link whose
  // endpoint isn't currently in the DOM (e.g. archived widget) gets
  // silently skipped — its row stays in SQLite but doesn't render.
  const segments: Segment[] = []
  for (const link of links) {
    const src = readWidgetBounds(link.sourceWidgetId, canvasEl)
    const tgt = readWidgetBounds(link.targetWidgetId, canvasEl)
    if (!src || !tgt) continue
    const from = rectEdgePoint(src, tgt.cx, tgt.cy)
    const to = rectEdgePoint(tgt, src.cx, src.cy)
    segments.push({ link, x1: from.x, y1: from.y, x2: to.x, y2: to.y })
  }

  // Ghost line: source widget edge → cursor.
  let ghostPath: string | null = null
  if (ghost) {
    const src = readWidgetBounds(ghost.fromWidgetId, canvasEl)
    if (src) {
      const tip = rectEdgePoint(src, ghost.cursorScreenX, ghost.cursorScreenY)
      ghostPath = bezierPath(tip.x, tip.y, ghost.cursorScreenX, ghost.cursorScreenY)
    }
  }

  function handleClickLine(link: WidgetLink, mid: { x: number; y: number }): void {
    setSelectedLinkId(link.id)
    setPopoverPos(mid)
  }

  function handleDelete(): void {
    if (!selectedLinkId) return
    void remove(selectedLinkId)
    setSelectedLinkId(null)
    setPopoverPos(null)
  }

  return (
    <div
      // Stacking: above the transformed canvas widgets (which have their
      // own z-indices starting at 1), below the floating toolbar (z-20)
      // and the pinned-widget layer (z-30). pointer-events: none so the
      // overlay itself never blocks widget interactions — only the visible
      // bezier paths catch clicks via their own pointer-events: stroke.
      className="absolute inset-0 z-[15] pointer-events-none"
      data-link-overlay
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        {segments.map((seg) => {
          const isSelected = seg.link.id === selectedLinkId
          const d = bezierPath(seg.x1, seg.y1, seg.x2, seg.y2)
          return (
            <g key={seg.link.id} data-link-line>
              {/* Wide invisible hitbox underneath the visible curve. */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleClickLine(seg.link, bezierMidpoint(seg.x1, seg.y1, seg.x2, seg.y2))
                }}
              />
              <path
                d={d}
                fill="none"
                stroke="rgb(var(--accent))"
                strokeOpacity={isSelected ? 0.95 : 0.6}
                strokeWidth={isSelected ? 2.5 : 1.75}
                strokeLinecap="round"
                style={{
                  pointerEvents: 'none',
                  transition: 'stroke-opacity 120ms ease'
                }}
              />
              <circle
                cx={seg.x1}
                cy={seg.y1}
                r={isSelected ? 4 : 3}
                fill="rgb(var(--accent))"
                fillOpacity={isSelected ? 1 : 0.8}
                style={{ pointerEvents: 'none' }}
              />
              <circle
                cx={seg.x2}
                cy={seg.y2}
                r={isSelected ? 4 : 3}
                fill="rgb(var(--accent))"
                fillOpacity={isSelected ? 1 : 0.8}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )
        })}
        {ghostPath && (
          <path
            d={ghostPath}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeOpacity={0.7}
            strokeWidth={2}
            strokeDasharray="7 5"
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
      {popoverPos && selectedLinkId && (
        <div
          data-link-popover
          style={{
            position: 'absolute',
            left: popoverPos.x,
            top: popoverPos.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto'
          }}
        >
          <DeletePill
            onConfirm={handleDelete}
            onCancel={() => {
              setSelectedLinkId(null)
              setPopoverPos(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

function DeletePill({
  onConfirm,
  onCancel
}: {
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const handleClick = useCallback(() => {
    if (confirming) onConfirm()
    else setConfirming(true)
  }, [confirming, onConfirm])

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-md text-[10px]"
    >
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full transition-colors ${
          confirming
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'text-stone-600 dark:text-stone-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
        }`}
      >
        <Icon name="link_off" size={11} />
        <span>{confirming ? 'Confirm' : 'Unlink'}</span>
      </button>
      {confirming && (
        <button
          onClick={onCancel}
          className="text-stone-500 hover:text-stone-700 px-1"
          aria-label="Cancel"
        >
          <Icon name="close" size={11} />
        </button>
      )}
    </div>
  )
}
