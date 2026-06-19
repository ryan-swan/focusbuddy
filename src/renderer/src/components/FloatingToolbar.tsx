import { Fragment, useState } from 'react'
import Icon from './Icon'

export interface ToolbarAction {
  icon: string
  label: string
  shortcut?: string
  color?: string
  onClick: () => void
  separatorAfter?: boolean
}

interface Props {
  actions: ToolbarAction[]
}

export default function FloatingToolbar({ actions }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="absolute top-3 left-3 z-40 flex flex-col gap-0.5 bg-white/95 dark:bg-stone-800/95 backdrop-blur rounded-lg shadow-lg border border-stone-200 dark:border-stone-700 p-1 overflow-hidden"
      style={{
        width: expanded ? 174 : 40,
        transition: 'width 200ms ease-out'
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="h-7 w-full inline-flex items-center justify-start rounded px-1.5 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100 transition-colors gap-1.5"
        title={expanded ? 'Collapse toolbar' : 'Expand toolbar'}
        aria-label={expanded ? 'Collapse toolbar' : 'Expand toolbar'}
      >
        <Icon
          name={expanded ? 'keyboard_double_arrow_left' : 'keyboard_double_arrow_right'}
          size={14}
          className="shrink-0"
        />
        {expanded && (
          <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 truncate">
            Tools
          </span>
        )}
      </button>
      <div className="h-px bg-stone-200 dark:bg-stone-700" />
      {actions.map((a, i) => (
        <Fragment key={`${a.label}-${i}`}>
          <button
            onClick={a.onClick}
            className="h-8 w-full inline-flex items-center justify-start rounded px-2 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-stone-100 transition-colors gap-2"
            title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
          >
            <Icon
              name={a.icon}
              size={16}
              className={a.color ? 'shrink-0' : 'shrink-0 text-stone-600 dark:text-stone-300'}
              style={a.color ? { color: a.color } : undefined}
            />
            {expanded && (
              <span className="text-xs truncate flex-1 text-left">{a.label}</span>
            )}
            {expanded && a.shortcut && (
              <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono shrink-0">{a.shortcut}</span>
            )}
          </button>
          {a.separatorAfter && <div className="my-0.5 h-px bg-stone-200 dark:bg-stone-700" />}
        </Fragment>
      ))}
    </div>
  )
}
