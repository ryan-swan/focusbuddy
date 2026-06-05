import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import WidgetFrame from './WidgetFrame'
import { useWidgetStore } from '../../stores/widgets'
import Icon from '../Icon'
import {
  saveTemplate,
  listTemplates,
  deleteTemplate,
  subscribe,
  type BlockData,
  type BlockField,
  type BlockFieldType
} from '../../lib/customBlockTemplates'

// Custom Block — a WYSIWYG form/record designer. In DESIGN mode the user drops
// typed fields and positions/resizes them freely; in USE mode the same block is
// a data-entry form whose values persist as the record. Layout + values live in
// widget.content; a layout can be saved as a personal template (cross-task).

const FIELD_TYPES: { type: BlockFieldType; icon: string; label: string }[] = [
  { type: 'text', icon: 'short_text', label: 'Text' },
  { type: 'textarea', icon: 'notes', label: 'Paragraph' },
  { type: 'number', icon: 'tag', label: 'Number' },
  { type: 'date', icon: 'calendar_today', label: 'Date' },
  { type: 'email', icon: 'alternate_email', label: 'Email' },
  { type: 'url', icon: 'link', label: 'URL' },
  { type: 'select', icon: 'arrow_drop_down_circle', label: 'Select' },
  { type: 'checkbox', icon: 'check_box', label: 'Checkbox' },
  { type: 'heading', icon: 'title', label: 'Heading' },
  { type: 'divider', icon: 'horizontal_rule', label: 'Divider' }
]

const DEFAULT_SIZE: Record<BlockFieldType, { w: number; h: number }> = {
  text: { w: 200, h: 58 },
  textarea: { w: 240, h: 96 },
  number: { w: 160, h: 58 },
  date: { w: 180, h: 58 },
  email: { w: 220, h: 58 },
  url: { w: 220, h: 58 },
  select: { w: 200, h: 58 },
  checkbox: { w: 180, h: 34 },
  heading: { w: 320, h: 34 },
  divider: { w: 320, h: 14 }
}

const DEFAULT_DATA: BlockData = { title: 'Untitled block', fields: [] }

function parse(content: string): BlockData {
  if (!content) return { ...DEFAULT_DATA, fields: [] }
  try {
    const p = JSON.parse(content) as Partial<BlockData>
    return {
      title: p.title ?? DEFAULT_DATA.title,
      fields: Array.isArray(p.fields) ? p.fields : []
    }
  } catch {
    return { ...DEFAULT_DATA, fields: [] }
  }
}

