import { useContext, useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import type { SectionLayout, Widget } from '@shared/types'
import { useWidgetStore } from '../../stores/widgets'
import { LinkDragContext } from '../../lib/linkDragContext'
import {
  computeLayoutCells,
  computeSectionFrame,
  effectiveLayout,
  findNonOverlapPosition,
  SECTION_PADDING,
  type LayoutCell
} from '../../lib/sectionGeometry'
import { catalogFor } from '../../lib/widgetCatalog'
import { chimeOut } from '../../lib/audioBeep'
import Icon from '../Icon'
import AgeHalo from '../AgeHalo'
import { SectionLayoutContext } from './sectionLayoutContext'

const SECTION_COLORS = [
  '#737373',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6'
]

const LAYOUT_OPTIONS: Array<{ value: SectionLayout; icon: string; label: string }> = [
  { value: 'free', icon: 'open_with', label: 'Free' },
  { value: 'grid', icon: 'grid_view', label: 'Grid' },
  { value: 'stacks', icon: 'layers', label: 'Stacks' },
  { value: 'icons', icon: 'apps', label: 'Icons' },
  { value: 'list', icon: 'view_list', label: 'List' }
]

interface Props {
  widget: Widget
  inline?: boolean
  renderChild?: (child: Widget) => JSX.Element | null
}

export default function SectionWidget({
  widget,
  inline = false,
  renderChild
}: Props): JSX.Element | null {
  const update = useWidgetStore((s) => s.update)
  const remove = useWidgetStore((s) => s.remove)
  const setActive = useWidgetStore((s) => s.setActive)
  const focusOn = useWidgetStore((s) => s.focusOn)
  const setDragOverride = useWidgetStore((s) => s.setDragOverride)
  const linkDrag = useContext(LinkDragContext)
  const setFocused = useWidgetStore((s) => s.setFocused)
  const togglePin = useWidgetStore((s) => s.togglePin)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)
  const zoom = useWidgetStore((s) => s.zoom)
  const allWidgets = useWidgetStore((s) => s.widgets)
  const layoutVersion = useWidgetStore((s) => s.layoutVersion)
  const isActive = useWidgetStore((s) => s.activeWidgetId === widget.id)
  const isHovered = useWidgetStore((s) => s.hoveredSectionId === widget.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(widget.title || 'Section')
  const [receivedPulse, setReceivedPulse] = useState(false)
  const rndRef = useRef<Rnd | null>(null)
  const prevChildCountRef = useRef(0)
  const lastAppliedSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    setDraft(widget.title || 'Section')
  }, [widget.id, widget.title])

  const children = allWidgets.filter((w) => w.parentSectionId === widget.id)
  const layout = effectiveLayout(widget.layout)
  const frame = computeSectionFrame(children, layout)
  const contentW = frame.width - 2 * SECTION_PADDING

  useEffect(() => {
    if (children.length > prevChildCountRef.current) {
      setReceivedPulse(true)
      const t = window.setTimeout(() => setReceivedPulse(false), 460)
      prevChildCountRef.current = children.length
      return () => window.clearTimeout(t)
    }
    prevChildCountRef.current = children.length
    return undefined
  }, [children.length])

  useEffect(() => {
    const r = rndRef.current
    if (!r) return
    if (
      lastAppliedSize.current.w !== frame.width ||
      lastAppliedSize.current.h !== frame.height
    ) {
      lastAppliedSize.current = { w: frame.width, h: frame.height }
      const updateSize = (r as unknown as { updateSize?: (s: { width: number; height: number }) => void }).updateSize
      if (typeof updateSize === 'function') {
        updateSize.call(r, { width: frame.width, height: frame.height })
      }
    }
  }, [frame.width, frame.height])

  if (inline) return null

  const color = widget.color ?? SECTION_COLORS[0]
  const isPinned = widget.pinned
  const posX = isPinned ? widget.pinnedScreenX ?? widget.x : widget.x
  const posY = isPinned ? widget.pinnedScreenY ?? widget.y : widget.y

  const showSolid = isActive || isHovered || receivedPulse
  const showHoverGlow = isHovered

  function commitTitle(): void {
    const next = draft.trim() || 'Section'
    if (next !== widget.title) void update(widget.id, { title: next })
    setEditing(false)
  }

  const cells = computeLayoutCells(layout, children, contentW)

  return (
    <Rnd
      ref={(r) => {
        rndRef.current = r as Rnd | null
      }}
      position={{ x: posX, y: posY }}
      size={{ width: frame.width, height: frame.height }}
      scale={isPinned ? 1 : zoom}
      style={{ zIndex: 0, position: 'absolute', pointerEvents: 'auto' }}
      enableResizing={false}
      dragHandleClassName="section-handle"
      onDragStart={() => setActive(widget.id)}
      onDrag={(_, d) => {
        // Mirror WidgetFrame's behaviour — push the live position into the
        // shared drag-override slot so the link overlay endpoints follow
        // the section as it's dragged. Skipped for pinned sections (which
        // don't participate in linking).
        if (!isPinned) {
          setDragOverride({ widgetId: widget.id, x: d.x, y: d.y })
        }
      }}
      onDragStop={(_, d) => {
        setDragOverride(null)
        if (isPinned) {
          void update(widget.id, {
            pinnedScreenX: Math.round(d.x),
            pinnedScreenY: Math.round(d.y)
          })
          return
        }
        // Sections don't go through WidgetFrame's commitDrop — they have
        // their own Rnd. So we duplicate the overlap-avoidance logic here
        // so sections also respect the reverse-magnetic rule against free
        // widgets and other sections on the canvas.
        const latestWidgets = useWidgetStore.getState().widgets
        const rawX = Math.round(d.x)
        const rawY = Math.round(d.y)
        const siblings = latestWidgets.filter(
          (w) => w.id !== widget.id && !w.pinned && !w.parentSectionId
        )
        const effSiblings = siblings.map((s) => {
          if (s.kind !== 'section') return s
          const sChildren = latestWidgets.filter((c) => c.parentSectionId === s.id)
          const sFrame = computeSectionFrame(sChildren, effectiveLayout(s.layout))
          return { ...s, width: sFrame.width, height: sFrame.height }
        })
        const placed = findNonOverlapPosition(
          { x: rawX, y: rawY, width: frame.width, height: frame.height },
          effSiblings
        )
        void update(widget.id, { x: placed.x, y: placed.y })
        const moved = Math.abs(rawX - placed.x) > 4 || Math.abs(rawY - placed.y) > 4
        if (moved) {
          // SectionWidget's Rnd is controlled (position prop) so it will
          // visually follow the store update automatically — no need to
          // remount. Pan the canvas so the user can see where the section
          // ended up after the snap.
          bumpLayout()
          focusOn(widget.id)
        }
      }}
    >
      <AgeHalo createdAt={widget.createdAt} variant="section" />
      <div
        data-widget-id={widget.id}
        onClick={(e) => {
          e.stopPropagation()
          focusOn(widget.id)
        }}
        className={`h-full w-full relative ${receivedPulse ? 'section-receive-pulse' : ''}`}
      >
        <div
          className={`absolute inset-0 rounded-md pointer-events-none transition-all duration-150 ${
            showSolid ? 'border-[3px] border-solid' : 'border-2 border-dashed'
          }`}
          style={{
            borderColor: color,
            backgroundColor: `${color}${showHoverGlow ? '22' : '10'}`,
            boxShadow: showHoverGlow ? `0 0 24px ${color}55, inset 0 0 0 1px ${color}33` : undefined
          }}
        />

        <div
          className="section-handle absolute top-0 left-3 -translate-y-1/2 px-2 py-0.5 rounded-md shadow flex items-center gap-1.5 cursor-move select-none flex-wrap max-w-[calc(100%-24px)]"
          style={{ backgroundColor: color }}
        >
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitTitle}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setDraft(widget.title || 'Section')
                  setEditing(false)
                }
              }}
              className="bg-white/95 text-stone-900 px-1.5 py-0.5 rounded text-xs w-40 focus:outline-none"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
              className="text-xs font-medium text-white tracking-wide px-0.5"
              title="Double-click to rename"
            >
              {widget.title || 'Section'}
            </span>
          )}

          <span
            className="text-[10px] text-white/70 ml-0.5"
            title="Children in this section"
          >
            {children.length}
          </span>

          <div
            className="flex items-center gap-0.5 pl-1.5 border-l border-white/30"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation()
                  void update(widget.id, { layout: opt.value })
                  bumpLayout()
                }}
                title={`Layout: ${opt.label}`}
                className={`h-4 w-4 inline-flex items-center justify-center rounded ${
                  opt.value === layout ? 'bg-white/30' : 'hover:bg-white/15'
                }`}
              >
                <Icon name={opt.icon} size={11} className="text-white" />
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-0.5 pl-1.5 border-l border-white/30"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {SECTION_COLORS.map((c) => (
              <button
                key={c}
                onClick={(e) => {
                  e.stopPropagation()
                  void update(widget.id, { color: c })
                }}
                title={`Color ${c}`}
                className={`h-2.5 w-2.5 rounded-full border transition-transform ${
                  c === color ? 'border-white scale-125' : 'border-white/40 hover:scale-125'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {!isPinned && linkDrag && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                linkDrag.start(widget.id)
              }}
              className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-white/20 cursor-cell"
              title="Click, then click another widget to connect them"
              aria-label="Link from this section"
            >
              <Icon name="hub" size={11} className="text-white" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              void togglePin(widget.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-white/20"
            title={isPinned ? 'Unpin from screen' : 'Pin to screen'}
            aria-label={isPinned ? 'Unpin' : 'Pin'}
          >
            <Icon name="push_pin" size={11} filled={isPinned} className="text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              const msg =
                children.length > 0
                  ? `Remove section "${widget.title || 'Section'}"? Its ${children.length} widget(s) will be ejected and remain on the canvas.`
                  : 'Remove this section?'
              if (confirm(msg)) {
                for (const c of children) {
                  void update(c.id, {
                    parentSectionId: null,
                    x: Math.round(widget.x + SECTION_PADDING + c.x),
                    y: Math.round(widget.y + SECTION_PADDING + c.y)
                  })
                }
                void remove(widget.id)
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-white/20"
            title="Remove section"
            aria-label="Remove"
          >
            <Icon name="close" size={11} className="text-white" />
          </button>
        </div>

        {/* Children content area */}
        <div
          className="absolute"
          style={{
            top: SECTION_PADDING,
            left: SECTION_PADDING,
            right: SECTION_PADDING,
            bottom: SECTION_PADDING,
            pointerEvents: 'none'
          }}
        >
          <div className="relative w-full h-full">
            {layout === 'icons' || layout === 'list' ? (
              children.map((c, i) => (
                <CompactChildView
                  key={`${c.id}-${layoutVersion}`}
                  child={c}
                  cell={cells[i]}
                  layout={layout}
                  color={color}
                  onOpen={() => setFocused(c.id)}
                  onEject={() => {
                    chimeOut()
                    const canvasX = Math.round(widget.x + SECTION_PADDING + c.x)
                    const canvasY = Math.round(widget.y + SECTION_PADDING + c.y)
                    void update(c.id, {
                      parentSectionId: null,
                      x: canvasX,
                      y: canvasY
                    }).then(() => bumpLayout())
                  }}
                />
              ))
            ) : (
              renderChild &&
              children.map((c, i) => (
                <SectionLayoutContext.Provider
                  key={`${c.id}-${layoutVersion}`}
                  value={{
                    layout,
                    position: { x: cells[i].x, y: cells[i].y },
                    size: { width: cells[i].width, height: cells[i].height }
                  }}
                >
                  <div style={{ pointerEvents: 'auto' }}>{renderChild(c)}</div>
                </SectionLayoutContext.Provider>
              ))
            )}

            {isHovered && children.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium text-white shadow"
                  style={{ backgroundColor: color }}
                >
                  Drop to add to section
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Rnd>
  )
}

interface CompactProps {
  child: Widget
  cell: LayoutCell
  layout: SectionLayout
  color: string
  onOpen: () => void
  onEject: () => void
}

function CompactChildView({ child, cell, layout, color, onOpen, onEject }: CompactProps): JSX.Element {
  const entry = catalogFor(child.kind)
  const title =
    child.title ||
    (child.content
      ? layout === 'list'
        ? child.content.slice(0, 80)
        : entry?.label ?? child.kind
      : entry?.label ?? child.kind)

  if (layout === 'list') {
    return (
      <div
        style={{
          position: 'absolute',
          left: cell.x,
          top: cell.y,
          width: cell.width,
          height: cell.height,
          pointerEvents: 'auto'
        }}
        className="group flex items-center gap-2 px-3 rounded-md bg-white border border-stone-200 hover:border-stone-400 hover:shadow-sm cursor-pointer transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
      >
        <span
          className="h-7 w-7 rounded inline-flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon name={entry?.icon ?? 'apps'} size={16} className="" style={{ color }} />
        </span>
        <span className="text-sm text-stone-900 truncate flex-1">{title}</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEject()
          }}
          className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-amber-700 transition-opacity"
          title="Remove from section"
        >
          <Icon name="layers_clear" size={14} />
        </button>
      </div>
    )
  }

  // icons mode — use the computed cell so section frame and child positions always agree
  return (
    <div
      style={{
        position: 'absolute',
        left: cell.x,
        top: cell.y,
        width: cell.width,
        height: cell.height,
        pointerEvents: 'auto'
      }}
      className="group"
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
        className="w-full h-full flex flex-col items-center justify-center gap-1 rounded-md bg-white border border-stone-200 hover:border-stone-400 hover:shadow-md transition-colors p-2"
        title={title}
      >
        <span
          className="h-10 w-10 rounded inline-flex items-center justify-center"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon name={entry?.icon ?? 'apps'} size={22} style={{ color }} />
        </span>
        <span className="text-[10px] text-stone-700 truncate w-full text-center">{title}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onEject()
        }}
        className="opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 h-4 w-4 rounded-full bg-white border border-stone-300 text-stone-500 hover:text-amber-700 inline-flex items-center justify-center transition-opacity"
        title="Remove from section"
      >
        <Icon name="layers_clear" size={9} />
      </button>
    </div>
  )
}
