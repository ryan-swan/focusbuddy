import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FbNode } from '@shared/types'
import Icon from './Icon'
import StageManagerStrip from './StageManagerStrip'

interface Props {
  activeTask: FbNode
  nodes: FbNode[]
  onOpenTask: (id: string) => void
  onRevealFolder: (id: string) => void
  onHome: () => void
  fromMindmap?: boolean
}

// Hover-expand glossy pill breadcrumb with Stage Manager dropdowns.
//
// Expansion / collapse is driven by a SINGLE shared leave timer so that
// moving the mouse from the pill into a dropdown (or between dropdowns)
// never collapses the pill prematurely. The pill stays expanded — showing
// the full ancestor chain — for as long as the pointer is anywhere over
// the pill OR any open dropdown panel.
//
// Stage Manager dropdown logic:
//   Hover current desk  → roomId = current.parentId  → shows sibling desks
//   Hover ancestor room → roomId = ancestor.parentId → shows sibling rooms
//
// The dropdown is centered under the specific segment that triggered it
// by measuring getBoundingClientRect() relative to the outer wrapper.
export default function CanvasBreadcrumb({
  activeTask,
  nodes,
  onOpenTask,
  onRevealFolder,
  onHome,
  fromMindmap
}: Props): JSX.Element {
  // `expanded` drives both pill breadcrumb visibility AND dropdown presence.
  // It is set true on any mouseEnter into the system (pill or dropdown) and
  // scheduled false by a shared timer on any mouseLeave — cancelled if the
  // pointer re-enters any part of the system before the timer fires.
  const [expanded, setExpanded] = useState(false)
  const [dropdown, setDropdown] = useState<{
    roomId: string | null
    activeId: string
    x: number // horizontal center relative to outer wrapper, for centering the panel
  } | null>(null)

  const leaveTimer = useRef<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── Shared hover helpers ──────────────────────────────────────────────────

  function cancelLeave(): void {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }

  function scheduleLeave(): void {
    // Cancel any existing timer before creating a new one — multiple rapid
    // mouseLeave events (child span → parent pill div) would otherwise queue
    // multiple independent timers, with only the last one tracked in
    // leaveTimer.current. The orphaned earlier timers still fire and collapse
    // the pill even after handleEnter has cancelled the tracked timer.
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    leaveTimer.current = window.setTimeout(() => {
      setExpanded(false)
      setDropdown(null)
    }, 350)
  }

  // Called on mouseEnter of the pill or any dropdown panel.
  function handleEnter(): void {
    cancelLeave()
    setExpanded(true)
  }

  // Called on mouseLeave of the pill or any dropdown panel.
  const handleLeave = scheduleLeave

  // ── Dropdown positioning ──────────────────────────────────────────────────

  function openDropdownAt(
    e: React.MouseEvent<HTMLElement>,
    roomId: string | null,
    activeId: string
  ): void {
    cancelLeave()
    setExpanded(true)
    if (wrapperRef.current) {
      const wrapperRect = wrapperRef.current.getBoundingClientRect()
      const targetRect = e.currentTarget.getBoundingClientRect()
      const x = targetRect.left - wrapperRect.left + targetRect.width / 2
      setDropdown({ roomId, activeId, x })
    }
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  const chain = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const out: FbNode[] = []
    let cur: FbNode | undefined = byId.get(activeTask.id) ?? activeTask
    let guard = 0
    while (cur && guard++ < 50) {
      out.unshift(cur)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return out
  }, [activeTask, nodes])

  const ancestors = chain.slice(0, -1)
  const current = chain[chain.length - 1] ?? activeTask
  const hasAncestors = ancestors.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} data-testid="canvas-breadcrumb" className="relative">
      {/* Breadcrumb pill */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="inline-flex items-center gap-0.5 px-3 py-1.5 rounded-full fb-glass-chrome ring-1 ring-black/[0.07] dark:ring-white/[0.07] shadow-[0_2px_10px_rgba(0,0,0,0.08)] text-[12px] max-w-full overflow-hidden cursor-default select-none min-w-[320px]"
      >
        {/* Home button — always visible */}
        <button
          onClick={onHome}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[var(--ink-50)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)] shrink-0 transition-colors"
          title="Workspace home"
          aria-label="Workspace home"
        >
          <Icon name="home" size={13} />
        </button>

        {/* Ancestor chain — visible when expanded */}
        <AnimatePresence initial={false}>
          {expanded && hasAncestors && (
            <motion.span
              key="ancestors"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.34, 1.2, 0.64, 1] }}
              className="inline-flex items-center gap-0.5 overflow-hidden shrink-0"
            >
              {ancestors.map((n) => {
                const isFolder = n.kind === 'folder'
                return (
                  <span
                    key={n.id}
                    className="inline-flex items-center gap-0.5 shrink-0"
                    onMouseEnter={(e) => openDropdownAt(e, n.parentId ?? null, n.id)}
                    onMouseLeave={handleLeave}
                  >
                    <Icon name="chevron_right" size={13} className="text-[var(--ink-30)]" />
                    <button
                      onClick={() => (isFolder ? onRevealFolder(n.id) : onOpenTask(n.id))}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] max-w-[160px] transition-colors whitespace-nowrap"
                      title={isFolder ? `Reveal "${n.title}" in sidebar` : `Open "${n.title}"`}
                    >
                      <Icon
                        name={isFolder ? 'folder' : 'task_alt'}
                        size={11}
                        className="text-[var(--ink-40)] shrink-0"
                      />
                      <span className="truncate">{n.title || '(untitled)'}</span>
                    </button>
                  </span>
                )
              })}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Collapsed depth hint — visible only when NOT expanded and ancestors exist */}
        <AnimatePresence initial={false}>
          {!expanded && hasAncestors && (
            <motion.span
              key="depth-hint"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="inline-flex items-center shrink-0 overflow-hidden"
            >
              <Icon name="chevron_right" size={13} className="text-[var(--ink-30)]" />
              <span className="text-[10px] text-[var(--ink-30)] px-1 font-mono">
                {ancestors.length > 1 ? `+${ancestors.length}` : '···'}
              </span>
            </motion.span>
          )}
        </AnimatePresence>

        {/* Current item — hovering opens desk siblings dropdown */}
        <span
          className="inline-flex items-center gap-0.5 shrink-0"
          onMouseEnter={(e) => openDropdownAt(e, current.parentId ?? null, current.id)}
          onMouseLeave={handleLeave}
        >
          <Icon name="chevron_right" size={13} className="text-[var(--ink-30)]" />
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 font-semibold text-[var(--ink-100)] max-w-[260px] rounded-full hover:bg-[var(--surface-sunken)] transition-colors">
            <Icon
              name={fromMindmap ? 'account_tree' : current.kind === 'folder' ? 'folder' : 'task_alt'}
              size={13}
              className="text-[rgb(var(--accent))] shrink-0"
            />
            <span className="truncate">{current.title || '(untitled)'}</span>
            <Icon name="expand_more" size={12} className="text-[var(--ink-30)] shrink-0 ml-0.5" />
          </span>
        </span>
      </div>

      {/* Transparent bridge — fills the mt-2 gap between pill and dropdown so
          moving the mouse from pill to dropdown never triggers a collapse. */}
      {dropdown && (
        <div
          className="absolute z-[59]"
          style={{
            top: '100%',
            left: dropdown.x,
            transform: 'translateX(-50%)',
            width: 200,
            height: 12,
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        />
      )}

      {/* Stage Manager dropdown — centered under the hovered segment */}
      <AnimatePresence>
        {dropdown && (
          <motion.div
            key="stage-dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.34, 1.2, 0.64, 1] }}
            className="absolute top-full mt-2 w-[172px] max-h-[360px] rounded-2xl overflow-hidden bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-[0_8px_40px_rgba(0,0,0,0.28)] ring-1 ring-black/[0.10] dark:ring-white/[0.10] z-[60] flex flex-col"
            style={{ left: dropdown.x, transform: 'translateX(-50%)' }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            <StageManagerStrip
              roomId={dropdown.roomId}
              activeId={dropdown.activeId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
