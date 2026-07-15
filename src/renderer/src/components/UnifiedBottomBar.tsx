import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWidgetStore } from '../stores/widgets'
import { useViewStore } from '../stores/view'
import { WIDGET_CATALOG } from '../lib/widgetCatalog'
import { useVoicePhaseStore } from '../stores/voicePhase'
import VoiceCommandFAB from './VoiceCommandFAB'
import Icon from './Icon'

// Max widget shortcuts shown in the dock tray
const MAX_SHORTCUTS = 6

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

// Gaussian-style dock magnification
function getScale(idx: number, hoverIdx: number | null): number {
  if (hoverIdx === null) return 1
  const dist = Math.abs(idx - hoverIdx)
  if (dist === 0) return 1.45
  if (dist === 1) return 1.18
  if (dist === 2) return 1.06
  return 1
}

export default function UnifiedBottomBar(): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [itemHoverIdx, setItemHoverIdx] = useState<number | null>(null)
  const leaveTimer = useRef<number | null>(null)

  const widgets = useWidgetStore((s) => s.widgets)
  const zoomToWidget = useWidgetStore((s) => s.zoomToWidget)
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId)
  const view = useViewStore((s) => s.view)
  const isOnCanvas = view.kind === 'task'
  const voicePhase = useVoicePhaseStore((s) => s.phase)
  const voiceActive = voicePhase !== 'idle'

  // Lock the bar open while any voice phase is active — the listening /
  // staged / result overlays render above the bar's bounding box, so the
  // cursor moving to them triggers onMouseLeave and would collapse the dock
  // (unmounting the FAB and killing the recording). We also cancel any
  // pending close timer the instant voice activates.
  const wasVoiceActiveRef = useRef(false)
  useEffect(() => {
    if (voiceActive) {
      wasVoiceActiveRef.current = true
      if (leaveTimer.current !== null) {
        window.clearTimeout(leaveTimer.current)
        leaveTimer.current = null
      }
      setHovered(true)
    } else if (wasVoiceActiveRef.current) {
      // Voice just went idle — schedule a polite close so the user can read
      // the result card before the bar disappears, but don't force-close if
      // the cursor is naturally still over the bar.
      wasVoiceActiveRef.current = false
      leaveTimer.current = window.setTimeout(() => {
        setHovered(false)
        setItemHoverIdx(null)
      }, 1200)
    }
  }, [voiceActive])

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
    // Don't start the close timer while the voice overlay is open — the
    // overlay renders above the bar and the cursor naturally drifts there.
    if (voiceActive) return
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false)
      setItemHoverIdx(null)
    }, 320)
  }

  return (
    <div
      className="flex flex-col items-center pointer-events-auto"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onWheel={(e) => e.stopPropagation()}
    >
      <AnimatePresence mode="wait" initial={false}>
        {hovered ? (
          /* ── Expanded dock block ────────────────────────────────────────── */
          <motion.div
            key="dock"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            // No overflow-hidden — CommandCenter and VoiceCommandFAB render
            // overlays via absolute bottom-full that must not be clipped.
            className={`rounded-2xl bg-[var(--surface-raised)]/90 dark:bg-[var(--surface-raised)]/95 backdrop-blur-2xl shadow-[0_-4px_40px_rgba(0,0,0,0.26),0_8px_32px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.10)] transition-shadow duration-300 ${
              voiceActive
                ? 'ring-1 ring-violet-400/30 shadow-[0_-4px_40px_rgba(0,0,0,0.26),0_8px_32px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.10),0_0_0_1px_rgba(139,92,246,0.30)]'
                : 'ring-1 ring-black/[0.10] dark:ring-white/[0.10]'
            }`}
          >
            {/* Widget tray — only when on a canvas with recent widgets */}
            {shortcuts.length > 0 && (
              <div className="flex items-end gap-0.5 px-3 pt-3 pb-2.5 border-b border-[var(--edge-soft)]">
                {/* Label */}
                <div className="flex items-center gap-1 self-center shrink-0 mr-2">
                  <Icon name="history" size={11} className="text-[var(--ink-30)]" />
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--ink-30)] font-medium">
                    Recent
                  </span>
                </div>
                <div className="w-px h-6 bg-[var(--edge-firm)]/50 mr-1 self-center shrink-0" />

                {/* Chips */}
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
              </div>
            )}

            {/* Mic row */}
            <div className="flex items-center justify-center px-3 py-2">
              <VoiceCommandFAB />
            </div>
          </motion.div>
        ) : (
          /* ── Collapsed: thin accent strip ───────────────────────────────── */
          <motion.div
            key="strip"
            initial={{ opacity: 0, scaleX: 0.5 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.5 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="rounded-full cursor-pointer"
            style={{
              width: 120,
              height: 4,
              background: 'rgb(var(--accent) / 0.35)',
            }}
            onMouseEnter={enter}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
