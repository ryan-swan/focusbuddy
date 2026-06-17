// The sheet tab strip at the bottom: switch, add, rename (double-click) and
// delete tabs within one spreadsheet document.

import { useState } from 'react'
import type { SheetBodyV2 } from '@shared/types'
import Icon from '../../Icon'

interface Props {
  body: SheetBodyV2
  onSwitch: (index: number) => void
  onAdd: () => void
  onRename: (index: number, name: string) => void
  onDelete: (index: number) => void
}

export default function SheetTabStrip({ body, onSwitch, onAdd, onRename, onDelete }: Props): JSX.Element {
  const active = body.activeSheet ?? 0
  const [editing, setEditing] = useState<number | null>(null)

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-t border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-900/60" data-testid="sheet-tab-strip">
      {body.sheets.map((s, i) => (
        <div
          key={s.id}
          className={`group inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] cursor-pointer ${
            i === active
              ? 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-accent font-medium'
              : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800/60'
          }`}
          onClick={() => onSwitch(i)}
          onDoubleClick={() => setEditing(i)}
        >
          {editing === i ? (
            <input
              autoFocus
              defaultValue={s.name}
              onBlur={(e) => {
                onRename(i, e.target.value.trim() || s.name)
                setEditing(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditing(null)
              }}
              className="w-20 bg-transparent border-b border-accent focus:outline-none"
            />
          ) : (
            <span>{s.name}</span>
          )}
          {body.sheets.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(i)
              }}
              className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500"
              title="Delete sheet"
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd} className="icon-btn" title="Add sheet">
        <Icon name="add" size={15} />
      </button>
    </div>
  )
}
