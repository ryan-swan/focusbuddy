import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWidgetStore } from '../stores/widgets'
import { WIDGET_CATALOG } from '../lib/widgetCatalog'
import Icon from './Icon'

// Abbreviated label for a widget in the dock.
function dockLabel(kind: string, title: string, content: string): string {
  if (kind === 'webview' || kind === 'browser') {
    const src = title.trim() || content.trim()
    if (src) {
      try {
        const h = new URL(src).hostname.replace(/^www\./, '')
        const label = h || src
        return label.length > 12 ? label.slice(0, 11) + '…' : label
      } catch { /* fall through */ }
    }
  }
  const raw = title.trim() || WIDGET_CATALOG.find((e) => e.kind === kind)?.label || kind
  return raw.length > 12 ? raw.slice(0, 11) + '…' : raw
}

// Gaussian-like magnification: hovered chip gets max scale, neighbors taper off
function getScale(idx: number, hoverIdx: number | null): number {
  if (hoverIdx === null) return 1
  const dist = Math.abs(idx - hoverIdx)
  if (dist === 0) return 1.55
  if (dist === 1) return 1.22
  if (dist === 2) return 1.08
  return 1
}

export default function CanvasWidgetDock(): JSX.Element {
  const widgets = useWidgetStore((s) => s.widgets)
  const zoomToWidget = useWidgetStore((s) => s.zoomToWidget)
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId)

  const [dockHovered, setDockHovered] = useState(false)
  const [itemHoverIdx, setItemHoverIdx] = useState<number | null>(null)
  const leaveTimer = useRef<number | undefined>(undefined)

  function onEnter(): void {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setDockHovered(true)
  }
  function onLeave(): void {
    leaveTimer.current = window.setTimeout(() => {
      setDockHovered(false)
      setItemHoverIdx(null)
    }, 300)
  }

  // Only show non-archived, non-pinned, non-minimap widgets
  const visible = widgets.filter(
    (w) => !w.archived && !w.pinned && w.kind !== 'minimap'
  )

  if (visible.length === 0) return <></>

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onWheel={(e) => e.stopPropagation()}
      className="absolute bottom-0 left-1/2 -translate-x-1/2 z-[44] pointer-events-auto flex flex-col items-center"
      style={{ maxWidth: 'calc(100% - 80px)', minWidth: 120 }}
    >
      {/* Collapsed indicator — thin accent pill at very bottom */}
      <AnimatePresence>
        {!dockHovered && (
          <motion.div
            key="pill"
            initial={{ opacity: 0, scaleX: 0.6 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.6 }}
            transition={{ duration: 0.18 }}
            className="mb-1.5 rounded-full bg-[rgb(var(--accent)/0.28)] hover:bg-[rgb(var(--accent)/0.55)] transition-colors cursor-pointer"
            style={{ width: Math.min(visible.length * 20 + 24, 160), height: 4 }}
          />
        )}
      </AnimatePresence>

      {/* Expanded dock */}
      <AnimatePresence>
        {dockHovered && (
          <motion.div
            key="dock"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
            className="px-3 pt-2 pb-3 rounded-t-2xl fb-glass-chrome ring-1 ring-black/[0.07] dark:ring-white/[0.07] shadow-[0_-4px_28px_rgba(0,0,0,0.16)] flex flex-col items-center"
          >
            {/* Drag handle hint */}
            <div className="flex items-center justify-center mb-2">
              <div className="w-8 h-[3px] rounded-full bg-[var(--ink-20)]" />
            </div>

            {/* Scrollable dock items with magnification */}
            <div
              className="flex items-end gap-1 overflow-x-auto"
              style={{ scrollbarWidth: 'none' }}
            >
              {visible.map((w, idx) => {
                const entry = WIDGET_CATALOG.find((e) => e.kind === w.kind)
                const icon = entry?.icon ?? 'widgets'
                const label = dockLabel(w.kind, w.title, w.content)
                const isActive = w.id === activeWidgetId
                const scale = getScale(idx, itemHoverIdx)
                const isHovered = itemHoverIdx === idx

                return (
                  <motion.button
                    key={w.id}
                    onClick={() => zoomToWidget(w.id)}
                    title={w.title || entry?.label || w.kind}
                    onMouseEnter={() => setItemHoverIdx(idx)}
                    onMouseLeave={() => setItemHoverIdx(null)}
                    animate={{ scale, y: isHovered ? -8 : 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24, mass: 0.7 }}
                    style={{ originY: 1, originX: 0.5 }}
                    className={[
                      'flex flex-col items-center gap-1 shrink-0 w-14 px-1 pt-1.5 pb-1 rounded-xl text-[10px] font-medium transition-colors',
                      isActive
                        ? 'bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent))] ring-1 ring-[rgb(var(--accent)/0.35)]'
                        : 'text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)]'
                    ].join(' ')}
                  >
                    <Icon
                      name={icon}
                      size={20}
                      className={isActive ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-60)]'}
                    />
                    <span className="w-full text-center truncate leading-tight">{label}</span>
                    {/* Active indicator dot */}
                    {isActive && (
                      <div className="w-1 h-1 rounded-full bg-[rgb(var(--accent))] -mt-0.5" />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
