import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWidgetStore } from '../stores/widgets'
import { useViewStore } from '../stores/view'
import { WIDGET_CATALOG } from '../lib/widgetCatalog'
import CommandCenter from './CommandCenter'
import VoiceCommandFAB from './VoiceCommandFAB'
import Icon from './Icon'

// Max widget shortcuts shown in the tray above the main pill
const MAX_SHORTCUTS = 6

interface Props {
  onOpenBodyDouble: () => void
  onOpenSmartStack: () => void
  canSmartStack: boolean
}

function shortcutLabel(kind: string, title: string): string {
  if (kind === 'webview' || kind === 'browser') {
    const src = title.trim()
    if (src) {
      try {
        const h = new URL(src).hostname.replace(/^www\./, '')
        const label = h || src
        return label.length > 10 ? label.slice(0, 9) + '…' : label
      } catch { /* fall through */ }
    }
  }
  const raw = title.trim() || WIDGET_CATALOG.find((e) => e.kind === kind)?.label || kind
  return raw.length > 10 ? raw.slice(0, 9) + '…' : raw
}

// Gaussian-like magnification: hovered chip gets max scale, neighbours taper
function getScale(idx: number, hoverIdx: number | null): number {
  if (hoverIdx === null) return 1
  const dist = Math.abs(idx - hoverIdx)
  if (dist === 0) return 1.45
  if (dist === 1) return 1.18
  if (dist === 2) return 1.06
  return 1
}

export default function UnifiedBottomBar({
  onOpenBodyDouble,
  onOpenSmartStack,
  canSmartStack
}: Props): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [itemHoverIdx, setItemHoverIdx] = useState<number | null>(null)
  const leaveTimer = useRef<number | null>(null)

  const widgets = useWidgetStore((s) => s.widgets)
  const zoomToWidget = useWidgetStore((s) => s.zoomToWidget)
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId)
  const view = useViewStore((s) => s.view)
  const isOnCanvas = view.kind === 'task'

  // Most-recently-updated widgets on the current desk, capped at MAX_SHORTCUTS
  const shortcuts = isOnCanvas
    ? widgets
        .filter((w) => !w.archived && !w.pinned && w.kind !== 'minimap' && w.parentSectionId === null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_SHORTCUTS)
    : []

  function enter(): void {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setHovered(true)
  }

  function leave(): void {
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false)
      setItemHoverIdx(null)
    }, 300)
  }

  return (
    <div
      className="flex flex-col items-center pointer-events-auto"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Recent widget tray — appears above the main pill when hovered on canvas */}
      <AnimatePresence>
        {hovered && shortcuts.length > 0 && (
          <motion.div
            key="tray"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            className="mb-2 px-2 pt-2 pb-2.5 rounded-2xl fb-glass-chrome ring-1 ring-black/[0.07] dark:ring-white/[0.07] shadow-[0_-4px_28px_rgba(0,0,0,0.18)] flex items-end gap-0.5"
          >
            {/* "Recent" label */}
            <div className="flex items-center gap-0.5 px-1.5 self-center shrink-0 mr-1">
              <Icon name="history" size={11} className="text-[var(--ink-30)]" />
              <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--ink-30)] font-medium">Recent</span>
            </div>
            <div className="w-px h-6 bg-[var(--edge-firm)]/50 mx-0.5 self-center shrink-0" />

            {/* Widget chips with macOS dock magnification */}
            {shortcuts.map((w, idx) => {
              const entry = WIDGET_CATALOG.find((e) => e.kind === w.kind)
              const icon = entry?.icon ?? 'widgets'
              const label = shortcutLabel(w.kind, w.title)
              const isActive = w.id === activeWidgetId
              const isH = itemHoverIdx === idx
              const scale = getScale(idx, itemHoverIdx)

              return (
                <motion.button
                  key={w.id}
                  onClick={() => zoomToWidget(w.id)}
                  title={w.title || entry?.label || w.kind}
                  onMouseEnter={() => setItemHoverIdx(idx)}
                  onMouseLeave={() => setItemHoverIdx(null)}
                  animate={{ scale, y: isH ? -6 : 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 24, mass: 0.7 }}
                  style={{ originY: 1, originX: 0.5 }}
                  className={[
                    'flex flex-col items-center gap-0.5 shrink-0 w-12 px-1 pt-1.5 pb-1 rounded-xl text-[9px] font-medium transition-colors',
                    isActive
                      ? 'bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent))] ring-1 ring-[rgb(var(--accent)/0.35)]'
                      : 'text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)]'
                  ].join(' ')}
                >
                  <Icon
                    name={icon}
                    size={18}
                    className={isActive ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-60)]'}
                  />
                  <span className="w-full text-center truncate leading-tight">{label}</span>
                  {isActive && (
                    <div className="w-1 h-1 rounded-full bg-[rgb(var(--accent))] -mt-0.5" />
                  )}
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main pill — liquid glass: search + divider + mic */}
      <div className="flex items-center rounded-full bg-white/[0.12] dark:bg-white/[0.07] backdrop-blur-2xl ring-1 ring-white/[0.22] dark:ring-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] px-1 py-0.5 transition-shadow duration-200 hover:shadow-[0_8px_44px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.22)]">
        <CommandCenter
          onOpenBodyDouble={onOpenBodyDouble}
          onOpenSmartStack={onOpenSmartStack}
          canSmartStack={canSmartStack}
        />
        <div className="w-px h-5 bg-[var(--edge-firm)]/70 mx-1 shrink-0" />
        <VoiceCommandFAB />
      </div>
    </div>
  )
}