function uid(): string {
  try {
    return crypto.randomUUID().slice(0, 8)
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
}

interface Props {
  widget: Widget
  inline?: boolean
}

export default function CustomBlockWidget({ widget, inline = false }: Props): JSX.Element {
  const update = useWidgetStore((s) => s.update)
  const [data, setData] = useState<BlockData>(() => parse(widget.content))
  // A fresh, empty block opens in design mode; an existing one opens in use mode.
  const [mode, setMode] = useState<'design' | 'use'>(() =>
    parse(widget.content).fields.length === 0 ? 'design' : 'use'
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [tplMenu, setTplMenu] = useState(false)
  const [, forceTpl] = useState(0)
  const lastSaved = useRef(widget.content)

  useEffect(() => subscribe(() => forceTpl((n) => n + 1)), [])

  useEffect(() => {
    const next = JSON.stringify(data)
    if (next === lastSaved.current) return
    const h = window.setTimeout(() => {
      lastSaved.current = next
      void update(widget.id, { content: next })
    }, 300)
    return () => window.clearTimeout(h)
  }, [data, widget.id, update])

  const setFields = (fn: (f: BlockField[]) => BlockField[]): void =>
    setData((d) => ({ ...d, fields: fn(d.fields) }))
  const patchField = (id: string, patch: Partial<BlockField>): void =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  function addField(type: BlockFieldType): void {
    const size = DEFAULT_SIZE[type]
    // Stagger new fields so they don't stack exactly.
    const n = data.fields.length
    const field: BlockField = {
      id: uid(),
      type,
      label:
        type === 'heading'
          ? 'Section heading'
          : type === 'divider'
            ? ''
            : FIELD_TYPES.find((t) => t.type === type)?.label ?? 'Field',
      x: 16 + (n % 3) * 16,
      y: 16 + n * 14,
      w: size.w,
      h: size.h,
      ...(type === 'select' ? { options: ['Option 1', 'Option 2'] } : {})
    }
    setFields((fs) => [...fs, field])
    setSelected(field.id)
  }

  // ── Drag / resize a field within the block (design mode) ──────────────────
  function beginFieldDrag(e: React.PointerEvent, id: string, mode: 'move' | 'resize'): void {
    e.stopPropagation()
    e.preventDefault()
    const field = data.fields.find((f) => f.id === id)
    if (!field) return
    const start = { x: e.clientX, y: e.clientY, fx: field.x, fy: field.y, fw: field.w, fh: field.h }
    const zoom = useWidgetStore.getState().zoom || 1
    const onMove = (ev: PointerEvent): void => {
      const dx = (ev.clientX - start.x) / zoom
      const dy = (ev.clientY - start.y) / zoom
      if (mode === 'move') {
        patchField(id, { x: Math.max(0, Math.round(start.fx + dx)), y: Math.max(0, Math.round(start.fy + dy)) })
      } else {
        patchField(id, { w: Math.max(60, Math.round(start.fw + dx)), h: Math.max(24, Math.round(start.fh + dy)) })
      }
    }
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const sel = data.fields.find((f) => f.id === selected) ?? null
  const templates = listTemplates()

  function doSaveTemplate(): void {
    const name = window.prompt('Save this layout as a template named:', data.title || 'My block')
    if (name === null) return
    saveTemplate(name, data)
  }
  function applyTemplate(tplId: string): void {
    const tpl = listTemplates().find((t) => t.id === tplId)
    if (!tpl) return
    // Re-id the fields so multiple instances of the same template are independent.
    setData({
      title: tpl.data.title,
      fields: tpl.data.fields.map((f) => ({ ...f, id: uid(), value: undefined }))
    })
    setSelected(null)
    setTplMenu(false)
    setMode('use')
  }

  const content = (
    <div className="flex flex-col h-full w-full bg-white dark:bg-stone-900">
      {/* Toolbar */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-stone-200 dark:border-stone-700"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          value={data.title}
          onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
          className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-stone-900 dark:text-stone-100 focus:outline-none"
          placeholder="Block title"
        />
        <div className="flex items-center rounded-full bg-stone-100 dark:bg-stone-800 p-0.5 text-[11px]">
          {(['design', 'use'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setSelected(null)
              }}
              className={`px-2 py-0.5 rounded-full capitalize transition-colors ${
                mode === m
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                  : 'text-stone-500'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            onClick={() => setTplMenu((v) => !v)}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700"
            title="Templates"
            aria-label="Templates"
          >
            <Icon name="bookmarks" size={14} />
          </button>
          {tplMenu && (
            <div
              className="absolute right-0 top-7 z-20 w-56 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-xl py-1 text-[12px]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  doSaveTemplate()
                  setTplMenu(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200"
              >
                <Icon name="bookmark_add" size={14} />
                Save as template…
              </button>
              {templates.length > 0 && (
                <div className="my-1 h-px bg-stone-200 dark:bg-stone-700" />
              )}
              <div className="max-h-48 overflow-y-auto">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="group/tpl flex items-center px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-700"
                  >
                    <button
                      onClick={() => applyTemplate(t.id)}
                      className="flex-1 text-left truncate text-stone-800 dark:text-stone-200"
                      title={`Insert "${t.name}"`}
                    >
                      {t.name}
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="opacity-0 group-hover/tpl:opacity-100 text-stone-400 hover:text-rose-500"
                      aria-label="Delete template"
                    >
                      <Icon name="delete" size={13} />
                    </button>
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-stone-400">No templates yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Field palette (design mode) */}
      {mode === 'design' && (
        <div
          className="shrink-0 flex flex-wrap gap-1 px-2 py-1.5 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {FIELD_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => addField(t.type)}
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-accent text-[10px] text-stone-700 dark:text-stone-300"
              title={`Add ${t.label}`}
            >
              <Icon name={t.icon} size={13} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected-field config bar (design mode) */}
      {mode === 'design' && sel && (
        <div
          className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-stone-200 dark:border-stone-700 bg-accent/5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {sel.type !== 'divider' && (
            <input
              value={sel.label}
              onChange={(e) => patchField(sel.id, { label: e.target.value })}
              placeholder="Label"
              className="flex-1 min-w-0 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
            />
          )}
          {sel.type === 'select' && (
            <input
              value={(sel.options ?? []).join(', ')}
              onChange={(e) =>
                patchField(sel.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
              placeholder="Option A, Option B"
              className="flex-1 min-w-0 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
            />
          )}
          {sel.type !== 'divider' && sel.type !== 'heading' && (
            <label className="flex items-center gap-1 text-[11px] text-stone-600 dark:text-stone-400 whitespace-nowrap">
              <input
                type="checkbox"
                checked={!!sel.required}
                onChange={(e) => patchField(sel.id, { required: e.target.checked })}
                className="accent-accent"
              />
              required
            </label>
          )}
          <button
            onClick={() => {
              setFields((fs) => fs.filter((f) => f.id !== sel.id))
              setSelected(null)
            }}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-stone-500 hover:text-rose-500 hover:bg-rose-500/10"
            title="Delete field"
            aria-label="Delete field"
          >
            <Icon name="delete" size={14} />
          </button>
        </div>
      )}

      {/* Field surface */}
      <div
        className={`relative flex-1 min-h-0 overflow-auto ${
          mode === 'design'
            ? 'bg-[radial-gradient(circle,_rgba(120,113,108,0.18)_1px,_transparent_1px)] [background-size:16px_16px]'
            : ''
        }`}
        onMouseDown={() => mode === 'design' && setSelected(null)}
      >
        {data.fields.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-stone-400 pointer-events-none">
            {mode === 'design'
              ? 'Add fields from the palette, then drag to arrange them.'
              : 'This block has no fields yet.'}
          </div>
        )}
        {data.fields.map((f) => (
          <div
            key={f.id}
            style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h }}
            className={
              mode === 'design'
                ? `rounded border ${selected === f.id ? 'border-accent ring-1 ring-accent/40' : 'border-stone-200 dark:border-stone-700'} bg-white/70 dark:bg-stone-800/40`
                : ''
            }
            onMouseDown={(e) => {
              if (mode === 'design') {
                e.stopPropagation()
                setSelected(f.id)
              }
            }}
          >
            {/* Drag handle (design) */}
            {mode === 'design' && f.type !== 'divider' && (
              <div
                onPointerDown={(e) => beginFieldDrag(e, f.id, 'move')}
                className="absolute -top-0.5 left-0 right-0 h-4 cursor-move flex items-center justify-center"
                title="Drag to move"
              >
                <Icon name="drag_indicator" size={12} className="text-stone-400 rotate-90" />
              </div>
            )}
            {mode === 'design' && f.type === 'divider' && (
              <div
                onPointerDown={(e) => beginFieldDrag(e, f.id, 'move')}
                className="absolute inset-0 cursor-move"
                title="Drag to move"
              />
            )}

            <div className={mode === 'design' ? 'p-1.5 pt-4 h-full' : 'h-full'}>
              <FieldControl field={f} mode={mode} onValue={(v) => patchField(f.id, { value: v })} />
            </div>

            {/* Resize handle (design) */}
            {mode === 'design' && f.type !== 'divider' && (
              <div
                onPointerDown={(e) => beginFieldDrag(e, f.id, 'resize')}
                className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
                title="Resize"
              >
                <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 border-r-2 border-b-2 border-stone-400" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  if (inline) return content

  return (
    <WidgetFrame widget={widget} headerLabel="custom block" headerAccent="bg-stone-200/70">
      {content}
    </WidgetFrame>
  )
}

// Renders a field as a label + control. In design mode controls are disabled
// (the surface is for layout); in use mode they're live data-entry inputs.
function FieldControl({
  field,
  mode,
  onValue
}: {
  field: BlockField
  mode: 'design' | 'use'
  onValue: (v: string | boolean) => void
}): JSX.Element {
  const disabled = mode === 'design'
  const stop = (e: React.SyntheticEvent): void => e.stopPropagation()
  const inputCls =
    'w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] text-stone-900 dark:text-stone-100 focus:outline-none focus:border-accent disabled:bg-stone-50 dark:disabled:bg-stone-800/40'
  const labelEl =
    field.type !== 'divider' && field.type !== 'heading' && field.type !== 'checkbox' ? (
      <div className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-0.5 truncate">
        {field.label}
        {field.required && <span className="text-rose-500"> *</span>}
      </div>
    ) : null

  if (field.type === 'heading') {
    return <div className="text-[15px] font-semibold text-stone-900 dark:text-stone-100 truncate">{field.label}</div>
  }
  if (field.type === 'divider') {
    return <div className="h-px w-full bg-stone-300 dark:bg-stone-600 mt-1.5" />
  }
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-[12px] text-stone-800 dark:text-stone-200">
        <input
          type="checkbox"
          checked={field.value === true}
          disabled={disabled}
          onMouseDown={stop}
          onChange={(e) => onValue(e.target.checked)}
          className="accent-accent h-4 w-4"
        />
        {field.label}
      </label>
    )
  }
  if (field.type === 'textarea') {
    return (
      <div className="flex flex-col h-full">
        {labelEl}
        <textarea
          value={(field.value as string) ?? ''}
          disabled={disabled}
          onMouseDown={stop}
          onChange={(e) => onValue(e.target.value)}
          className={`${inputCls} flex-1 min-h-0 resize-none`}
        />
      </div>
    )
  }
  if (field.type === 'select') {
    return (
      <div>
        {labelEl}
        <select
          value={(field.value as string) ?? ''}
          disabled={disabled}
          onMouseDown={stop}
          onChange={(e) => onValue(e.target.value)}
          className={inputCls}
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    )
  }
  const inputType =
    field.type === 'number'
      ? 'number'
      : field.type === 'date'
        ? 'date'
        : field.type === 'email'
          ? 'email'
          : field.type === 'url'
            ? 'url'
            : 'text'
  return (
    <div>
      {labelEl}
      <input
        type={inputType}
        value={(field.value as string) ?? ''}
        disabled={disabled}
        onMouseDown={stop}
        onChange={(e) => onValue(e.target.value)}
        className={inputCls}
      />
    </div>
  )
}
