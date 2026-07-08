import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from './Icon'
import LoadMeter from './LoadMeter'
import { useCognitiveLoad } from '../lib/useCognitiveLoad'

interface Props {
  onTidy: () => void
  tidyDisabled: boolean
  onBuild: () => void
  onSaveTemplate: () => void
  saveDisabled: boolean
  savingTemplate: boolean
  zoom: number
  onResetZoom: () => void
}

export default function FloatingPill({
  onTidy,
  tidyDisabled,
  onBuild,
  onSaveTemplate,
  saveDisabled,
  savingTemplate,
  zoom,
  onResetZoom
}: Props): JSX.Element {
  const pillRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [defaultY, setDefaultY] = useState(60)
  const [hovered, setHovered] = useState(false)
  const hoverTimer = useRef<number | undefined>(undefined)

  // Cognitive load tier drives the outer ring color
  const { tier } = useCognitiveLoad()
  const overloaded = tier.label === 'Overloaded'

  const dragData = useRef<{
    startMX: number
    startMY: number
    startPX: number
    startPY: number
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

  useEffect(() => {
    function measure(): void {
      const el = document.querySelector('[data-canvas-surface="true"]') as HTMLElement | null
      if (el) setDefaultY(el.getBoundingClientRect().top + 12)
    }
    measure()
    window.addEventListener('resize', measure)
    const t = window.setTimeout(measure, 300)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearTimeout(t)
    }
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
    e.preventDefault()
    const rect = pillRef.current?.getBoundingClientRect()
    if (!rect) return
    dragData.current = {
      startMX: e.clientX,
      startMY: e.clientY,
      startPX: rect.left,
      startPY: rect.top
    }
    window.addEventListener('mousemove', onMove.current)
    window.addEventListener('mouseup', onUp.current)
  }

  function handleMouseEnter(): void {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    setHovered(true)
  }

  function handleMouseLeave(): void {
    hoverTimer.current = window.setTimeout(() => setHovered(false), 300)
  }

  useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current) }, [])

  const zoomPct = `${Math.round(zoom * 100)}%`

  return (
    <div
      ref={pillRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        setPos(null)
      }}
      title="Drag to reposition · Double-click to re-center"
      data-testid="floating-pill"
      style={{
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { left: '50%', transform: 'translateX(-50%)', top: defaultY }),
        // Cognitive load ring — entire outer ring tinted by load tier
        boxShadow: `0 0 0 2px ${tier.ringColor}, 0 6px 24px ${tier.shadowColor}`,
        transition: 'box-shadow 700ms ease'
      }}
      className={[
        'fixed z-[50] flex items-center rounded-full',
        'bg-[var(--surface-raised)]/95 backdrop-blur-sm',
        'select-none cursor-grab active:cursor-grabbing',
        overloaded ? 'animate-pulse' : ''
      ].join(' ')}
    >
      {/* Drag affordance — always visible */}
      <div className="pl-2 pr-0.5 py-1.5 flex items-center shrink-0">
        <Icon name="drag_indicator" size={12} className="text-[var(--ink-25,var(--ink-30))] pointer-events-none" />
      </div>

      {/* Collapsed: just the load icon */}
      <AnimatePresence initial={false}>
        {!hovered && (
          <motion.div
            key="collapsed"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeInOut' }}
            className="overflow-hidden flex items-center"
          >
            <div className="pr-1.5 py-0.5">
              <LoadMeter />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded: full controls */}
      <AnimatePresence initial={false}>
        {hovered && (
          <motion.div
            key="expanded"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.20, ease: 'easeOut' }}
            className="overflow-hidden flex items-center gap-0.5 pr-2 py-1"
          >
            <button
              onClick={onTidy}
              disabled={tidyDisabled}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] disabled:opacity-40 transition-colors whitespace-nowrap"
              title="Tidy — arrange widgets in clean rows"
              data-testid="pill-tidy"
            >
              <Icon name="grid_view" size={13} />
              <span>Tidy</span>
            </button>

            <div className="w-px h-3.5 bg-[var(--edge-firm)] mx-0.5 shrink-0" />

            <button
              onClick={onBuild}
              className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] hover:text-accent transition-colors"
              title="Build with AI (⌘⇧K)"
              data-testid="pill-build"
            >
              <Icon name="auto_awesome" size={13} />
            </button>

            <button
              onClick={onSaveTemplate}
              disabled={saveDisabled}
              className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] disabled:opacity-40 transition-colors"
              title={savingTemplate ? 'Saving…' : 'Save as template'}
              data-testid="pill-save-template"
            >
              <Icon name={savingTemplate ? 'hourglass_empty' : 'bookmark_add'} size={13} />
            </button>

            <div className="w-px h-3.5 bg-[var(--edge-firm)] mx-0.5 shrink-0" />

            <button
              onClick={onResetZoom}
              className="text-[11px] font-mono text-[var(--ink-60)] hover:text-[var(--ink-100)] px-1.5 py-0.5 rounded-full hover:bg-[var(--surface-sunken)] transition-colors tabular-nums min-w-[36px] text-center whitespace-nowrap"
              title="Reset zoom (⌘0)"
              data-testid="pill-zoom"
            >
              {zoomPct}
            </button>

            <div className="w-px h-3.5 bg-[var(--edge-firm)] mx-0.5 shrink-0" />

            <LoadMeter />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
