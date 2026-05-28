import { useContext, useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import type { PinZone, Widget } from '@shared/types'
import { PIN_ZONE_ICONS, PIN_ZONE_LABELS } from '../../lib/pinLayout'
import { useWidgetStore } from '../../stores/widgets'
import {
  computeSectionFrame,
  effectiveLayout,
  findNonOverlapPosition,
  SECTION_PADDING
} from '../../lib/sectionGeometry'
import { chimeIn, chimeOut } from '../../lib/audioBeep'
import { useZonePosition } from '../../lib/pinLayout'
import { LinkDragContext } from '../../lib/linkDragContext'
import Icon from '../Icon'
import AgeHalo from '../AgeHalo'
import { SectionLayoutContext } from './sectionLayoutContext'

const EJECT_THRESHOLD = 40
const HOVER_THROTTLE_MS = 60

interface Props {
  widget: Widget
  children: React.ReactNode
  headerLabel: string
  headerAccent?: string
  draggableHandleClass?: string
  // When this widget is zone-pinned (pinnedZone !== null), Canvas computes
  // the screen-space position based on the zone + neighbouring same-zone
  // pins and passes it down. Overrides the legacy pinnedScreenX/Y path.
  zonePosition?: { x: number; y: number; width: number; height: number }
}

export default function WidgetFrame({
  widget,
  children,
  headerLabel,
  headerAccent = 'bg-stone-200/70',
  draggableHandleClass = 'widget-handle',
  zonePosition: zonePositionProp
}: Props): JSX.Element {
  // Pull from the prop first (escape hatch for callers that want to drive
  // position explicitly), then fall back to the PinLayoutContext provided
  // by Canvas's pinned-layer. The context approach avoids prop-drilling
  // through every kind-specific widget component.
  const contextZonePosition = useZonePosition(widget.id)
  const zonePosition = zonePositionProp ?? contextZonePosition
  const update = useWidgetStore((s) => s.update)
  const remove = useWidgetStore((s) => s.remove)
  const bringToFront = useWidgetStore((s) => s.bringToFront)
  const setFocused = useWidgetStore((s) => s.setFocused)
  const setActive = useWidgetStore((s) => s.setActive)
  const togglePin = useWidgetStore((s) => s.togglePin)
  const pinToZone = useWidgetStore((s) => s.pinToZone)
  const unpinWidget = useWidgetStore((s) => s.unpinWidget)
  const setHoveredSection = useWidgetStore((s) => s.setHoveredSection)
  const focusOn = useWidgetStore((s) => s.focusOn)
  const setDragOverride = useWidgetStore((s) => s.setDragOverride)
  const [pinPickerOpen, setPinPickerOpen] = useState(false)
  const isActive = useWidgetStore((s) => s.activeWidgetId === widget.id)
  const zoom = useWidgetStore((s) => s.zoom)
  const allWidgets = useWidgetStore((s) => s.widgets)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)
  const lastHoverCheck = useRef(0)
  // Track recent drag-end so the click event that fires on mouseup at the end
  // of a drag doesn't trigger any click handlers (which would, among other
  // things, cause the canvas to pan-center on the widget — making it look
  // like "the screen tracks away from where I dropped").
  const dragJustEnded = useRef(0)

  const layoutCtx = useContext(SectionLayoutContext)
  const sectionLayout = layoutCtx ? layoutCtx.layout : 'free'
  const isInControlledLayout = layoutCtx !== null && sectionLayout !== 'free'
  const linkDrag = useContext(LinkDragContext)

  const parent =
    widget.parentSectionId !== null
      ? allWidgets.find((w) => w.id === widget.parentSectionId) ?? null
      : null
  const isChildOfSection = parent !== null
  const isPinned = widget.pinned && !isChildOfSection
  const isSection = widget.kind === 'section'

  const effectiveScale = isChildOfSection ? (parent?.pinned ? 1 : zoom) : isPinned ? 1 : zoom

  const defaultX = isPinned ? widget.pinnedScreenX ?? widget.x : widget.x
  const defaultY = isPinned ? widget.pinnedScreenY ?? widget.y : widget.y

  function findHoveredSection(canvasX: number, canvasY: number): string | null {
    if (isChildOfSection || isPinned || isSection) return null
    const sections = allWidgets.filter((w) => w.kind === 'section' && !w.pinned)
    for (const s of sections) {
      const sChildren = allWidgets.filter((w) => w.parentSectionId === s.id)
      const sFrame = computeSectionFrame(sChildren, effectiveLayout(s.layout))
      if (
        canvasX >= s.x &&
        canvasX <= s.x + sFrame.width &&
        canvasY >= s.y &&
        canvasY <= s.y + sFrame.height
      ) {
        return s.id
      }
    }
    return null
  }

  // Compute a widget's EFFECTIVE bounds for overlap-detection. Sections store
  // a base width/height but their visual bounds extend to fit their children,
  // so we use computeSectionFrame for them. For everything else, the stored
  // width/height is the visual size.
  function effectiveBounds(
    w: Widget,
    all: Widget[]
  ): { x: number; y: number; width: number; height: number } {
    if (w.kind === 'section') {
      const children = all.filter((c) => c.parentSectionId === w.id)
      const frame = computeSectionFrame(children, effectiveLayout(w.layout))
      return { x: w.x, y: w.y, width: frame.width, height: frame.height }
    }
    return { x: w.x, y: w.y, width: w.width, height: w.height }
  }

  // findNonOverlapPosition expects an array of Widget for the "existing" set,
  // but we need to feed it effective bounds (sections especially). Wrap each
  // sibling in a synthetic Widget-shaped object whose w/h are the effective
  // ones — the helper only reads x/y/width/height so this is safe.
  function effectiveSiblingsForCheck(siblings: Widget[], all: Widget[]): Widget[] {
    return siblings.map((s) => {
      if (s.kind !== 'section') return s
      const eb = effectiveBounds(s, all)
      return { ...s, width: eb.width, height: eb.height }
    })
  }

  function commitDrop(newX: number, newY: number): void {
    // Read the LATEST store state — `allWidgets` from useWidgetStore is the
    // last-render snapshot. Two rapid drops on a fresh section both saw an
    // empty children list and landed on top of each other; reading
    // .getState() here closes that race.
    const latestWidgets = useWidgetStore.getState().widgets

    // Whether the snap relocated the widget far enough that Rnd's internal
    // drag-end position no longer matches the store. Used to (a) bump
    // layoutVersion so Rnd re-mounts at the snapped position, and (b) pan
    // the canvas so the widget remains visible after the snap.
    const SNAP_THRESHOLD = 4
    const snappedAway = (rawX: number, rawY: number, placedX: number, placedY: number): boolean =>
      Math.abs(rawX - placedX) > SNAP_THRESHOLD || Math.abs(rawY - placedY) > SNAP_THRESHOLD

    if (isChildOfSection && parent) {
      const parentChildren = latestWidgets.filter((w) => w.parentSectionId === parent.id)
      const parentLayout = effectiveLayout(parent.layout)
      const parentFrame = computeSectionFrame(parentChildren, parentLayout)
      const contentW = parentFrame.width - 2 * SECTION_PADDING
      const contentH = parentFrame.height - 2 * SECTION_PADDING
      const ejected =
        newX < -EJECT_THRESHOLD ||
        newY < -EJECT_THRESHOLD ||
        newX > contentW + EJECT_THRESHOLD ||
        newY > contentH + EJECT_THRESHOLD
      if (ejected) {
        // Ejecting back to canvas — push away from any top-level overlap.
        const canvasX = Math.round(parent.x + SECTION_PADDING + newX)
        const canvasY = Math.round(parent.y + SECTION_PADDING + newY)
        const topLevelSiblings = latestWidgets.filter(
          (w) => w.id !== widget.id && !w.pinned && !w.parentSectionId
        )
        const placed = findNonOverlapPosition(
          { x: canvasX, y: canvasY, width: widget.width, height: widget.height },
          effectiveSiblingsForCheck(topLevelSiblings, latestWidgets)
        )
        chimeOut()
        // The store's `update` does an optimistic synchronous `set` first,
        // then awaits the IPC. Calling bumpLayout()/focusOn() synchronously
        // right after means the new render cycle picks up BOTH the snapped
        // position AND the new key — so Rnd remounts at placed.x/y without
        // a flicker. Awaiting the IPC (.then) is too late: the widget is
        // visually stuck at the drop point for that 50-200ms window.
        void update(widget.id, {
          parentSectionId: null,
          x: placed.x,
          y: placed.y
        })
        bumpLayout()
        focusOn(widget.id)
      } else {
        // Moving within the same section. In free layout, snap away from
        // siblings (excluding self). In stack mode, allow overlap — that's
        // the whole point of stacks. Other layouts are auto-arranged so we
        // never reach here.
        const siblings = parentChildren.filter((w) => w.id !== widget.id)
        const rawX = Math.max(0, Math.round(newX))
        const rawY = Math.max(0, Math.round(newY))
        const placed =
          parentLayout === 'free'
            ? findNonOverlapPosition(
                { x: rawX, y: rawY, width: widget.width, height: widget.height },
                siblings
              )
            : { x: rawX, y: rawY }
        const moved = snappedAway(rawX, rawY, placed.x, placed.y)
        void update(widget.id, { x: placed.x, y: placed.y })
        if (moved) {
          bumpLayout()
          focusOn(widget.id)
        }
      }
      return
    }

    if (isPinned) {
      void update(widget.id, {
        pinnedScreenX: Math.round(newX),
        pinnedScreenY: Math.round(newY)
      })
      return
    }

    const targetSectionId = findHoveredSection(newX, newY)
    if (targetSectionId) {
      const s = latestWidgets.find((w) => w.id === targetSectionId)
      if (s) {
        const sChildren = latestWidgets.filter((w) => w.parentSectionId === s.id)
        const sLayout = effectiveLayout(s.layout)
        const rawX = Math.max(0, Math.round(newX - s.x - SECTION_PADDING))
        const rawY = Math.max(0, Math.round(newY - s.y - SECTION_PADDING))
        // Free + stacks both allow manual positioning, but only Free rejects
        // overlap. Stacks deliberately permit overlap (it's a stack).
        const placed =
          sLayout === 'free'
            ? findNonOverlapPosition(
                { x: rawX, y: rawY, width: widget.width, height: widget.height },
                sChildren.filter((c) => c.id !== widget.id)
              )
            : { x: rawX, y: rawY }
        chimeIn()
        void update(widget.id, {
          parentSectionId: s.id,
          x: placed.x,
          y: placed.y
        })
        bumpLayout()
        focusOn(widget.id)
        return
      }
    }

    // Canvas-level drop. Push the widget away from every other top-level
    // widget on the canvas — sections + free widgets. This is the
    // reverse-magnetic behaviour: widgets never overlap on the desk.
    const rawX = Math.round(newX)
    const rawY = Math.round(newY)
    const topLevelSiblings = latestWidgets.filter(
      (w) => w.id !== widget.id && !w.pinned && !w.parentSectionId
    )
    const placed = findNonOverlapPosition(
      { x: rawX, y: rawY, width: widget.width, height: widget.height },
      effectiveSiblingsForCheck(topLevelSiblings, latestWidgets)
    )
    const moved = snappedAway(rawX, rawY, placed.x, placed.y)
    void update(widget.id, { x: placed.x, y: placed.y })
    if (moved) {
      // Rnd is uncontrolled for free widgets — without a key change it
      // would keep its internal drop-position and visually ignore the
      // snap. Bumping layoutVersion forces a re-mount at placed.x/y.
      bumpLayout()
      // Pan the canvas so the widget remains visible at its snapped spot
      // (the user dropped it somewhere overlapping; we want them to see
      // where it actually ended up).
      focusOn(widget.id)
    }
  }

  // Zone-pinned widgets are controlled too — their position+size come from
  // the pinLayout computation, not from Rnd's internal drag state. This
  // means dragging a zone-pinned widget is a no-op (you can't drag a zone
  // pin — it'd defeat the auto-dock); to move it the user picks a different
  // zone or unpins.
  const isZonePinned = widget.pinned && widget.pinnedZone !== null && zonePosition
  const useControlled = isInControlledLayout || Boolean(isZonePinned)
  const controlledPos = isZonePinned
    ? { x: zonePosition!.x, y: zonePosition!.y }
    : isInControlledLayout
      ? layoutCtx?.position
      : undefined
  const controlledSize = isZonePinned
    ? { width: zonePosition!.width, height: zonePosition!.height }
    : isInControlledLayout
      ? layoutCtx?.size
      : undefined
  const dragDisabled = useControlled

  return (
    <Rnd
      default={
        useControlled
          ? undefined
          : {
              x: defaultX,
              y: defaultY,
              width: widget.width,
              height: widget.height
            }
      }
      position={controlledPos}
      size={controlledSize}
      scale={effectiveScale}
      style={{ zIndex: widget.zIndex, position: 'absolute', pointerEvents: 'auto' }}
      minWidth={180}
      minHeight={120}
      dragHandleClassName={draggableHandleClass}
      disableDragging={dragDisabled}
      enableResizing={
        dragDisabled
          ? false
          : {
              top: true,
              right: true,
              bottom: true,
              left: true,
              topRight: true,
              bottomRight: true,
              bottomLeft: true,
              topLeft: true
            }
      }
      onDragStart={() => {
        void bringToFront(widget.id)
        setActive(widget.id)
      }}
      onDrag={(_, d) => {
        // Live-track the dragging widget's position so the inter-widget
        // links overlay can keep its endpoints attached to the widget in
        // real time (rather than only updating on drop, which would let
        // the user drag a widget across the canvas while its links
        // visually trail behind). Free-positioned widgets only — section
        // children and pinned widgets don't make sense here.
        if (!isChildOfSection && !isPinned) {
          setDragOverride({ widgetId: widget.id, x: d.x, y: d.y })
        }
        const now = performance.now()
        if (now - lastHoverCheck.current < HOVER_THROTTLE_MS) return
        lastHoverCheck.current = now
        if (isChildOfSection || isPinned || isSection) return
        const target = findHoveredSection(d.x, d.y)
        setHoveredSection(target)
      }}
      onDragStop={(_, d) => {
        setHoveredSection(null)
        setDragOverride(null)
        commitDrop(d.x, d.y)
        // Mark the mouseup as drag-end so the click event that follows
        // doesn't run our onClick activation logic.
        dragJustEnded.current = performance.now()
      }}
      onResizeStart={() => setActive(widget.id)}
      onResizeStop={(_, __, ref, ___, pos) => {
        const newW = ref.offsetWidth
        const newH = ref.offsetHeight
        if (isChildOfSection) {
          void update(widget.id, {
            width: newW,
            height: newH,
            x: Math.max(0, Math.round(pos.x)),
            y: Math.max(0, Math.round(pos.y))
          })
        } else if (isPinned) {
          void update(widget.id, {
            width: newW,
            height: newH,
            pinnedScreenX: Math.round(pos.x),
            pinnedScreenY: Math.round(pos.y)
          })
        } else {
          void update(widget.id, {
            width: newW,
            height: newH,
            x: Math.round(pos.x),
            y: Math.round(pos.y)
          })
        }
      }}
    >
      <AgeHalo createdAt={widget.createdAt} variant="widget" />
      <div
        data-widget-id={widget.id}
        onMouseDownCapture={() => setActive(widget.id)}
        onClick={(e) => {
          e.stopPropagation()
          // Suppress the click that fires immediately after a drag-end —
          // react-rnd doesn't natively distinguish them.
          if (performance.now() - dragJustEnded.current < 250) return
          // Activate the widget but DON'T center the canvas on it. The user
          // can already see the widget they just clicked — centering would
          // pan the world for no benefit. Centering is now reserved for
          // explicit BringMeBack + "open from outside the viewport" flows.
          setActive(widget.id)
        }}
        className={`h-full w-full flex flex-col rounded-[12px] overflow-hidden border bg-white dark:bg-stone-900 fb-spring-snap ${
          isActive
            ? 'border-[rgb(var(--accent)/0.5)] widget-glow'
            : isPinned
              ? 'border-amber-400/60'
              : isChildOfSection
                ? 'border-[color:var(--edge-soft)]'
                : 'border-[color:var(--edge-soft)]'
        }`}
        style={{
          // Light-aware cast shadow + inset highlight on top edge. Tightens
          // when active (focus brings the widget visually closer to the user).
          boxShadow: isActive
            ? undefined // .widget-glow owns the active state
            : isChildOfSection
              ? 'var(--shadow-soft), var(--shadow-inset-highlight)'
              : 'var(--shadow-cast), var(--shadow-inset-highlight)',
          transitionProperty: 'box-shadow, transform, border-color'
        }}
      >
        <div
          className={`${draggableHandleClass} ${headerAccent} flex items-center justify-between px-2 py-1 cursor-move select-none border-b border-[color:var(--edge-soft)] backdrop-blur-sm`}
        >
          <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-stone-700 dark:text-stone-300 truncate flex items-center gap-1.5">
            {isActive && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"
                title="Active — wheel scrolls this widget"
              />
            )}
            {isPinned && (
              <Icon name="push_pin" size={11} filled className="text-amber-600" />
            )}
            {isChildOfSection && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!parent) return
                  // Eject: convert relative position to canvas coords
                  const canvasX = Math.round(parent.x + SECTION_PADDING + widget.x)
                  const canvasY = Math.round(parent.y + SECTION_PADDING + widget.y)
                  chimeOut()
                  void update(widget.id, {
                    parentSectionId: null,
                    x: canvasX,
                    y: canvasY
                  }).then(() => bumpLayout())
                }}
                title="Remove from section (eject to canvas)"
                className="text-stone-500 hover:text-amber-700 transition-colors"
              >
                <Icon name="layers_clear" size={11} />
              </button>
            )}
            {headerLabel}
          </span>
          <div className="flex items-center gap-0.5">
            {!isChildOfSection && !isPinned && linkDrag && (
              <button
                // mousedown stopPropagation prevents react-rnd from
                // treating this click as a drag-handle press (the button
                // lives inside the .widget-handle div). The actual arming
                // happens on click so we don't fight the browser's natural
                // click-vs-drag detection.
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  linkDrag.start(widget.id)
                }}
                className="h-5 w-5 rounded inline-flex items-center justify-center text-stone-500 hover:bg-stone-300/60 hover:text-accent cursor-cell"
                aria-label="Link to another widget"
                title="Click, then click another widget to connect them"
              >
                <Icon name="hub" size={13} />
              </button>
            )}
            {!isChildOfSection && (
              <PinControl
                isPinned={isPinned}
                pinnedZone={widget.pinnedZone}
                onPickZone={(zone) => {
                  void pinToZone(widget.id, zone)
                }}
                onUnpin={() => {
                  // Legacy free-pin widgets fall through to togglePin (which
                  // knows how to convert screen-pos → canvas-pos). Zone pins
                  // use unpinWidget which clears the flags cleanly.
                  if (widget.pinnedZone !== null) {
                    void unpinWidget(widget.id)
                  } else {
                    void togglePin(widget.id)
                  }
                }}
                open={pinPickerOpen}
                setOpen={setPinPickerOpen}
              />
            )}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setFocused(widget.id)
              }}
              className="h-5 w-5 rounded inline-flex items-center justify-center text-stone-500 hover:bg-stone-300/60 hover:text-stone-900"
              aria-label="Focus widget"
              title="Open in focus mode"
            >
              <Icon name="open_in_full" size={13} />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('Remove from the desk?')) void remove(widget.id)
              }}
              className="h-5 w-5 rounded inline-flex items-center justify-center text-stone-500 hover:bg-red-100 hover:text-red-700"
              aria-label="Remove widget"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </Rnd>
  )
}

