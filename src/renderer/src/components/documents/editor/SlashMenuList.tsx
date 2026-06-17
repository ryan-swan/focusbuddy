// The dropdown shown when the user types "/" in the document. It is a controlled
// list driven by the Tiptap suggestion plugin: the plugin feeds it items and
// forwards keyboard events through the imperative handle so arrow keys and Enter
// work while the editor keeps focus.

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import Icon from '../../Icon'

export interface SlashItem {
  title: string
  subtitle: string
  icon: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: (props: { editor: any; range: any }) => void
}

export interface SlashListHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

interface Props {
  items: SlashItem[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: (item: SlashItem) => void
}

const SlashMenuList = forwardRef<SlashListHandle, Props>(function SlashMenuList(
  { items, command },
  ref
): JSX.Element {
  const [selected, setSelected] = useState(0)

  useEffect(() => setSelected(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: (e: KeyboardEvent): boolean => {
      if (e.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % Math.max(1, items.length))
        return true
      }
      if (e.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % Math.max(1, items.length))
        return true
      }
      if (e.key === 'Enter') {
        const item = items[selected]
        if (item) command(item)
        return true
      }
      return false
    }
  }))

  if (items.length === 0) {
    return (
      <div className="w-64 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl p-2 text-[12px] text-stone-400">
        No matching command
      </div>
    )
  }

  return (
    <div
      data-testid="doc-slash-menu"
      className="w-64 max-h-72 overflow-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1"
    >
      {items.map((item, i) => (
        <button
          key={item.title}
          onMouseEnter={() => setSelected(i)}
          onClick={() => command(item)}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left ${
            i === selected ? 'bg-accent/10' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
        >
          <span className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300">
            <Icon name={item.icon} size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-stone-800 dark:text-stone-100">
              {item.title}
            </span>
            <span className="block text-[11px] text-stone-400 truncate">{item.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  )
})

export default SlashMenuList
