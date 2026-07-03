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
      className="absolute top-3 left-3 z-40 flex flex-col gap-0.5 fb-glass-chrome rounded-lg p-1 overflow-hidden"
      style={{
        width: expanded ? 174 : 40,
        transition: 'width 200ms var(--ease-spring-crisp)'
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="h-7 w-full inline-flex items-center justify-start rounded px-1.5 text-[var(--ink-50)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] transition-colors gap-1.5"
        title={expanded ? 'Collapse toolbar' : 'Expand toolbar'}
        aria-label={expanded ? 'Collapse toolbar' : 'Expand toolbar'}
      >
        <Icon
          name={expanded ? 'keyboard_double_arrow_left' : 'keyboard_double_arrow_right'}
          size={14}
          className="shrink-0"
        />
        {expanded && (
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] truncate">
            Tools
          </span>
        )}
      </button>
      <div className="h-px bg-[var(--edge-soft)]" />
      {actions.map((a, i) => (
        <Fragment key={`${a.label}-${i}`}>
          <button
            onClick={a.onClick}
            className="h-8 w-full inline-flex items-center justify-start rounded px-2 text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] transition-colors gap-2"
            title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
          >
            <Icon
              name={a.icon}
              size={16}
              className={a.color ? 'shrink-0' : 'shrink-0 text-[var(--ink-70)]'}
              style={a.color ? { color: a.color } : undefined}
            />
            {expanded && (
              <span className="text-xs truncate flex-1 text-left">{a.label}</span>
            )}
            {expanded && a.shortcut && (
              <span className="text-[10px] text-[var(--ink-50)] font-mono shrink-0">{a.shortcut}</span>
            )}
          </button>
          {a.separatorAfter && <div className="my-0.5 h-px bg-[var(--edge-soft)]" />}
        </Fragment>
      ))}
    </div>
  )
}
