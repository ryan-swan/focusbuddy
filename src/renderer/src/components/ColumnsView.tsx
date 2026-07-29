import { useMemo, useState } from 'react'
import type { Widget } from '@shared/types'
import { renderWidgetInline } from '../lib/renderWidgetInline'
import { widgetDisplayName } from '../lib/widgetDisplayName'
import {
  buildColumns,
  itemCardHeight,
  loadColumnsConfig,
  naturalItemWidth,
  saveColumnsConfig,
  type DeskColumnsConfig,
  type GroupBy
} from '../lib/deskColumns'
import { useWidgetStore } from '../stores/widgets'
import { useDeskViewStore } from '../stores/deskView'
import Icon from './Icon'

// The desk Columns view: the same desk objects laid out as vertical, each
// independently scrolling, walls. The whole set scrolls horizontally. Columns
// are hand-made (Freeform, drag cards between them) or derived from a grouping
// key (Type or Colour). Each column is exactly as wide as its widest object, so
// documents and spreadsheets get room while stickies and calculators stay
// compact, with narrower items centred.

const GROUPS: Array<{ value: GroupBy; label: string; icon: string }> = [
  { value: 'freeform', label: 'Freeform', icon: 'view_column' },
  { value: 'kind', label: 'Type', icon: 'category' },
  { value: 'color', label: 'Colour', icon: 'palette' }
]

export default function ColumnsView({ taskId, widgets }: { taskId: string; widgets: Widget[] }): JSX.Element {
  const [cfg, setCfgState] = useState<DeskColumnsConfig>(() => loadColumnsConfig(taskId))
  const [dragId, setDragId] = useState<string | null>(null)
  const setActive = useWidgetStore((s) => s.setActive)
  const setViewMode = useDeskViewStore((s) => s.set)

  function update(next: DeskColumnsConfig): void {
    setCfgState(next)
    saveColumnsConfig(taskId, next)
  }

  const columns = useMemo(() => buildColumns(widgets, cfg), [widgets, cfg])
  const isFreeform = cfg.groupBy === 'freeform'

  function assignTo(widgetId: string, columnId: string): void {
    // Drop at the end of the target column.
    const maxOrder = Object.entries(cfg.order)
      .filter(([id]) => cfg.assign[id] === columnId)
      .reduce((m, [, o]) => Math.max(m, o), 0)
    update({
      ...cfg,
      assign: { ...cfg.assign, [widgetId]: columnId },
      order: { ...cfg.order, [widgetId]: maxOrder + 1 }
    })
  }

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

  function openOnCanvas(w: Widget): void {
    setActive(w.id)
    setViewMode(taskId, 'canvas')
  }

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
              className={`inline-flex items-center gap-1 px-2.5 h-7 text-[12px] ${
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
            className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-dashed border-[var(--edge-firm)] text-[12px] text-[var(--ink-70)] hover:text-[rgb(var(--accent))] hover:border-[rgb(var(--accent)/0.5)]"
          >
            <Icon name="add" size={14} /> Add column
          </button>
        )}
        {!isFreeform && (
          <span className="ml-2 text-[11px] text-[var(--ink-40)]">Grouped automatically. Switch to Freeform to arrange by hand.</span>
        )}
        <button
          onClick={() => setViewMode(taskId, 'canvas')}
          data-testid="columns-to-canvas"
          className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--edge-soft)] text-[12px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]"
          title="Back to the canvas"
        >
          <Icon name="grid_view" size={14} /> Canvas
        </button>
      </div>

      {/* Horizontally scrolling set of columns */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-4 p-4 items-stretch">
          {columns.map((col) => (
            <section
              key={col.id}
              data-testid={`column-${col.id}`}
              style={{ width: col.width }}
              className="shrink-0 h-full flex flex-col rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] overflow-hidden"
              onDragOver={isFreeform ? (e) => e.preventDefault() : undefined}
              onDrop={
                isFreeform
                  ? (e) => {
                      e.preventDefault()
                      const id = e.dataTransfer.getData('text/plain') || dragId
                      if (id) assignTo(id, col.id)
                      setDragId(null)
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

              {/* Independently scrolling stack of cards */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
                {col.items.length === 0 ? (
                  <div className="text-[11px] text-[var(--ink-40)] text-center py-6">
                    {isFreeform ? 'Drag objects here' : 'Empty'}
                  </div>
                ) : (
                  col.items.map((w) => (
                    <div
                      key={w.id}
                      draggable={isFreeform}
                      onDragStart={
                        isFreeform
                          ? (e) => {
                              e.dataTransfer.setData('text/plain', w.id)
                              e.dataTransfer.effectAllowed = 'move'
                              setDragId(w.id)
                            }
                          : undefined
                      }
                      onDragEnd={() => setDragId(null)}
                      style={{ width: naturalItemWidth(w) }}
                      className={`mx-auto shrink-0 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] overflow-hidden shadow-sm ${
                        isFreeform ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${dragId === w.id ? 'opacity-50' : ''}`}
                      data-testid={`column-card-${w.id}`}
                    >
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]">
                        {w.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: w.color }} />}
                        <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-[var(--ink-90)]">
                          {widgetDisplayName(w)}
                        </span>
                        <button
                          onClick={() => openOnCanvas(w)}
                          title="Open on the canvas"
                          className="icon-btn h-6 w-6 text-[var(--ink-40)] hover:text-[rgb(var(--accent))]"
                        >
                          <Icon name="open_in_full" size={13} />
                        </button>
                      </div>
                      <div style={{ height: itemCardHeight(w) }} className="overflow-hidden relative">
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
    </div>
  )
}
