import { useState } from 'react'
import {
  CATEGORIES,
  DRAG_MIME,
  entriesByCategory,
  type WidgetCatalogEntry
} from '../lib/widgetCatalog'
import Icon from './Icon'

interface Props {
  onAdd: (entry: WidgetCatalogEntry) => void
  disabled: boolean
}

export default function WidgetPalette({ onAdd, disabled }: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const grouped = entriesByCategory()

  return (
    <div className="border-b border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-900/70 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-medium">
          Tools
        </span>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="btn-ghost !px-1.5 !py-0.5"
          aria-label={collapsed ? 'Show palette' : 'Hide palette'}
        >
          <Icon name={collapsed ? 'expand_more' : 'expand_less'} size={16} />
        </button>
      </div>
      {!collapsed && (
        <div className="flex flex-wrap items-stretch gap-x-5 gap-y-3 px-4 pb-3">
          {CATEGORIES.map((cat) => {
            const items = grouped[cat]
            if (items.length === 0) return null
            return (
              <div key={cat} className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.1em] text-stone-500">
                  {cat}
                </span>
                <div className="flex items-center gap-1.5">
                  {items.map((entry) => (
                    <button
                      key={entry.kind}
                      title={entry.hint}
                      disabled={disabled}
                      draggable={!disabled}
                      onClick={() => !disabled && onAdd(entry)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, entry.kind)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      className={`chip-btn ${disabled ? 'chip-disabled' : 'chip-active'}`}
                    >
                      <Icon name={entry.icon} size={16} />
                      <span>{entry.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
