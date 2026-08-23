import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FbNode } from '@shared/types'
import Icon from './Icon'
import StageManagerStrip from './StageManagerStrip'
import { useViewStore } from '../stores/view'
import ShareDialog from './ShareDialog'

interface Props {
  activeTask: FbNode
  nodes: FbNode[]
  onOpenTask: (id: string) => void
  onHome: () => void
  fromMindmap?: boolean
  onAssignToRoom?: (deskId: string, roomId: string) => void
  onCreateRoomFromDesk?: (deskId: string) => void
  onRenameTask?: (id: string, title: string) => void
  // Rendered inside the pill after a divider — the view-mode switcher lives
  // here so "Free canvas" reads as part of the breadcrumb, not a stray button.
  trailing?: React.ReactNode
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
  onHome,
  fromMindmap,
  onAssignToRoom,
  onCreateRoomFromDesk,
  onRenameTask,
  trailing
}: Props): JSX.Element {
  // Global back + canonical room open, so a desk can always step back to the
  // previous screen and open the room it lives in from the breadcrumb.
  const goBack = useViewStore((s) => s.back)
  const canBack = useViewStore((s) => s.past.length > 0)
  const goRoom = useViewStore((s) => s.goRoom)
  // Share dialog for the current room or desk, opened from the breadcrumb.
  const [shareOpen, setShareOpen] = useState(false)
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
  // Room assignment popover — shown when clicking "Add to room…" on a free desk
  const [roomPickerOpen, setRoomPickerOpen] = useState(false)

  const leaveTimer = useRef<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── Inline rename state ───────────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus and select-all when rename mode activates
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renaming])

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
    }, 450)
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
  // hasAncestors is true if we found ancestors in the chain OR if the current
  // node has a parentId that didn't resolve into nodes yet (timing / load order).
  // This ensures the depth hint and expand always fire when a parent exists.
  const hasAncestors = ancestors.length > 0 || !!current.parentId

  // Rooms available for desk assignment (top-level folders)
  const rooms = useMemo(
    () => nodes.filter((n) => !n.archived && n.kind === 'folder' && n.parentId === null),
    [nodes]
  )

  // Whether the current desk is free (no parent) and we have assign callbacks
  const isFreeDesk = current.kind === 'task' && !current.parentId && (onAssignToRoom || onCreateRoomFromDesk)

  // ── Inline rename helpers (depend on `current`) ────────────────────────────

  function startRename(): void {
    setRenameValue(current.title || '')
    setRenaming(true)
  }

  function commitRename(): void {
    if (!renaming) return
    setRenaming(false)
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== current.title) {
      onRenameTask?.(current.id, trimmed)
    }
  }

  function cancelRename(): void {
    setRenaming(false)
    setRenameValue('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} data-testid="canvas-breadcrumb" className="relative w-fit">
      {/* Breadcrumb pill */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="inline-flex items-center gap-0.5 px-3 py-1.5 rounded-full fb-glass-chrome ring-1 ring-black/[0.07] dark:ring-white/[0.07] shadow-[0_2px_10px_rgba(0,0,0,0.08)] text-[12px] max-w-full overflow-hidden cursor-default select-none"
      >
        {/* Back — steps to the previous screen; shown only when there is history */}
        {canBack && (
          <button
            onClick={goBack}
            className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[var(--ink-50)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)] shrink-0 transition-colors"
            title="Back"
            aria-label="Back"
            data-testid="canvas-back"
          >
            <Icon name="arrow_back" size={13} />
          </button>
        )}
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
              className="inline-flex items-center gap-0.5 shrink-0"
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
                      onClick={() => (isFolder ? goRoom(n.id) : onOpenTask(n.id))}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] max-w-[160px] transition-colors whitespace-nowrap"
                      title={isFolder ? `Open room "${n.title}"` : `Open "${n.title}"`}
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
              <Icon name="chevron_right" size={13} className="text-[var(--ink-40)]" />
              <span className="text-[10px] text-[var(--ink-50)] px-1 font-mono">
                {ancestors.length > 1 ? `+${ancestors.length}` : '···'}
              </span>
            </motion.span>
          )}
        </AnimatePresence>

        {/* Current item — hovering opens desk siblings dropdown; double-click to rename */}
        <span
          className="inline-flex items-center gap-0.5 shrink-0"
          onMouseEnter={(e) => !renaming && openDropdownAt(e, current.parentId ?? null, current.id)}
          onMouseLeave={handleLeave}
        >
          <Icon name="chevron_right" size={13} className="text-[var(--ink-30)]" />
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 font-semibold text-[var(--ink-100)] max-w-[260px] rounded-full hover:bg-[var(--surface-sunken)] transition-colors">
            <Icon
              name={fromMindmap ? 'account_tree' : current.kind === 'folder' ? 'folder' : 'task_alt'}
              size={13}
              className="text-[rgb(var(--accent))] shrink-0"
            />
            {renaming ? (
              <input
                ref={renameInputRef}
                data-testid="desk-title-input"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent outline-none border-none text-[var(--ink-100)] font-semibold text-[12px] min-w-0 w-[180px] max-w-[220px] cursor-text"
                style={{ fontFamily: 'inherit' }}
              />
            ) : (
              <span
                data-testid="desk-title"
                className="truncate cursor-default"
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (onRenameTask) startRename()
                }}
                title={onRenameTask ? 'Double-click to rename' : undefined}
              >
                {current.title || '(untitled)'}
              </span>
            )}
            {!renaming && (
              <Icon name="expand_more" size={12} className="text-[var(--ink-30)] shrink-0 ml-0.5" />
            )}
          </span>
          {/* Explicit rename affordance alongside double-click. The old header bar's
              pencil was dropped in the FloatingPill refactor (c48d036); this restores
              it on the breadcrumb, wired to the same inline rename. */}
          {!renaming && onRenameTask && (
            <button
              type="button"
              aria-label={current.kind === 'folder' ? 'Rename room' : 'Rename desk'}
              title={current.kind === 'folder' ? 'Rename room' : 'Rename desk'}
              onClick={(e) => {
                e.stopPropagation()
                startRename()
              }}
              onMouseEnter={handleLeave}
              className="shrink-0 ml-0.5 p-0.5 rounded-full text-[var(--ink-30)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <Icon name="edit" size={12} />
            </button>
          )}
        </span>

        {/* "Add to room…" button — only for free desks */}
        {isFreeDesk && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              cancelLeave()
              setRoomPickerOpen((v) => !v)
            }}
            onMouseEnter={handleEnter}
            title="Add to a room"
            className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full text-[var(--ink-50)] hover:text-[rgb(var(--accent))] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
          >
            <Icon name="move_to_inbox" size={12} />
            <span className="text-[11px] font-medium">Add to room</span>
          </button>
        )}

        {/* Share — opens the people-picker for the current room or desk */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShareOpen(true)
          }}
          onMouseEnter={handleLeave}
          aria-label={current.kind === 'folder' ? 'Share room' : 'Share desk'}
          title={current.kind === 'folder' ? 'Share this room' : 'Share this desk'}
          data-testid="canvas-share"
          className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full text-[var(--ink-50)] hover:text-[rgb(var(--accent))] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
        >
          <Icon name="ios_share" size={12} />
          <span className="text-[11px] font-medium">Share</span>
        </button>

        {trailing && (
          <>
            <span aria-hidden className="w-px h-4 bg-[var(--edge-soft)] mx-1 shrink-0" />
            {trailing}
          </>
        )}
      </div>

      {/* Transparent bridge — fills the mt-2 gap between pill and dropdown so
          moving the mouse from pill to dropdown never triggers a collapse.
          Spans full width so it works regardless of dropdown x position. */}
      {dropdown && (
        <div
          className="absolute z-[59]"
          style={{ top: '100%', left: 0, right: 0, height: 12 }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        />
      )}

      {/* Stage Manager dropdown — centered under the hovered segment.
          Position is managed entirely via framer-motion `x` so that when
          `dropdown.x` changes (user hovers a different segment) the panel
          springs to the new position instead of jumping. The panel is 172px
          wide, so centering at dropdown.x means x = dropdown.x - 86. */}
      <AnimatePresence>
        {dropdown && (
          <motion.div
            key="stage-dropdown"
            initial={{ opacity: 0, y: -6, x: dropdown.x - 86 }}
            animate={{ opacity: 1, y: 0, x: dropdown.x - 86 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              opacity: { duration: 0.14, ease: 'easeOut' },
              y: { duration: 0.14, ease: 'easeOut' },
              x: { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }
            }}
            className="fb-glass-panel rounded-[var(--radius-row)] absolute top-full mt-2 w-[172px] max-h-[360px] overflow-hidden z-[60] flex flex-col"
            style={{ left: 0 }}
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

      {/* Room picker popover — opens when clicking "Add to room" on a free desk */}
      <AnimatePresence>
        {roomPickerOpen && isFreeDesk && (
          <>
            {/* Click-away backdrop */}
            <div
              className="fixed inset-0 z-[59]"
              onClick={() => setRoomPickerOpen(false)}
            />
            <motion.div
              key="room-picker"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fb-glass-panel rounded-[var(--radius-row)] absolute top-full mt-2 right-0 w-[200px] max-h-[280px] overflow-hidden z-[60] flex flex-col"
            >
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-40)] font-semibold">
                  Add to room
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                {rooms.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-[var(--ink-50)]">No rooms yet</div>
                ) : (
                  rooms.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => {
                        onAssignToRoom?.(current.id, room.id)
                        setRoomPickerOpen(false)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--ink-80)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] transition-colors text-left"
                    >
                      <Icon name="workspaces" size={13} className="text-[var(--ink-40)] shrink-0" />
                      <span className="truncate">{room.title || 'Untitled Room'}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-[var(--edge-soft)]">
                <button
                  onClick={() => {
                    onCreateRoomFromDesk?.(current.id)
                    setRoomPickerOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-[rgb(var(--accent))] hover:bg-[var(--surface-sunken)] transition-colors text-left font-medium"
                >
                  <Icon name="add" size={13} className="shrink-0" />
                  <span>Create new room</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {shareOpen && (
        <ShareDialog
          kind={current.kind === 'folder' ? 'folder' : 'task'}
          entityId={current.id}
          label={current.title || 'Untitled'}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
