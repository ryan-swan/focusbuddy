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

// Hover-expand glossy pill breadcrumb.
// Collapsed: home icon + depth indicator + current task name.
// Hovered: full ancestry chain expands inline with a spring animation.
// Hovering over any breadcrumb segment drops down a stage-manager panel
// showing sibling desks (current segment) or child desks (ancestor segment).
export default function CanvasBreadcrumb({
  activeTask,
  nodes,
  onOpenTask,
  onRevealFolder,
  onHome,
  fromMindmap
}: Props): JSX.Element {
  const [hovered, setHovered] = useState(false)
  // undefined = closed; string | null = open with that roomId
  const [dropdownRoomId, setDropdownRoomId] = useState<string | null | undefined>(undefined)
  const leaveTimer = useRef<number | null>(null)

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
  const dropdownOpen = dropdownRoomId !== undefined

  function openDropdown(roomId: string | null): void {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    setDropdownRoomId(roomId)
  }

  function scheduleClose(): void {
    leaveTimer.current = window.setTimeout(() => setDropdownRoomId(undefined), 320)
  }

  return (
    <div data-testid="canvas-breadcrumb" className="relative">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-full fb-glass-chrome ring-1 ring-black/[0.07] dark:ring-white/[0.07] shadow-[0_2px_10px_rgba(0,0,0,0.08)] text-[12px] max-w-full overflow-hidden cursor-default select-none min-w-[240px]"
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

        {/* Ancestor chain — only visible when hovered */}
        <AnimatePresence initial={false}>
          {hovered && hasAncestors && (
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
                // For ancestors: hovering shows children of that ancestor (rooms/desks inside it)
                const ancestorDropdownId = n.id
                return (
                  <span
                    key={n.id}
                    className="inline-flex items-center gap-0.5 shrink-0"
                    onMouseEnter={() => openDropdown(ancestorDropdownId)}
                    onMouseLeave={scheduleClose}
                  >
                    <Icon name="chevron_right" size={13} className="text-[var(--ink-30)]" />
                    <button
                      onClick={() => (isFolder ? onRevealFolder(n.id) : onOpenTask(n.id))}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] max-w-[160px] transition-colors whitespace-nowrap"
                      title={isFolder ? `Reveal "${n.title}" in sidebar` : `Open "${n.title}"`}
                    >
                      <Icon name={isFolder ? 'folder' : 'task_alt'} size={11} className="text-[var(--ink-40)] shrink-0" />
                      <span className="truncate">{n.title || '(untitled)'}</span>
                    </button>
                  </span>
                )
              })}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Collapsed depth hint — visible only when NOT hovered and ancestors exist */}
        <AnimatePresence initial={false}>
          {!hovered && hasAncestors && (
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

        {/* Current item — always visible. Hovering shows siblings (same room). */}
        <span
          className="inline-flex items-center gap-0.5 shrink-0"
          onMouseEnter={() => openDropdown(current.parentId ?? null)}
          onMouseLeave={scheduleClose}
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

      {/* Stage Manager dropdown — falls down from the breadcrumb pill */}
      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            key="stage-dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.34, 1.2, 0.64, 1] }}
            className="absolute top-full left-0 mt-2 w-[172px] max-h-[360px] rounded-2xl overflow-hidden bg-[var(--surface-raised)] backdrop-blur-xl border border-[var(--edge-soft)] shadow-[0_8px_40px_rgba(0,0,0,0.28)] ring-1 ring-black/[0.10] dark:ring-white/[0.10] z-[60] flex flex-col"
            onMouseEnter={() => {
              if (leaveTimer.current) {
                clearTimeout(leaveTimer.current)
                leaveTimer.current = null
              }
            }}
            onMouseLeave={scheduleClose}
          >
            <StageManagerStrip
              roomId={dropdownRoomId as string | null}
              activeId={current.id}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
