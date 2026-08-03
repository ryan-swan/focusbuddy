import { useEffect, useMemo, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import { contentToPlainText } from '@shared/widgetText'
import { renderWidgetInline } from '../lib/renderWidgetInline'
import { widgetDisplayName } from '../lib/widgetDisplayName'
import {
  buildColumns,
  columnsEligible,
  itemCardHeight,
  loadColumnsConfig,
  naturalItemWidth,
  saveColumnsConfig,
  type DeskColumnsConfig,
  type GroupBy
} from '../lib/deskColumns'
import { useWidgetStore } from '../stores/widgets'
import { useLinksStore } from '../stores/links'
import { useDeskViewStore } from '../stores/deskView'
import Icon from './Icon'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'

// The desk Columns view: the same desk objects laid out as vertical, independently
// scrolling walls, the whole set scrolling horizontally. Columns are hand-made
// (Freeform — drag cards between them), a real board keyed off each object's status
// (drag a card to change its status), or derived from a grouping key (Type, Colour,
// Connections, Sections, Recency, or an AI-produced Topic). Each column is as wide
// as its widest object, so documents get room while stickies stay compact.

const GROUPS: Array<{ value: GroupBy; label: string; icon: string }> = [
  { value: 'freeform', label: 'Freeform', icon: 'view_column' },
  { value: 'status', label: 'Status', icon: 'checklist' },
  { value: 'kind', label: 'Type', icon: 'category' },
  { value: 'color', label: 'Colour', icon: 'palette' },
  { value: 'connections', label: 'Connections', icon: 'hub' },
  { value: 'section', label: 'Sections', icon: 'dashboard' },
  { value: 'recency', label: 'Recency', icon: 'schedule' },
  { value: 'topic', label: 'Topic', icon: 'auto_awesome' }
]

interface TopicState {
  map: Record<string, string>
  loading: boolean
  error: string | null
  needsKey: boolean
  ranForSignature: string | null
}

export default function ColumnsView({ taskId, widgets }: { taskId: string; widgets: Widget[] }): JSX.Element {
  const [cfg, setCfgState] = useState<DeskColumnsConfig>(() => loadColumnsConfig(taskId))
  const [dragId, setDragId] = useState<string | null>(null)
  // The column the pointer is currently over during a drag, for a visible drop
  // highlight (and proof the drop zone is registering the gesture).
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  // Click-to-move menu: a drag-free way to move a card between columns/lanes, so
  // reorganising never depends on a drag gesture landing.
  const [moveMenu, setMoveMenu] = useState<{ x: number; y: number; widgetId: string; fromCol: string } | null>(null)
  const setActive = useWidgetStore((s) => s.setActive)
  const setFocused = useWidgetStore((s) => s.setFocused)
  const updateWidget = useWidgetStore((s) => s.update)
  const setViewMode = useDeskViewStore((s) => s.set)

  // Wire graph — only needed by the Connections mode; loaded lazily when selected.
  const links = useLinksStore((s) => s.links)
  const loadLinks = useLinksStore((s) => s.loadForTask)
  useEffect(() => {
    if (cfg.groupBy === 'connections') void loadLinks(taskId)
  }, [cfg.groupBy, taskId, loadLinks])

  // AI topic labels — computed on demand for the Topic mode.
  const [topic, setTopic] = useState<TopicState>({ map: {}, loading: false, error: null, needsKey: false, ranForSignature: null })

  // A signature of the eligible objects, so Topic auto-runs once per meaningful
  // change (objects added/removed or their text edited) rather than every render.
  const eligible = useMemo(() => columnsEligible(widgets), [widgets])
  const topicSignature = useMemo(
    () => eligible.map((w) => `${w.id}:${(w.title || '').length}:${(w.content || '').length}`).sort().join('|'),
    [eligible]
  )

  async function runTopic(): Promise<void> {
    const items = eligible.map((w) => ({
      id: w.id,
      title: widgetDisplayName(w),
      text: contentToPlainText(w.content).slice(0, 400)
    }))
    if (items.length === 0) {
      setTopic({ map: {}, loading: false, error: null, needsKey: false, ranForSignature: topicSignature })
      return
    }
    setTopic((t) => ({ ...t, loading: true, error: null, needsKey: false }))
    const res = await window.api.ai.groupByTopic(items)
    if (res.ok) {
      setTopic({ map: res.topicByWidget ?? {}, loading: false, error: null, needsKey: false, ranForSignature: topicSignature })
    } else {
      setTopic({ map: {}, loading: false, error: res.error ?? 'Could not group by topic.', needsKey: !!res.needsApiKey, ranForSignature: topicSignature })
    }
  }

  // Auto-run topic grouping when the mode is first selected (or the objects change).
  useEffect(() => {
    if (cfg.groupBy !== 'topic') return
    if (topic.loading) return
    if (topic.ranForSignature === topicSignature) return
    void runTopic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.groupBy, topicSignature])

  function update(next: DeskColumnsConfig): void {
    setCfgState(next)
    saveColumnsConfig(taskId, next)
  }

  const columns = useMemo(
    () => buildColumns(widgets, cfg, { links, topicByWidget: topic.map }),
    [widgets, cfg, links, topic.map]
  )
  const isFreeform = cfg.groupBy === 'freeform'
  const isStatus = cfg.groupBy === 'status'
  // Both Freeform and Status accept drops: Freeform records the placement locally,
  // Status writes the object's real status field (the column id is the status).
  const canDrag = isFreeform || isStatus

  function assignTo(widgetId: string, columnId: string): void {
    const maxOrder = Object.entries(cfg.order)
      .filter(([id]) => cfg.assign[id] === columnId)
      .reduce((m, [, o]) => Math.max(m, o), 0)
    update({
      ...cfg,
      assign: { ...cfg.assign, [widgetId]: columnId },
      order: { ...cfg.order, [widgetId]: maxOrder + 1 }
    })
  }

  function dropOn(columnId: string, widgetId: string): void {
    if (isStatus) void updateWidget(widgetId, { status: columnId })
    else if (isFreeform) assignTo(widgetId, columnId)
  }

  // ── Edge navigation during a card drag ──────────────────────────────────────
  // Mirrors the canvas edge-pan: while dragging a card near an edge, auto-scroll
  // the horizontal column strip (left/right) or the hovered column's card stack
  // (top/bottom), so you can reach off-screen columns and cards mid-drag. Driven by
  // the latest pointer position captured on dragover; runs on a rAF loop for the
  // life of the drag.
  const scrollRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const edgeRafRef = useRef<number | null>(null)

  function startEdgeScroll(): void {
    if (edgeRafRef.current != null) return
    const EDGE = 64 // px from an edge where auto-scroll kicks in
    const MAX = 22 // px per frame at the very edge
    const step = (): void => {
      const cont = scrollRef.current
      const p = pointerRef.current
      if (cont && p) {
        const r = cont.getBoundingClientRect()
        // Horizontal: scroll the whole column strip to reach off-screen columns.
        if (p.x < r.left + EDGE) cont.scrollLeft -= MAX * Math.min(1, (r.left + EDGE - p.x) / EDGE)
        else if (p.x > r.right - EDGE) cont.scrollLeft += MAX * Math.min(1, (p.x - (r.right - EDGE)) / EDGE)
        // Vertical: scroll the card stack the pointer is currently over.
        const bodies = cont.querySelectorAll<HTMLElement>('[data-col-scroll]')
        for (const b of bodies) {
          const br = b.getBoundingClientRect()
          if (p.x >= br.left && p.x <= br.right && p.y >= br.top && p.y <= br.bottom) {
            if (p.y < br.top + EDGE) b.scrollTop -= MAX * Math.min(1, (br.top + EDGE - p.y) / EDGE)
            else if (p.y > br.bottom - EDGE) b.scrollTop += MAX * Math.min(1, (p.y - (br.bottom - EDGE)) / EDGE)
            break
          }
        }
      }
      edgeRafRef.current = requestAnimationFrame(step)
    }
    edgeRafRef.current = requestAnimationFrame(step)
  }

  function stopEdgeScroll(): void {
    if (edgeRafRef.current != null) {
      cancelAnimationFrame(edgeRafRef.current)
      edgeRafRef.current = null
    }
    pointerRef.current = null
  }

  // Safety net: stop the loop if the component unmounts mid-drag.
  useEffect(() => () => stopEdgeScroll(), [])

  function addColumn(): void {
    const id = 'col-' + Math.random().toString(36).slice(2, 8)
    update({ ...cfg, columns: [...cfg.columns, { id, title: 'New column' }] })
  }
  function renameColumn(id: string, title: string): void {
    update({ ...cfg, columns: cfg.columns.map((c) => (c.id === id ? { ...c, title } : c)) })
  }
  function removeColumn(id: string): void {
    if (cfg.columns.length <= 1) return
    const firstId = cfg.columns.find((c) => c.id !== id)?.id
    const assign = { ...cfg.assign }
    for (const w of Object.keys(assign)) if (assign[w] === id && firstId) assign[w] = firstId
    update({ ...cfg, columns: cfg.columns.filter((c) => c.id !== id), assign })
  }

  // Focus an object the same way the canvas does: open it full-pane in focus mode
  // (WidgetFocusMode reads focusedWidgetId), staying in column mode underneath so
  // exiting focus returns here — NOT escaping to the canvas.
  function focusObject(w: Widget): void {
    setActive(w.id)
    setFocused(w.id)
  }

  function openOnCanvas(w: Widget): void {
    setActive(w.id)
    setViewMode(taskId, 'canvas')
  }

  const modeHint =
    isFreeform
      ? 'Drag cards between columns; rename a column, or add and remove your own.'
      : isStatus
        ? 'Drag a card into a lane to set its status. Lanes are the same everywhere this desk is open.'
        : cfg.groupBy === 'topic'
          ? 'Columns proposed by AI from each object’s content.'
          : 'Grouped automatically. Switch to Freeform or Status to arrange by hand.'

  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--surface-sunken)]" data-testid="columns-view" data-desk-view="columns">
      {/* Control bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[var(--edge-soft)] bg-[var(--surface-raised)]">
        <Icon name="view_column" size={16} className="text-[var(--ink-50)]" />
        <span className="text-[13px] font-medium text-[var(--ink-90)]">Columns</span>
        <div className="ml-2 inline-flex rounded-lg border border-[var(--edge-soft)] overflow-hidden">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              onClick={() => update({ ...cfg, groupBy: g.value })}
              data-testid={`columns-groupby-${g.value}`}
              className={`inline-flex items-center gap-1 px-2.5 h-7 text-[12px] whitespace-nowrap ${
                cfg.groupBy === g.value
                  ? 'bg-[rgb(var(--accent))] text-white'
                  : 'text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]'
              }`}
            >
              <Icon name={g.icon} size={13} />
              {g.label}
            </button>
          ))}
        </div>
        {isFreeform && (
          <button
            onClick={addColumn}
            data-testid="columns-add"
            className="ml-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-dashed border-[var(--edge-firm)] text-[12px] text-[var(--ink-70)] hover:text-[rgb(var(--accent))] hover:border-[rgb(var(--accent)/0.5)]"
          >
            <Icon name="add" size={14} /> Add column
          </button>
        )}
        {cfg.groupBy === 'topic' && (
          <button
            onClick={() => void runTopic()}
            disabled={topic.loading}
            data-testid="columns-topic-regroup"
            className="ml-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--edge-soft)] text-[12px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <Icon name={topic.loading ? 'autorenew' : 'auto_awesome'} size={13} className={topic.loading ? 'animate-spin' : ''} />
            {topic.loading ? 'Grouping…' : 'Regroup'}
          </button>
        )}
        <span className="ml-2 text-[11px] text-[var(--ink-40)] hidden md:inline">{modeHint}</span>
        <button
          onClick={() => setViewMode(taskId, 'canvas')}
          data-testid="columns-to-canvas"
          className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--edge-soft)] text-[12px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]"
          title="Back to the canvas"
        >
          <Icon name="grid_view" size={14} /> Canvas
        </button>
      </div>

      {/* Topic honest states: needs a key, or an error. Never fabricated columns. */}
      {cfg.groupBy === 'topic' && (topic.needsKey || topic.error) && (
        <div className="shrink-0 px-4 py-2 text-[12px] border-b border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-60)]">
          {topic.needsKey
            ? 'Topic grouping needs AI. Add an Anthropic key in Settings → AI, then press Regroup.'
            : topic.error}
        </div>
      )}

      {/* Horizontally scrolling set of columns */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
        // Capture the live pointer position during a drag so the edge-scroll loop
        // can auto-pan toward off-screen columns/cards. preventDefault keeps the
        // gap between columns a valid drag surface too.
        onDragOver={canDrag ? (e) => {
          if (dragId) pointerRef.current = { x: e.clientX, y: e.clientY }
        } : undefined}
      >
        <div className="h-full flex gap-4 p-4 items-stretch">
          {columns.map((col) => (
            <section
              key={col.id}
              data-testid={`column-${col.id}`}
              style={{ width: col.width }}
              className={`shrink-0 h-full flex flex-col rounded-xl border bg-[var(--surface-raised)] overflow-hidden transition-colors ${
                dragOverCol === col.id
                  ? 'border-[rgb(var(--accent))] ring-2 ring-[rgb(var(--accent)/0.35)]'
                  : 'border-[var(--edge-soft)]'
              }`}
              // Enter + Over must BOTH preventDefault AND set dropEffect for Chromium
              // to actually FIRE the drop (preventDefault alone shows the highlight but
              // the drop is silently rejected if dropEffect doesn't match effectAllowed).
              onDragEnter={canDrag ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(col.id) } : undefined}
              onDragOver={canDrag ? (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                pointerRef.current = { x: e.clientX, y: e.clientY }
                if (dragOverCol !== col.id) setDragOverCol(col.id)
              } : undefined}
              onDrop={
                canDrag
                  ? (e) => {
                      e.preventDefault()
                      const id = e.dataTransfer.getData('text/plain') || dragId
                      if (id) dropOn(col.id, id)
                      setDragId(null)
                      setDragOverCol(null)
                      stopEdgeScroll()
                    }
                  : undefined
              }
            >
              {/* Column header */}
              <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--edge-soft)]">
                {col.swatch && <span className="h-3 w-3 rounded-full shrink-0" style={{ background: col.swatch }} />}
                {isFreeform ? (
                  <input
                    defaultValue={col.title}
                    onBlur={(e) => e.target.value.trim() && renameColumn(col.id, e.target.value.trim())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-[var(--ink-100)] focus:outline-none"
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-[var(--ink-100)]">{col.title}</span>
                )}
                <span className="text-[11px] text-[var(--ink-40)] fb-tabular shrink-0">{col.items.length}</span>
                {isFreeform && cfg.columns.length > 1 && (
                  <button
                    onClick={() => removeColumn(col.id)}
                    title="Remove column (items move to the first column)"
                    className="icon-btn h-6 w-6 text-[var(--ink-40)] hover:text-red-500"
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>

              {/* Independently scrolling stack of cards. Tagged so the drag
                  edge-scroll can auto-pan this column vertically. */}
              <div data-col-scroll className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
                {col.items.length === 0 ? (
                  <div className="text-[11px] text-[var(--ink-40)] text-center py-6">
                    {canDrag ? 'Drag objects here' : 'Empty'}
                  </div>
                ) : (
                  col.items.map((w) => (
                    <div
                      key={w.id}
                      style={{ width: naturalItemWidth(w) }}
                      className={`mx-auto shrink-0 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] overflow-hidden shadow-sm ${
                        dragId === w.id ? 'opacity-50' : ''
                      }`}
                      data-testid={`column-card-${w.id}`}
                    >
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]">
                        {/* Dedicated drag handle — grabbing here always starts the drag,
                            even when the card body is a live, interactive widget that
                            would otherwise swallow the gesture. */}
                        {canDrag && (
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', w.id)
                              e.dataTransfer.effectAllowed = 'move'
                              setDragId(w.id)
                              pointerRef.current = { x: e.clientX, y: e.clientY }
                              startEdgeScroll()
                            }}
                            onDragEnd={() => {
                              setDragId(null)
                              setDragOverCol(null)
                              stopEdgeScroll()
                            }}
                            title="Drag to move"
                            className="shrink-0 -ml-1 px-0.5 cursor-grab active:cursor-grabbing text-[var(--ink-30)] hover:text-[var(--ink-60)]"
                            data-testid={`column-drag-${w.id}`}
                          >
                            <Icon name="drag_indicator" size={14} />
                          </span>
                        )}
                        {w.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: w.color }} />}
                        <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-[var(--ink-90)]">
                          {widgetDisplayName(w)}
                        </span>
                        {canDrag && columns.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setMoveMenu({ x: e.clientX, y: e.clientY, widgetId: w.id, fromCol: col.id })
                            }}
                            title={isStatus ? 'Move to another lane' : 'Move to another column'}
                            data-testid={`column-move-${w.id}`}
                            className="icon-btn h-6 w-6 text-[var(--ink-40)] hover:text-[rgb(var(--accent))]"
                          >
                            <Icon name="drive_file_move" size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => focusObject(w)}
                          title="Open in focus mode"
                          data-testid={`column-focus-${w.id}`}
                          className="icon-btn h-6 w-6 text-[var(--ink-40)] hover:text-[rgb(var(--accent))]"
                        >
                          <Icon name="open_in_full" size={13} />
                        </button>
                        <button
                          onClick={() => openOnCanvas(w)}
                          title="Show on the canvas"
                          data-testid={`column-reveal-${w.id}`}
                          className="icon-btn h-6 w-6 text-[var(--ink-40)] hover:text-[rgb(var(--accent))]"
                        >
                          <Icon name="my_location" size={13} />
                        </button>
                      </div>
                      {/* While a drag is in progress, make the live widget body
                          transparent to pointer events so the column beneath
                          receives dragover/drop — otherwise an interactive body
                          (iframe/webview/inputs) swallows the gesture and the drop
                          never registers. */}
                      <div
                        style={{ height: itemCardHeight(w) }}
                        className={`overflow-hidden relative ${dragId ? 'pointer-events-none' : ''}`}
                      >
                        {renderWidgetInline(w)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      {moveMenu && (
        <CanvasContextMenu
          x={moveMenu.x}
          y={moveMenu.y}
          items={columns
            .filter((c) => c.id !== moveMenu.fromCol)
            .map(
              (c): CtxMenuItem => ({
                label: `Move to ${c.title}`,
                icon: 'arrow_forward',
                onClick: () => dropOn(c.id, moveMenu.widgetId)
              })
            )}
          onClose={() => setMoveMenu(null)}
        />
      )}
    </div>
  )
}
