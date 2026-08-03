import { useCallback, useEffect, useState } from 'react'
import type { WidgetLink, WireType, WireRun, WidgetKind } from '@shared/types'
import { recipesForSource } from '../lib/wireRecipes'
import { useLinksStore } from '../stores/links'
import { useWidgetStore } from '../stores/widgets'
import { runWireNow, useWireRunStore } from '../lib/wireEngine'
import { useAgentRunStore } from '../lib/deskAgentEngine'
import Icon from './Icon'

// Per-wire-type presentation. context is a quiet dashed line; transform is a
// solid directed line that animates while it runs; mirror is a solid line with
// a double-chevron feel. The badge icon sits at the wire midpoint.
const WIRE_META: Record<WireType, { icon: string; label: string; dash: string | undefined }> = {
  context: { icon: 'link', label: 'Context', dash: '5 5' },
  transform: { icon: 'auto_awesome', label: 'Transform', dash: undefined },
  mirror: { icon: 'sync', label: 'Mirror', dash: undefined }
}

// Per-wire freshness, shown on the badge so a reactive wire is never a mystery:
// you can tell at a glance whether it is live, stale (source changed since it
// last ran), never-run, off, running, or errored. Context wires are passive and
// have no freshness. States are mutually exclusive, most-urgent first.
type WireFreshness = 'error' | 'running' | 'disabled' | 'stale' | 'never-run' | 'ok'

function wireFreshness(
  link: WidgetLink,
  sourceUpdatedAt: number | undefined,
  running: boolean,
  hasError: boolean,
  // A wire into an outbound webhook is reactive even though its type is 'context'
  // (it POSTs on source change), so it gets freshness like transform/mirror.
  targetIsWebhook = false
): WireFreshness | null {
  if (link.type !== 'transform' && link.type !== 'mirror' && !targetIsWebhook) return null
  if (hasError) return 'error'
  if (running) return 'running'
  if (!link.enabled) return 'disabled'
  const last = link.lastRunAt ?? null
  if (last == null) return 'never-run'
  if (sourceUpdatedAt != null && sourceUpdatedAt > last) return 'stale'
  return 'ok'
}

function relAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

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
  // Cursor position in RAW viewport coords (same space as
  // MouseEvent.clientX/clientY). Same coord space as the SVG, which is
  // now mounted `position: fixed` covering the viewport.
  cursorScreenX: number
  cursorScreenY: number
}

// A link that was just drawn and is awaiting the user's intent choice. The link
// already exists as a passive `context` wire (created synchronously on drop); the
// picker only upgrades its type. Anchored in RAW viewport coords (the drop point).
export interface PendingLinkPick {
  linkId: string
  x: number
  y: number
}

interface Props {
  ghost: LinkDragGhost | null
  // Set right after a link is drawn, to offer "how should this connect?" at the
  // drop point. Null when no pick is pending.
  pendingPick: PendingLinkPick | null
  // Clear the pending pick (dismiss or after a choice is made). Should be stable.
  onPendingPickDone: () => void
}

interface Bounds {
  cx: number
  cy: number
  w: number
  h: number
}

