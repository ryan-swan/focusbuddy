import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWidgetStore } from '../stores/widgets'
import Icon from './Icon'

const EASE_ENTER = [0.34, 1.2, 0.64, 1] as const
const EASE_EXIT = [0.4, 0, 1, 1] as const

// Hover-expand zoom pill — collapsed shows only %; hovered reveals – + and pan tool.
// Expands symmetrically: – slides in from the left, +|hand from the right.
export default function ZoomControls(): JSX.Element {
  const zoom = useWidgetStore((s) => s.zoom)
  const setZoom = useWidgetStore((s) => s.setZoom)
  const setPan = useWidgetStore((s) => s.setPan)
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function reset(): void {
    setZoom(1)
    setPan(0, 0)
  }

  function enter(): void {
    if (leaveTimer.current !== undefined) clearTimeout(leaveTimer.current)
    setHovered(true)
  }

  function leave(): void {
    leaveTimer.current = setTimeout(() => setHovered(false), 280)
  }

  return (
    <div
      onMouseEnter={enter}
      onMouseLeave={leave}
      className="absolute bottom-3 left-3 z-30 fb-glass-chrome rounded-md border border-[color:var(--glass-chrome-border)] shadow-md flex items-stretch overflow-hidden"
    >
      {/* – slides in from the left on hover */}
      <AnimatePresence initial={false}>
        {hovered && (
          <motion.div
            key="minus"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1, transition: { duration: 0.18, ease: EASE_ENTER } }}
            exit={{ width: 0, opacity: 0, transition: { duration: 0.13, ease: EASE_EXIT } }}
            className="overflow-hidden flex items-stretch"
          >
            <button
              onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
              className="h-7 w-6 inline-flex items-center justify-center text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors"
              title="Zoom out (⌘[)"
              aria-label="Zoom out"
            >
              <Icon name="remove" size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always-visible: % only */}
      <button
        onClick={reset}
        className="h-7 px-1.5 inline-flex items-center justify-center text-[10px] font-mono tabular-nums text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors min-w-[34px]"
        title="Reset view (⌘0)"
      >
        {Math.round(zoom * 100)}%
      </button>

      {/* + and pan tool slide in from the right on hover */}
      <AnimatePresence initial={false}>
        {hovered && (
          <motion.div
            key="plus-pan"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1, transition: { duration: 0.18, ease: EASE_ENTER } }}
            exit={{ width: 0, opacity: 0, transition: { duration: 0.13, ease: EASE_EXIT } }}
            className="overflow-hidden flex items-stretch"
          >
            <button
              onClick={() => setZoom(Math.min(4, zoom + 0.1))}
              className="h-7 w-6 inline-flex items-center justify-center text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors"
              title="Zoom in (⌘])"
              aria-label="Zoom in"
            >
              <Icon name="add" size={13} />
            </button>
            <span className="w-px bg-[color:var(--glass-chrome-border)] shrink-0 self-stretch" />
            <button
              onClick={reset}
              className="h-7 w-7 inline-flex items-center justify-center text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors"
              title="Pan tool — drag the background to move the canvas"
              aria-label="Pan tool"
            >
              <Icon name="pan_tool" size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
