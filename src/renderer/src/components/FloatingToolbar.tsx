import { Fragment, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon'
import WidgetPalette from './WidgetPalette'
import type { WidgetCatalogEntry } from '../lib/widgetCatalog'

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
  // Widget palette
  onAddWidget: (entry: WidgetCatalogEntry) => void
  onImport?: () => void
  onBringSynced?: () => void
  paletteDisabled: boolean
  // History
  onHistory: () => void
  historyDisabled: boolean
}

export default function FloatingToolbar({
  actions,
  onAddWidget,
  onImport,
  onBringSynced,
  paletteDisabled,
  onHistory,
  historyDisabled
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const dragData = useRef<{
    startMX: number; startMY: number; startPX: number; startPY: number
  } | null>(null)

  const onMove = useRef((e: MouseEvent): void => {
    if (!dragData.current) return
    setPos({
      x: dragData.current.startPX + (e.clientX - dragData.current.startMX),
      y: dragData.current.startPY + (e.clientY - dragData.current.startMY)
    })
  })

  const onUp = useRef((): void => {
    dragData.current = null
    window.removeEventListener('mousemove', onMove.current)
    window.removeEventListener('mouseup', onUp.current)
  })

  // Only used when the user has manually dragged the toolbar
  const [defaultY, setDefaultY] = useState<number | null>(null)
  useEffect(() => {
    function measure(): void {
      const canvas = document.querySelector('[data-canvas-surface="true"]') as HTMLElement | null
      if (!canvas) return
      const cr = canvas.getBoundingClientRect()
      setDefaultY(cr.top + cr.height / 2)
    }
    measure()
    window.addEventListener('resize', measure)
    const t = window.setTimeout(measure, 300)
    return () => { window.removeEventListener('resize', measure); window.clearTimeout(t) }
  }, [])

  useEffect(() => {
    const move = onMove.current
    const up = onUp.current
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.preventDefault()
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    dragData.current = {
      startMX: e.clientX, startMY: e.clientY,
      startPX: rect.left, startPY: rect.top
    }
    window.addEventListener('mousemove', onMove.current)
    window.addEventListener('mouseup', onUp.current)
  }

  // Default: CSS right-anchored. After dragging: absolute left/top.
  const posStyle = pos
    ? { left: pos.x, top: pos.y }
    : { right: 12, top: defaultY ?? '50%', transform: defaultY ? undefined : 'translateY(-50%)' }

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        setPos(null)
      }}
      title="Drag to reposition · Double-click to re-center"
      onWheel={(e) => e.stopPropagation()}
      className="fixed z-[45] flex flex-col items-stretch fb-glass-chrome rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing shadow-[0_4px_24px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.07] dark:ring-white/[0.07]"
      style={posStyle}
    >
      {/* Collapsed header: drag handle + toggle icon, fixed narrow width */}
      <div className="flex flex-col items-center w-10 shrink-0">
        <div className="pt-1.5 pb-0.5 flex items-center justify-center w-full">
          <Icon name="drag_indicator" size={12} className="text-[var(--ink-25,var(--ink-30))] pointer-events-none" />
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="h-8 w-8 mx-1 mb-1 inline-flex items-center justify-center rounded-xl text-[var(--ink-50)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] transition-colors"
          title={expanded ? 'Collapse tools' : 'Expand tools'}
        >
          <Icon name={expanded ? 'keyboard_double_arrow_up' : 'construction'} size={15} className="shrink-0" />
        </button>
      </div>

      {/* Expandable section — drops down, drives width to 178px */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="actions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.34, 1.2, 0.64, 1] }}
            className="overflow-hidden flex flex-col"
            style={{ width: 178 }}
            data-no-drag
          >
            <div className="mx-2 h-px bg-[var(--edge-soft)] mb-1" />

            {/* Widget palette */}
            <div className="px-1.5 mb-0.5">
              <WidgetPalette
                onAdd={onAddWidget}
                onImport={onImport}
                onBringSynced={onBringSynced}
                disabled={paletteDisabled}
                compact
              />
            </div>

            {/* History */}
            <button
              onClick={onHistory}
              disabled={historyDisabled}
              className="mx-1 h-8 inline-flex items-center gap-2 rounded-xl px-2 text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] transition-colors disabled:opacity-40"
              title="Desk history — time-travel through this desk's changes"
            >
              <Icon name="history" size={15} className="shrink-0 text-[var(--ink-60)]" />
              <span className="text-[12px] truncate">History</span>
            </button>

            <div className="mx-2 h-px bg-[var(--edge-soft)] my-1" />

            {/* Section jumps + static actions */}
            {actions.map((a, i) => (
              <Fragment key={`${a.label}-${i}`}>
                <button
                  onClick={a.onClick}
                  className="mx-1 h-8 inline-flex items-center gap-2 rounded-xl px-2 text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] transition-colors"
                  title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
                >
                  <Icon
                    name={a.icon}
                    size={15}
                    className="shrink-0"
                    style={a.color ? { color: a.color } : { color: 'var(--ink-50)' }}
                  />
                  <span className="text-[12px] truncate flex-1 text-left">{a.label}</span>
                  {a.shortcut && (
                    <span className="text-[10px] text-[var(--ink-40)] font-mono shrink-0">{a.shortcut}</span>
                  )}
                </button>
                {a.separatorAfter && <div className="mx-2 h-px bg-[var(--edge-soft)] my-1" />}
              </Fragment>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
