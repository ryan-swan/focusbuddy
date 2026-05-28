import type { Widget } from '@shared/types'
import { useWidgetStore } from '../stores/widgets'
import { catalogFor } from '../lib/widgetCatalog'
import Icon from './Icon'

function labelFor(w: Widget): string {
  if (w.title) return w.title
  if (w.kind === 'sticky' || w.kind === 'note') {
    const first = (w.content || '').split('\n')[0].trim()
    return first || catalogFor(w.kind)?.label || w.kind
  }
  if (w.content) {
    try {
      return new URL(w.content).hostname.replace(/^www\./, '')
    } catch {
      return w.content.slice(0, 24)
    }
  }
  return catalogFor(w.kind)?.label ?? w.kind
}

export default function WidgetDock(): JSX.Element | null {
  const widgets = useWidgetStore((s) => s.widgets)
  const setFocused = useWidgetStore((s) => s.setFocused)
  const remove = useWidgetStore((s) => s.remove)
  const focusedId = useWidgetStore((s) => s.focusedWidgetId)

  // Sections are spatial markers — don't clutter the dock with them.
  const dockable = widgets.filter((w) => w.kind !== 'section')
  if (dockable.length === 0) return null

  return (
    <div className="border-t border-stone-200 dark:border-stone-700 bg-stone-50/95 dark:bg-stone-900/95 backdrop-blur">
      <div className="px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium pr-1 shrink-0">
          On desk
        </span>
        {dockable.map((w) => {
          const entry = catalogFor(w.kind)
          const isFocused = focusedId === w.id
          return (
            <div key={w.id} className="group relative shrink-0">
              <button
                onClick={() => setFocused(w.id)}
                title={labelFor(w)}
                className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md border transition-colors text-xs max-w-[180px] ${
                  isFocused
                    ? 'border-stone-900 dark:border-stone-100 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900'
                    : 'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 hover:border-stone-500 dark:hover:border-stone-500'
                }`}
              >
                <Icon name={entry?.icon ?? 'apps'} size={14} />
                <span className="truncate">{labelFor(w)}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('Remove from the desk?')) void remove(w.id)
                }}
                className="opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 h-4 w-4 rounded-full bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 hover:border-red-500 dark:hover:border-red-400 hover:text-red-700 dark:hover:text-red-400 text-stone-500 dark:text-stone-400 inline-flex items-center justify-center transition-opacity"
                aria-label="Remove"
                title="Remove from desk"
              >
                <Icon name="close" size={10} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
