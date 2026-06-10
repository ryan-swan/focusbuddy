import type { Widget } from '@shared/types'
import { WIDGET_CATALOG } from '../lib/widgetCatalog'
import Icon from './Icon'

// A read-only, content-aware preview of a widget. Fills its container, draws no
// chrome, captures no pointer events — the caller scales it (tiny for a minimap
// thumbnail, large for the hover magnifier) and owns interaction. The point is
// that the minimap shows what is actually IN each window, not a blank rectangle.

function hostOf(url: string): string {
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
function faviconFor(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=64`
}
function safeParse<T>(s: string | undefined | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}
// Best-effort plain text out of a Tiptap document JSON.
function tiptapText(s: string): string {
  const out: string[] = []
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) && out.length < 60) out.push(m[1])
  return out.join(' ').replace(/\\n/g, ' ')
}

function Fallback({ widget, icon, label }: { widget: Widget; icon?: string; label?: string }): JSX.Element {
  const entry = WIDGET_CATALOG.find((e) => e.kind === widget.kind)
  const snippet = (widget.content || '').replace(/\s+/g, ' ').slice(0, 140)
  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-stone-900 p-2 overflow-hidden">
      <div className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
        <Icon name={icon ?? entry?.icon ?? 'widgets'} size={16} />
        <span className="text-[12px] font-medium truncate">
          {widget.title || label || entry?.label || widget.kind}
        </span>
      </div>
      {snippet && (
        <div className="mt-1 text-[11px] leading-snug text-stone-600 dark:text-stone-300 overflow-hidden">
          {snippet}
        </div>
      )}
    </div>
  )
}

export default function WidgetPreview({ widget }: { widget: Widget }): JSX.Element {
  const c = widget.content ?? ''
  switch (widget.kind) {
    case 'sticky':
      return (
        <div
          className="h-full w-full p-2 text-[13px] leading-snug font-hand text-stone-900 overflow-hidden whitespace-pre-wrap"
          style={{ background: widget.color || '#fde68a' }}
        >
          {c || <span className="opacity-40">Empty note</span>}
        </div>
      )
    case 'note':
    case 'markdown':
      return (
        <div className="h-full w-full p-2 text-[12px] leading-snug text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-900 overflow-hidden whitespace-pre-wrap">
          {c || <span className="opacity-40">Empty</span>}
        </div>
      )
    case 'card': {
      const d = safeParse<{ title: string; body: string; accent: string }>(c)
      return (
        <div className="h-full w-full bg-white dark:bg-stone-900 overflow-hidden flex flex-col">
          <div className="h-1.5 shrink-0" style={{ background: d?.accent || '#6366f1' }} />
          <div className="p-2 min-h-0">
            <div className="text-[13px] font-semibold text-stone-900 dark:text-stone-100">
              {d?.title || 'Card'}
            </div>
            <div className="text-[11px] text-stone-600 dark:text-stone-300 whitespace-pre-wrap">
              {d?.body || ''}
            </div>
          </div>
        </div>
      )
    }
    case 'webview': {
      const host = hostOf(c)
      return (
        <div className="h-full w-full bg-white dark:bg-stone-900 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-stone-200 dark:border-stone-700 shrink-0">
            <img
              src={faviconFor(c)}
              alt=""
              className="h-4 w-4 rounded"
              onError={(e) => ((e.currentTarget.style.display = 'none'))}
            />
            <span className="text-[12px] font-medium text-stone-800 dark:text-stone-200 truncate">
              {host || 'Browser'}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center text-stone-200 dark:text-stone-700">
            <Icon name="public" size={40} />
          </div>
          <div className="px-2 py-1 text-[10px] text-stone-400 dark:text-stone-500 truncate border-t border-stone-200 dark:border-stone-700 shrink-0">
            {c || 'No URL'}
          </div>
        </div>
      )
    }
    case 'agent': {
      const a = safeParse<{ instruction: string; lastOutput: string }>(c)
      return (
        <div className="h-full w-full bg-white dark:bg-stone-900 p-2 overflow-hidden">
          <div className="flex items-center gap-1 text-accent text-[11px] font-semibold">
            <Icon name="smart_toy" size={13} />
            Desk agent
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
            {a?.instruction || 'No instruction'}
          </div>
          {a?.lastOutput && (
            <div className="text-[11px] text-stone-700 dark:text-stone-200 mt-1 whitespace-pre-wrap overflow-hidden">
              {a.lastOutput}
            </div>
          )}
        </div>
      )
    }
    case 'image':
    case 'file': {
      const isImg = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(c) || c.startsWith('data:image')
      if (isImg) return <img src={c} alt="" className="h-full w-full object-cover" />
      return <Fallback widget={widget} icon="description" />
    }
    case 'page':
      return (
        <div className="h-full w-full p-2 bg-white dark:bg-stone-900 overflow-hidden">
          <div className="text-[12px] font-semibold text-stone-900 dark:text-stone-100 mb-1">
            {widget.title || 'Document'}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
            {tiptapText(c).slice(0, 300) || 'Empty document'}
          </div>
        </div>
      )
    case 'living-doc':
      return (
        <div className="h-full w-full p-2 bg-white dark:bg-stone-900 overflow-hidden">
          <div className="text-[11px] font-semibold text-accent mb-1 truncate">
            {widget.livingQuery || 'Living Doc'}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
            {tiptapText(c).slice(0, 300) || 'Will fill from this desk'}
          </div>
        </div>
      )
    case 'shape': {
      const s = safeParse<{ fill: string; label: string }>(c)
      return (
        <div
          className="h-full w-full flex items-center justify-center"
          style={{ background: s?.fill || 'rgb(var(--accent) / 0.15)' }}
        >
          {s?.label && (
            <span className="text-[12px] font-medium text-stone-800 dark:text-stone-100">
              {s.label}
            </span>
          )}
        </div>
      )
    }
    case 'table':
      return <Fallback widget={widget} icon="table_chart" label="Table" />
    case 'timer':
      return <Fallback widget={widget} icon="timer" />
    default:
      return <Fallback widget={widget} />
  }
}