// ── Pin control — button + zone picker popover ──────────────────────────────
//
// Closed state: a pin icon — amber-filled if currently pinned, stone outline
// if not. Click toggles the popover open.
//
// Open state: a 2x2 grid of zone targets (TL/TR/BL/BR). Each cell shows a
// small corner glyph. Picking a zone pins the widget there (auto-stacks
// with same-zone neighbours). When already pinned, an extra "Unpin" button
// appears at the bottom.
//
// Closes on click-outside via a mousedown listener on document. Stops
// propagation up so the canvas pan / widget click logic doesn't fire when
// the popover is open.

interface PinControlProps {
  isPinned: boolean
  pinnedZone: PinZone | null
  open: boolean
  setOpen: (v: boolean) => void
  onPickZone: (zone: PinZone) => void
  onUnpin: () => void
}

function PinControl({
  isPinned,
  pinnedZone,
  open,
  setOpen,
  onPickZone,
  onUnpin
}: PinControlProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, setOpen])

  return (
    <div ref={ref} className="relative">
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className={`h-5 w-5 rounded inline-flex items-center justify-center transition-colors ${
          isPinned
            ? 'text-amber-600 hover:bg-amber-100'
            : 'text-stone-500 hover:bg-stone-300/60 hover:text-stone-900'
        }`}
        aria-label={isPinned ? 'Pin options' : 'Pin to screen'}
        title={
          isPinned
            ? pinnedZone
              ? `Pinned to ${PIN_ZONE_LABELS[pinnedZone]} — click to change`
              : 'Pinned (legacy) — click to change'
            : 'Pin to screen — pick a corner zone'
        }
      >
        <Icon name="push_pin" size={13} filled={isPinned} />
      </button>
      {open && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 z-50 w-44 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg p-2 cursor-default"
        >
          <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            Pin to zone
          </div>
          <div className="grid grid-cols-2 gap-1">
            {(['tl', 'tr', 'bl', 'br'] as PinZone[]).map((z) => {
              const active = isPinned && pinnedZone === z
              return (
                <button
                  key={z}
                  onClick={() => {
                    onPickZone(z)
                    setOpen(false)
                  }}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded border text-[10px] transition-colors ${
                    active
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                      : 'border-stone-200 dark:border-stone-700 hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  <Icon name={PIN_ZONE_ICONS[z]} size={14} />
                  <span>{PIN_ZONE_LABELS[z]}</span>
                </button>
              )
            })}
          </div>
          {isPinned && (
            <button
              onClick={() => {
                onUnpin()
                setOpen(false)
              }}
              className="w-full mt-1.5 text-[11px] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded px-2 py-1 text-left inline-flex items-center gap-1"
            >
              <Icon name="close" size={11} />
              <span>Unpin — return to canvas</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