// Read widget bounds in RAW viewport-relative screen coordinates (the
// same coord space `clientX/clientY` use). Returns null if the widget
// isn't currently in the DOM (archived, switched task, etc.) — the
// corresponding link silently drops out of the render until the widget
// reappears.
//
// Earlier this returned canvas-surface-relative coords (subtracting the
// canvas surface's GBCR), paired with an SVG sized to fill that surface.
// That approach drifted by ~half the viewport in practice — likely
// because the `absolute inset-0` SVG container was finding a different
// positioned ancestor than the canvas surface in the prod bundle. The
// fix is to keep everything in viewport pixels and mount the SVG at
// `position: fixed` covering the viewport — then there are zero
// intermediate coord-space conversions to get wrong.
function readWidgetBounds(widgetId: string): Bounds | null {
  const el = document.querySelector(
    `[data-widget-id="${cssEscape(widgetId)}"]`
  ) as HTMLElement | null
  if (!el) return null
  const wr = el.getBoundingClientRect()
  return {
    cx: wr.left + wr.width / 2,
    cy: wr.top + wr.height / 2,
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
  mx: number
  my: number
}

export default function LinkOverlay({ ghost, pendingPick, onPendingPickDone }: Props): JSX.Element | null {
  const links = useLinksStore((s) => s.links)
  const remove = useLinksStore((s) => s.remove)
  const updateWire = useLinksStore((s) => s.update)
  const running = useWireRunStore((s) => s.running)
  const firing = useWireRunStore((s) => s.firing)
  const wireErrors = useWireRunStore((s) => s.errors)
  // A wire connected to a working desk agent lights up its whole bundle while
  // the agent thinks (inputs feeding in, outputs about to fire).
  const agentRunning = useAgentRunStore((s) => s.running)
  // Subscribe to canvas state so re-renders happen on pan, zoom, layout
  // changes, and widget store updates. The DOM-read approach is robust to
  // stale dragOverride but still needs to re-render when widgets are
  // added, removed, archived, etc.
  const allWidgets = useWidgetStore((s) => s.widgets)
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
  // Canvas surface clip rect (in viewport coords). Recomputed on resize
  // + sidebar toggles. We clip the fixed-position SVG to this rect so
  // bezier curves can't render over the sidebar / header chrome.
  const [clipRect, setClipRect] = useState<{ top: number; right: number; bottom: number; left: number } | null>(null)

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

  // Track the canvas surface's bounding rect so we can clip the SVG
  // to it. Without this, the fixed-position SVG covers the whole
  // viewport and bezier curves render over the sidebar / chrome.
  useEffect(() => {
    function recompute(): void {
      const el = document.querySelector('[data-canvas-surface="true"]') as HTMLElement | null
      if (!el) {
        setClipRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      setClipRect({
        top: r.top,
        right: window.innerWidth - r.right,
        bottom: window.innerHeight - r.bottom,
        left: r.left
      })
    }
    recompute()
    // Observe the canvas surface for size changes + listen for window
    // resize + sidebar collapse animations. The ResizeObserver fires
    // when the parent layout changes (sidebar toggles, panel resizes).
    const el = document.querySelector('[data-canvas-surface="true"]') as HTMLElement | null
    let ro: ResizeObserver | null = null
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => recompute())
      ro.observe(el)
      // Also observe document.body so we catch parent-driven layout
      // changes (sidebar collapse pushes the canvas surface left).
      ro.observe(document.body)
    }
    window.addEventListener('resize', recompute)
    // Sidebar animations finish over ~200ms — re-poll a couple of times
    // to settle into the new rect after the transition completes.
    const t1 = window.setTimeout(recompute, 200)
    const t2 = window.setTimeout(recompute, 500)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', recompute)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
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

  // Intent picker: dismiss on Escape or an outside-of-popover click. Dismissing
  // is non-destructive — the link stays a passive `context` wire (widget-link-owner:
  // never cancel-to-nothing, the gesture already produced a real connection).
  useEffect(() => {
    if (!pendingPick) return
    function onDown(e: MouseEvent): void {
      const target = e.target as HTMLElement
      if (target.closest('[data-link-popover]')) return
      onPendingPickDone()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onPendingPickDone()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pendingPick, onPendingPickDone])

  // Self-heal a stale pick whose link has since vanished (task switch, concurrent
  // delete). Keeps Canvas's pendingPick state from getting stuck.
  useEffect(() => {
    if (pendingPick && !links.some((l) => l.id === pendingPick.linkId)) onPendingPickDone()
  }, [pendingPick, links, onPendingPickDone])

  // A newly-armed pick dismisses any open wire editor — the reciprocal of
  // handleClickLine's clear, so the two popovers can never both be on screen.
  useEffect(() => {
    if (pendingPick) {
      setSelectedLinkId(null)
      setPopoverPos(null)
    }
  }, [pendingPick])

  // Build the segment list from live DOM positions. Any link whose
  // endpoint isn't currently in the DOM (e.g. archived widget) gets
  // silently skipped — its row stays in SQLite but doesn't render.
  const segments: Segment[] = []
  for (const link of links) {
    const src = readWidgetBounds(link.sourceWidgetId)
    const tgt = readWidgetBounds(link.targetWidgetId)
    if (!src || !tgt) continue
    const from = rectEdgePoint(src, tgt.cx, tgt.cy)
    const to = rectEdgePoint(tgt, src.cx, src.cy)
    const mid = bezierMidpoint(from.x, from.y, to.x, to.y)
    segments.push({ link, x1: from.x, y1: from.y, x2: to.x, y2: to.y, mx: mid.x, my: mid.y })
  }

  // Ghost line: source widget edge → cursor.
  let ghostPath: string | null = null
  if (ghost) {
    const src = readWidgetBounds(ghost.fromWidgetId)
    if (src) {
      const tip = rectEdgePoint(src, ghost.cursorScreenX, ghost.cursorScreenY)
      ghostPath = bezierPath(tip.x, tip.y, ghost.cursorScreenX, ghost.cursorScreenY)
    }
  }

  const selectedLink = selectedLinkId ? links.find((l) => l.id === selectedLinkId) ?? null : null
  const pickLink = pendingPick ? links.find((l) => l.id === pendingPick.linkId) ?? null : null

  function handleClickLine(link: WidgetLink, mid: { x: number; y: number }): void {
    // Opening the wire editor dismisses any pending intent picker — only one
    // wire popover is ever on screen at a time (widget-link-owner invariant).
    if (pendingPick) onPendingPickDone()
    setSelectedLinkId(link.id)
    setPopoverPos(mid)
  }

  // Resolve the intent picker: set the chosen wire type and close. For Transform,
  // hand off to the full wire editor (anchored where the picker was) so the user
  // can type the instruction. updateWire is safe on a since-deleted link (returns
  // null, never throws) — widget-link-owner invariant.
  function handlePickIntent(type: WireType): void {
    if (!pendingPick) return
    const linkId = pendingPick.linkId
    const pos = { x: pendingPick.x, y: pendingPick.y }
    void updateWire(linkId, { type })
    onPendingPickDone()
    if (type === 'transform') {
      setSelectedLinkId(linkId)
      setPopoverPos(pos)
    }
  }

  function handleDelete(): void {
    if (!selectedLinkId) return
    void remove(selectedLinkId)
    setSelectedLinkId(null)
    setPopoverPos(null)
  }

  // CSS `clip-path: inset(top right bottom left)` masks the SVG so it
  // only renders within the canvas surface area — preventing bezier
  // curves from drawing over the sidebar / header / chrome that lives
  // outside the canvas. Falls back to "no clip" until the rect is read
  // (first paint), at which point we re-render with the clip applied.
  const clipPath = clipRect
    ? `inset(${clipRect.top}px ${clipRect.right}px ${clipRect.bottom}px ${clipRect.left}px)`
    : undefined

  return (
    <div
      // POSITION: FIXED to the viewport. Endpoints are computed in raw
      // `getBoundingClientRect` coords (viewport pixels), so the SVG must
      // mount in the same coord space. Clipped to the canvas surface via
      // clip-path so bezier curves don't render over the sidebar / header.
      //
      // Stacking: above the transformed canvas widgets (which have their
      // own z-indices starting at 1), below the floating toolbar and
      // pinned-widget layer (both higher z). pointer-events: none so the
      // overlay itself never blocks widget interactions — only the visible
      // bezier paths catch clicks via their own pointer-events: stroke.
      className="fixed inset-0 z-[15] pointer-events-none"
      style={{ clipPath, WebkitClipPath: clipPath }}
      data-link-overlay
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        <defs>
          <marker
            id="fb-wire-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="rgb(var(--accent))" />
          </marker>
          {/* Soft glow used by the electric firing effect — blurs the bright
              core into a halo so a firing wire reads as live current. */}
          <filter id="fb-wire-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {segments.map((seg) => {
          const isSelected = seg.link.id === selectedLinkId
          const d = bezierPath(seg.x1, seg.y1, seg.x2, seg.y2)
          const type = seg.link.type
          const meta = WIRE_META[type]
          const isReactive = type === 'transform' || type === 'mirror'
          // "Firing" = the wire is actively passing information: a transform
          // running, a delivery pulse, or either endpoint being a working agent.
          const isFiring =
            !!running[seg.link.id] ||
            !!firing[seg.link.id] ||
            !!agentRunning[seg.link.sourceWidgetId] ||
            !!agentRunning[seg.link.targetWidgetId]
          // A disabled reactive wire reads as a faint dotted line.
          const disabled = isReactive && !seg.link.enabled
          return (
            <g key={seg.link.id} data-link-line data-wire-type={type} data-firing={isFiring || undefined}>
              {/* Wide invisible hitbox underneath the visible curve. */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleClickLine(seg.link, { x: seg.mx, y: seg.my })
                }}
              />
              {/* Electric firing effect (rendered UNDER the base wire so the
                  glow haloes it): a pulsing blurred halo, a fast stream of
                  current dots, and a bright comet racing source → target. */}
              {isFiring && (
                <>
                  <path
                    d={d}
                    fill="none"
                    stroke="rgb(var(--accent))"
                    strokeWidth={7}
                    strokeOpacity={0.35}
                    strokeLinecap="round"
                    filter="url(#fb-wire-glow)"
                    style={{ pointerEvents: 'none' }}
                  >
                    <animate
                      attributeName="stroke-opacity"
                      values="0.18;0.5;0.18"
                      dur="0.4s"
                      repeatCount="indefinite"
                    />
                  </path>
                  <path
                    d={d}
                    fill="none"
                    stroke="rgb(var(--accent))"
                    strokeWidth={2.5}
                    strokeOpacity={0.95}
                    strokeLinecap="round"
                    strokeDasharray="1.5 9"
                    style={{ pointerEvents: 'none' }}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="21"
                      to="0"
                      dur="0.38s"
                      repeatCount="indefinite"
                    />
                  </path>
                  <path
                    d={d}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={3}
                    strokeOpacity={0.95}
                    strokeLinecap="round"
                    strokeDasharray="16 1600"
                    filter="url(#fb-wire-glow)"
                    style={{ pointerEvents: 'none' }}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="1616"
                      to="0"
                      dur="0.7s"
                      repeatCount="indefinite"
                    />
                  </path>
                </>
              )}
              <path
                d={d}
                fill="none"
                stroke="rgb(var(--accent))"
                strokeOpacity={
                  disabled ? 0.3 : isFiring ? 0.95 : isSelected ? 0.95 : isReactive ? 0.75 : 0.5
                }
                strokeWidth={isFiring ? 2.5 : isSelected ? 2.5 : isReactive ? 2 : 1.5}
                strokeLinecap="round"
                strokeDasharray={disabled ? '2 5' : isFiring ? undefined : meta.dash}
                markerEnd={isReactive ? 'url(#fb-wire-arrow)' : undefined}
                style={{
                  pointerEvents: 'none',
                  transition: 'stroke-opacity 120ms ease'
                }}
              />
              {/* Source endpoint — a pulsing spark ring while firing. */}
              {isFiring && (
                <circle cx={seg.x1} cy={seg.y1} r={2} fill="none" stroke="rgb(var(--accent))" strokeWidth={1.5}>
                  <animate attributeName="r" values="2;9" dur="0.7s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="0.9;0" dur="0.7s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={seg.x1}
                cy={seg.y1}
                r={isFiring ? 4 : isSelected ? 4 : 3}
                fill="rgb(var(--accent))"
                fillOpacity={disabled ? 0.4 : isFiring ? 1 : isSelected ? 1 : 0.8}
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
      {/* Wire-type badges at each midpoint — click to open the wire editor. */}
      {segments.map((seg) => {
        const meta = WIRE_META[seg.link.type]
        const isRunning = !!running[seg.link.id]
        // Error is durable: a transient run error OR a persisted last_error (so a
        // failure still shows after a reload until the next successful run).
        const hasError = !!wireErrors[seg.link.id] || !!seg.link.lastError
        const source = allWidgets.find((w) => w.id === seg.link.sourceWidgetId)
        const targetIsWebhook =
          allWidgets.find((w) => w.id === seg.link.targetWidgetId)?.kind === 'webhook'
        const reactiveOff =
          (seg.link.type === 'transform' || seg.link.type === 'mirror' || targetIsWebhook) &&
          !seg.link.enabled
        const fresh = wireFreshness(seg.link, source?.updatedAt, isRunning, hasError, targetIsWebhook)
        const errText = wireErrors[seg.link.id] ?? seg.link.lastError ?? ''
        const ranText = seg.link.lastRunAt ? ` (ran ${relAgo(seg.link.lastRunAt)})` : ''
        const title =
          fresh === 'error'
            ? `${meta.label} — last run failed${errText ? `: ${errText}` : ''}`
            : fresh === 'running'
              ? `${meta.label} — running…`
              : fresh === 'disabled'
                ? `${meta.label} — off`
                : fresh === 'stale'
                  ? `${meta.label} — stale, source changed since it last ran${ranText}`
                  : fresh === 'never-run'
                    ? `${meta.label} — hasn't run yet`
                    : fresh === 'ok'
                      ? `${meta.label} wire${ranText}`
                      : `${meta.label} wire`
        return (
          <button
            key={`badge-${seg.link.id}`}
            data-link-popover
            data-testid={`wire-badge-${seg.link.id}`}
            data-wire-fresh={fresh ?? undefined}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              handleClickLine(seg.link, { x: seg.mx, y: seg.my })
            }}
            title={title}
            style={{
              position: 'absolute',
              left: seg.mx,
              top: seg.my,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto'
            }}
            className={`relative inline-flex items-center justify-center h-5 w-5 rounded-full border shadow-sm transition-colors ${
              hasError
                ? 'bg-red-500 border-red-400 text-white'
                : reactiveOff
                  ? 'bg-[var(--surface-raised)]/90 border-[var(--edge-firm)] text-[var(--ink-40)]'
                  : 'bg-[var(--surface-raised)]/90 border-accent/50 text-accent'
            } ${isRunning ? 'fb-breathing' : ''}`}
          >
            <Icon name={hasError ? 'error' : meta.icon} size={11} />
            {/* Freshness dot — amber = stale (source changed since last run),
                sky = never run. Positioned inside the already-anchored badge, so
                no separate coordinate tracking (widget-link-owner invariant). */}
            {(fresh === 'stale' || fresh === 'never-run') && (
              <span
                aria-hidden
                data-testid={`wire-fresh-dot-${seg.link.id}`}
                className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-[var(--surface-raised)] ${
                  fresh === 'stale' ? 'bg-amber-400' : 'bg-sky-400'
                }`}
              />
            )}
          </button>
        )
      })}
      {pendingPick && pickLink && (
        <LinkIntentPicker
          pos={{ x: pendingPick.x, y: pendingPick.y }}
          onPick={handlePickIntent}
          onDismiss={onPendingPickDone}
        />
      )}
      {popoverPos && selectedLink && (
        <div
          data-link-popover
          style={{
            position: 'absolute',
            left: popoverPos.x,
            top: popoverPos.y + 18,
            transform: 'translate(-50%, 0)',
            pointerEvents: 'auto'
          }}
        >
          <WireEditor
            link={selectedLink}
            sourceKind={allWidgets.find((w) => w.id === selectedLink.sourceWidgetId)?.kind}
            error={wireErrors[selectedLink.id]}
            running={!!running[selectedLink.id]}
            onChange={(patch) => void updateWire(selectedLink.id, patch)}
            onRunNow={() => runWireNow(selectedLink.id)}
            onUnlink={handleDelete}
            onClose={() => {
              setSelectedLinkId(null)
              setPopoverPos(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

// The intent picker shown at the drop point the moment a connection is drawn.
// It puts the "what should this connection DO?" decision at the moment of intent
// instead of hiding it behind a tiny badge the user has to discover later. The
// link already exists as a passive context wire; choosing here just upgrades it.
function LinkIntentPicker({
  pos,
  onPick,
  onDismiss
}: {
  pos: { x: number; y: number }
  onPick: (type: WireType) => void
  onDismiss: () => void
}): JSX.Element {
  const CHOICES: Array<{ value: WireType; label: string; icon: string; hint: string }> = [
    { value: 'context', label: 'Feed in as context', icon: 'link', hint: 'Use it as background for the target’s AI.' },
    { value: 'transform', label: 'Transform it', icon: 'auto_awesome', hint: 'Run an instruction on it and write the result into the target.' },
    { value: 'mirror', label: 'Keep in sync', icon: 'sync', hint: 'Copy it into the target whenever it changes.' }
  ]
  return (
    <div
      data-link-popover
      data-testid="link-intent-picker"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y + 12,
        transform: 'translate(-50%, 0)',
        pointerEvents: 'auto'
      }}
      className="w-60 rounded-lg bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-xl text-[11px] overflow-hidden"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--edge-soft)]">
        <span className="font-semibold text-[var(--ink-70)]">How should this connect?</span>
        <button onClick={onDismiss} className="text-[var(--ink-40)] hover:text-[var(--ink-70)]" aria-label="Dismiss">
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="p-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            onClick={() => onPick(c.value)}
            data-testid={`link-intent-${c.value}`}
            className="w-full flex items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Icon name={c.icon} size={15} className="text-accent mt-0.5 shrink-0" />
            <span className="flex flex-col">
              <span className="text-[11px] font-medium text-[var(--ink-100)]">{c.label}</span>
              <span className="text-[10px] text-[var(--ink-50)] leading-snug">{c.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// The wire editor popover. Turns a dead line into a live wire: pick the type,
// give a transform its instruction, toggle the kill switch, run it on demand,
// or unlink. Compact so it doesn't dominate the canvas.
function WireEditor({
  link,
  sourceKind,
  error,
  running,
  onChange,
  onRunNow,
  onUnlink,
  onClose
}: {
  link: WidgetLink
  sourceKind?: WidgetKind
  error?: string
  running: boolean
  onChange: (patch: { type?: WireType; verb?: string; enabled?: boolean }) => void
  onRunNow: () => void
  onUnlink: () => void
  onClose: () => void
}): JSX.Element {
  const [verb, setVerb] = useState(link.verb)
  useEffect(() => setVerb(link.verb), [link.verb])
  const recipes = recipesForSource(sourceKind)

  // Recent activity — durable before/after of what this wire has written, so the
  // user can see what the automation did and revert any write in one click.
  const [runs, setRuns] = useState<WireRun[]>([])
  const loadRuns = useCallback(() => {
    void window.api.wireRuns.listByWire(link.id, 6).then(setRuns)
  }, [link.id])
  // Reload on open and whenever a run finishes (running falls back to false).
  useEffect(() => {
    if (!running) loadRuns()
  }, [running, loadRuns])
  const revertRun = useCallback(
    (run: WireRun) => {
      void useWidgetStore
        .getState()
        .update(run.targetWidgetId, { content: run.prevContent })
        .then(loadRuns)
    },
    [loadRuns]
  )

  const TYPES: Array<{ value: WireType; label: string; icon: string; hint: string }> = [
    { value: 'context', label: 'Context', icon: 'link', hint: 'Passive — feeds the target’s AI as related background.' },
    { value: 'transform', label: 'Transform', icon: 'auto_awesome', hint: 'When the source changes, run an instruction and write the result into the target.' },
    { value: 'mirror', label: 'Mirror', icon: 'sync', hint: 'Copy the source’s content into the target on every change.' }
  ]
  const active = TYPES.find((t) => t.value === link.type) ?? TYPES[0]

  return (
    <div
      data-link-popover
      data-testid="wire-editor"
      onMouseDown={(e) => e.stopPropagation()}
      className="w-64 rounded-lg bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-xl text-[11px] overflow-hidden"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--edge-soft)]">
        <span className="font-semibold text-[var(--ink-70)]">Live wire</span>
        <button onClick={onClose} className="text-[var(--ink-40)] hover:text-[var(--ink-70)]" aria-label="Close">
          <Icon name="close" size={12} />
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        <div className="grid grid-cols-3 gap-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => onChange({ type: t.value })}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded border transition-colors ${
                link.type === t.value
                  ? 'border-accent bg-accent/10 text-[var(--ink-100)]'
                  : 'border-[var(--edge-soft)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
              }`}
              data-testid={`wire-type-${t.value}`}
            >
              <Icon name={t.icon} size={14} className={link.type === t.value ? 'text-accent' : ''} />
              <span className="text-[10px]">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[var(--ink-50)] leading-snug">{active.hint}</p>

        {link.type === 'transform' && (
          <div>
            {recipes.length > 0 && (
              <div className="mb-1.5" data-testid="wire-recipes">
                <div className="text-[9px] uppercase tracking-[0.1em] text-[var(--ink-40)] mb-1">
                  {verb.trim() ? 'Recipes' : 'Pick a recipe, or type your own'}
                </div>
                <div className="flex flex-wrap gap-1">
                  {recipes.map((r) => (
                    <button
                      key={r.id}
                      data-testid={`wire-recipe-${r.id}`}
                      title={r.verb}
                      onClick={() => {
                        setVerb(r.verb)
                        onChange({ verb: r.verb })
                        onRunNow()
                      }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-[var(--edge-soft)] text-[10px] text-[var(--ink-70)] hover:border-accent hover:text-accent transition-colors"
                    >
                      <Icon name={r.icon} size={11} />
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input
              type="text"
              value={verb}
              placeholder="e.g. extract action items"
              spellCheck={false}
              onChange={(e) => setVerb(e.target.value)}
              onBlur={() => verb !== link.verb && onChange({ verb })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange({ verb })
                  onRunNow()
                }
              }}
              className="w-full px-2 py-1 rounded bg-[var(--surface-sunken)] border border-[var(--edge-soft)] text-[11px] text-[var(--ink-70)] focus:outline-none focus:border-accent"
              data-testid="wire-verb-input"
            />
            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                onClick={() => {
                  onChange({ verb })
                  onRunNow()
                }}
                disabled={running || !verb.trim()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent text-white text-[10px] disabled:opacity-50"
                data-testid="wire-run-now"
              >
                <Icon name={running ? 'hourglass_empty' : 'play_arrow'} size={12} />
                {running ? 'Running…' : 'Run now'}
              </button>
              <label className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-70)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={link.enabled}
                  onChange={(e) => onChange({ enabled: e.target.checked })}
                  className="accent-accent"
                  data-testid="wire-enabled"
                />
                Auto-run
              </label>
            </div>
          </div>
        )}

        {link.type === 'mirror' && (
          <label className="inline-flex items-center gap-1.5 text-[10px] text-[var(--ink-70)] cursor-pointer">
            <input
              type="checkbox"
              checked={link.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="accent-accent"
              data-testid="wire-enabled"
            />
            Keep target mirrored
          </label>
        )}

        {error && <p className="text-[10px] text-red-600 dark:text-red-400 leading-snug">{error}</p>}

        {runs.length > 0 && (
          <div className="border-t border-[var(--edge-soft)] pt-2" data-testid="wire-activity">
            <div className="text-[10px] font-semibold text-[var(--ink-50)] mb-1">Recent activity</div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {runs.map((run) => (
                <li
                  key={run.id}
                  data-testid={`wire-run-${run.id}`}
                  className="rounded border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--ink-70)] truncate">
                      {run.wireType === 'mirror' ? 'Copied from' : run.wireType === 'transform' ? 'Wrote from' : 'Delivered from'}{' '}
                      <span className="text-[var(--ink-100)]">{run.sourceLabel}</span>
                    </span>
                    <span className="text-[9px] text-[var(--ink-40)] shrink-0">{relAgo(run.at)}</span>
                  </div>
                  {run.nextContent.trim() && (
                    <div className="mt-0.5 text-[9px] text-[var(--ink-50)] leading-snug line-clamp-2 break-words">
                      {run.nextContent.slice(0, 120)}
                    </div>
                  )}
                  <button
                    onClick={() => revertRun(run)}
                    data-testid={`wire-run-revert-${run.id}`}
                    className="mt-1 inline-flex items-center gap-1 text-[9px] text-[var(--ink-50)] hover:text-accent transition-colors"
                    title="Restore the target's content from just before this write"
                  >
                    <Icon name="undo" size={11} />
                    Revert this write
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onUnlink}
          className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded border border-[var(--edge-soft)] text-[var(--ink-50)] hover:text-red-600 hover:border-red-300 transition-colors"
          data-testid="wire-unlink"
        >
          <Icon name="link_off" size={12} />
          Unlink
        </button>
      </div>
    </div>
  )
}
