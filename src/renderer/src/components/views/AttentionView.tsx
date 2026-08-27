import { useEffect, useMemo, useRef, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useWorkItemStore } from '../../stores/workItems'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useCaptureConsole } from '../../stores/captureConsole'
import { promptText } from '../plexi/PromptDialog'
import Icon from '../Icon'
import AttentionItemEditor from '../AttentionItemEditor'
import {
  groupIntoQueues,
  groupByDue,
  groupByOrigin,
  recentlyClosed,
  archivedItems,
  detachedItems,
  itemReason,
  itemFullText,
  queueOf,
  rankScore,
  PRIMARY_ACTION,
  QUEUE_ICON,
  CLASS_CHOICES
} from '../../lib/attentionQueues'
import {
  orderWithGroups,
  planDrop,
  planMoveToQueue,
  planUngroup,
  type DropPosition
} from '../../lib/attentionGrouping'
import {
  feederSignals,
  loadMutes,
  saveMutes,
  mutedCountOfKind,
  KIND_MUTE_OFFER_THRESHOLD,
  type FeederSignal
} from '../../lib/attentionFeeders'

// The Attention surface (S6, SPEC-017). Every work item that needs the person,
// in purpose-built queues with the class-appropriate closing verb — a LENS
// over items that live with their desks, never a second workspace. Snoozed
// items hide until they return; the Detached shelf (F-M6) holds park-local
// items whose desk was purged or moved, with MOVE as the recovery.

/** How long a drag must rest on a row before it means "attach to this"
 *  rather than "drop near this". A deliberate pause, not a twitch. */
const GROUP_DWELL_MS = 700

function dueChip(i: FbNode, nowMs: number): JSX.Element | null {
  if (!i.dueAt) return null
  const overdue = Date.parse(i.dueAt) < nowMs
  const label = new Date(i.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[11px] ${
        overdue
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : 'bg-[var(--surface-sunken)] text-[var(--ink-50)]'
      }`}
    >
      <Icon name="schedule" size={11} /> {label}
    </span>
  )
}

export default function AttentionView(): JSX.Element {
  const items = useWorkItemStore((s) => s.items)
  const loaded = useWorkItemStore((s) => s.loaded)
  const refresh = useWorkItemStore((s) => s.refresh)
  const setState = useWorkItemStore((s) => s.setState)
  const reclassify = useWorkItemStore((s) => s.reclassify)
  const snooze = useWorkItemStore((s) => s.snooze)
  const createItem = useWorkItemStore((s) => s.create)
  const updateFields = useWorkItemStore((s) => s.updateFields)
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const openConsole = useCaptureConsole((s) => s.openConsole)
  const [nowMs, setNowMs] = useState(() => Date.now())
  // SPEC-017 lenses: the same active set through three groupings, persisted.
  const [lens, setLens] = useState<'queue' | 'due' | 'origin'>(
    () => (localStorage.getItem('attention.lens') as 'queue' | 'due' | 'origin') || 'queue'
  )
  const pickLens = (l: 'queue' | 'due' | 'origin'): void => {
    localStorage.setItem('attention.lens', l)
    setLens(l)
  }
  const [showClosed, setShowClosed] = useState(false)

  // DEC-035 — the six-dot handle: rearrange, attach one item to another, or
  // move between classifications. Native HTML5 drag (the house pattern; there
  // is no dnd library in this codebase). `over` is the row being hovered and
  // where; `overSection` is a whole-section target.
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; pos: DropPosition } | null>(null)
  const [overSection, setOverSection] = useState<string | null>(null)
  // Dwell-to-group: hovering a row for a beat means "attach to this", which is
  // how the operator described it. Position still decides before/after.
  const dwell = useRef<{ id: string; timer: number } | null>(null)
  const clearDwell = (): void => {
    if (dwell.current) window.clearTimeout(dwell.current.timer)
    dwell.current = null
  }

  async function writeAll(
    writes: Array<{ id: string; groupId?: string | null; sortOrder?: number; intentClass?: string }>
  ): Promise<void> {
    for (const w of writes) {
      const patch: Record<string, unknown> = {}
      if (w.sortOrder !== undefined) patch.sortOrder = w.sortOrder
      if (w.groupId !== undefined) patch.groupId = w.groupId
      if (w.intentClass !== undefined) patch.intentClass = w.intentClass
      await updateFields(w.id, patch)
    }
    await refresh()
  }

  const endDrag = (): void => {
    setDragId(null)
    setOver(null)
    setOverSection(null)
    clearDwell()
  }

  /** A drop ONTO a row. When that row lives in a different queue the same
   *  gesture reclassifies the item — dragging between classifications was
   *  silently doing nothing, because the dragged row was not in the target
   *  queue's list at all (operator live QA). */
  async function applyDrop(
    targetId: string,
    pos: DropPosition,
    rows: ReturnType<typeof orderWithGroups>,
    targetQueue: string
  ): Promise<void> {
    const id = dragId
    endDrag()
    if (!id) return
    const dragged = items.find((x) => x.id === id)
    if (!dragged) return
    const crossQueue = queueOf(dragged) !== targetQueue
    await writeAll(planDrop(dragged, targetId, pos, rows, crossQueue ? targetQueue : undefined))
  }

  /** Dropping on a section's header or empty space: reclassify into it and
   *  land at the end. The item leaves its old group — the group belonged to
   *  the queue it came from. */
  async function moveToSection(
    queue: string,
    rows: ReturnType<typeof orderWithGroups>
  ): Promise<void> {
    const id = dragId
    endDrag()
    if (!id) return
    const item = items.find((x) => x.id === id)
    if (!item || queueOf(item) === queue) return
    await writeAll(planMoveToQueue(id, queue, rows))
  }

  async function ungroup(id: string): Promise<void> {
    await writeAll(planUngroup(id))
  }

  // Full text on demand: a queue row truncates by design (scannability), but
  // the capture behind it is often a paragraph — and until now there was NO
  // way to read or copy it without opening the DB (operator live QA). Expand
  // shows the untouched title + notes; Copy puts them on the clipboard.
  // DEC-036 — double-click opens the whole item for editing.
  const [editing, setEditing] = useState<FbNode | null>(null)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const toggleExpanded = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  async function copyItem(i: FbNode): Promise<void> {
    // Title + notes, verbatim — what the operator actually needs to paste.
    const body = itemFullText(i)
    try {
      await navigator.clipboard.writeText(body)
      setCopiedId(i.id)
      setTimeout(() => setCopiedId((c) => (c === i.id ? null : c)), 1600)
    } catch {
      /* clipboard denied — the expanded text is still selectable by hand */
    }
  }

  // The bare manual form (Layer 0, taxonomy alignment stage): a full by-hand
  // path — title, class picked from the eight primaries, optional date and
  // desk — no classifier, no model, no confirm stop. Files through the same
  // store.create seam as every capture (F008 one code path). Stays open after
  // filing for serial entry; Esc or ✕ closes.
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newClass, setNewClass] = useState('to_do')
  const [newDate, setNewDate] = useState('')
  const [newDeskId, setNewDeskId] = useState('')
  const [newBusy, setNewBusy] = useState(false)
  const [newFiled, setNewFiled] = useState<string | null>(null)

  // Personal, live desks only — shared and archived desks refuse work-item
  // parenting (§2.6 / DEC-023's own exclusions).
  const deskChoices = useMemo(
    () => nodes.filter((n) => n.kind === 'task' && !n.archived && !n.sharedRootId),
    [nodes]
  )

  async function fileNewItem(): Promise<void> {
    const title = newTitle.trim()
    if (!title || newBusy) return
    setNewBusy(true)
    try {
      const item = await createItem({
        title,
        parentId: newDeskId || null,
        intentClass: newClass,
        dueAt: newDate ? new Date(`${newDate}T17:00:00`).toISOString() : null,
        confidence: 1, // human-stated, not inferred
        approvalState: 'auto',
        sourceType: 'note',
        wiOrigin: 'human'
      })
      setNewTitle('')
      setNewDate('')
      setNewFiled(item.title)
      setTimeout(() => setNewFiled(null), 2500)
      await refresh()
    } finally {
      setNewBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
    const t = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const queues = useMemo(
    () =>
      lens === 'due'
        ? groupByDue(items, nowMs)
        : lens === 'origin'
          ? groupByOrigin(items, nowMs)
          : groupIntoQueues(items, nowMs),
    [items, nowMs, lens]
  )
  const detached = useMemo(() => detachedItems(items), [items])
  const closed = useMemo(() => recentlyClosed(items, nowMs), [items, nowMs])
  // DEC-024: the Archived shelf — kept, out of the way, no clock.
  const archived = useMemo(() => archivedItems(items), [items])
  const [showArchived, setShowArchived] = useState(false)
  const total = queues.reduce((n, q) => n + q.items.length, 0)

  // S7 feeders: desk signals surfacing AS attention (computed, never owned).
  const [mutes, setMutes] = useState<Set<string>>(() => loadMutes())
  const [staleRows, setStaleRows] = useState<Array<{ id: string; title: string; daysQuiet: number }>>([])
  useEffect(() => {
    let alive = true
    void window.api.nodes
      .staleDesks()
      .then((rows) => {
        if (alive) setStaleRows(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const signals = useMemo(
    () => feederSignals(nodes, staleRows, nowMs, mutes),
    [nodes, staleRows, nowMs, mutes]
  )
  function muteSignal(s: FeederSignal): void {
    const next = new Set(mutes)
    next.add(s.key)
    // Δ10: repeated mutes of one kind quiet the whole source, on offer.
    if (mutedCountOfKind(next, s.kind) >= KIND_MUTE_OFFER_THRESHOLD) {
      void promptText({
        title: 'Quiet this whole source?',
        label: `You've muted several ${
          s.kind === 'desk-due' ? 'due-desk' : s.kind === 'plan-due' ? 'plan-due' : 'stale-desk'
        } nudges.`,
        choices: [
          { value: 'kind', label: 'Mute all of these', hint: 'This source stays quiet until you clear mutes' },
          { value: 'one', label: 'Just this one' }
        ]
      }).then((pick) => {
        if (pick === 'kind') next.add(`kind:${s.kind}`)
        setMutes(new Set(next))
        saveMutes(next)
      })
      return
    }
    setMutes(next)
    saveMutes(next)
  }

  async function snoozeTomorrow(id: string): Promise<void> {
    const d = new Date(nowMs)
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    await snooze(id, d.getTime())
    await refresh()
  }

  async function reclassifyItem(i: FbNode): Promise<void> {
    const next = await promptText({
      title: 'Reclassify',
      label: `Where does “${i.title}” belong?`,
      choices: CLASS_CHOICES.filter((c) => c.value !== queueOf(i))
    })
    if (next) await reclassify(i.id, next)
  }

  async function moveDetached(i: FbNode): Promise<void> {
    const desks = nodes.filter((n) => n.kind === 'task' && !n.archived).slice(0, 12)
    if (!desks.length) return
    const target = await promptText({
      title: 'Move to a desk',
      label: `Pick a new home for “${i.title}”`,
      choices: desks.map((d) => ({ value: d.id, label: d.title || 'Untitled desk' }))
    })
    if (target) {
      await window.api.nodes.move(i.id, target, null)
      await window.api.workItems.clearDetached(i.id)
      await refresh()
    }
  }

  function openSource(i: FbNode): void {
    if (i.parentId && nodes.some((n) => n.id === i.parentId && n.kind === 'task')) {
      setActive(i.parentId)
      goTask(i.parentId)
    }
  }

  function row(
    i: FbNode,
    inDetached: boolean,
    group?: {
      isChild: boolean
      childCount: number
      rows: ReturnType<typeof orderWithGroups>
      queue: string
    }
  ): JSX.Element {
    const primary = PRIMARY_ACTION[queueOf(i)] ?? PRIMARY_ACTION.to_do
    const reason = itemReason(i, nowMs)
    const hasDesk = !!(i.parentId && nodes.some((n) => n.id === i.parentId))
    const isOpen = expanded.has(i.id)
    const notes = (i.description || '').trim()
    // Worth opening when the title is long enough to clip, or notes exist.
    const hasMore = notes.length > 0 || i.title.length > 60
    const canDrag = !!group && !inDetached
    const isOver = over?.id === i.id
    return (
      <div
        key={i.id}
        data-item-row
        onDoubleClick={(e) => {
          // Only the ACTION cluster is off-limits — double-clicking Archive
          // should archive, not open an editor behind it. The title and the
          // expander are buttons too, and double-clicking THOSE must still
          // open the item (guarding on `button` blocked nearly the whole row).
          if ((e.target as HTMLElement).closest('[data-row-action]')) return
          setEditing(i)
        }}
        title="Double-click to edit"
        onDragOver={
          canDrag
            ? (e) => {
                if (!dragId || dragId === i.id) return
                e.preventDefault()
                e.stopPropagation()
                const r = e.currentTarget.getBoundingClientRect()
                const y = (e.clientY - r.top) / r.height
                // The edges mean "place it here"; resting in the MIDDLE for a
                // beat means "attach to this" — the operator's own grammar.
                const edge = y < 0.25 ? 'before' : y > 0.75 ? 'after' : null
                if (edge) {
                  clearDwell()
                  setOver({ id: i.id, pos: edge })
                  return
                }
                if (dwell.current?.id !== i.id) {
                  clearDwell()
                  setOver({ id: i.id, pos: 'after' })
                  dwell.current = {
                    id: i.id,
                    timer: window.setTimeout(
                      () => setOver({ id: i.id, pos: 'into' }),
                      GROUP_DWELL_MS
                    )
                  }
                }
              }
            : undefined
        }
        onDragLeave={
          canDrag
            ? () => {
                clearDwell()
                setOver((o) => (o?.id === i.id ? null : o))
              }
            : undefined
        }
        onDrop={
          canDrag
            ? (e) => {
                e.preventDefault()
                e.stopPropagation()
                void applyDrop(i.id, over?.pos ?? 'after', group!.rows, group!.queue)
              }
            : undefined
        }
        className={`group flex items-start gap-2 px-4 py-2.5 bg-[var(--surface-raised)] ${
          group?.isChild ? 'pl-10' : ''
        } ${dragId === i.id ? 'opacity-40' : ''} ${
          isOver && over?.pos === 'into'
            ? 'shadow-[inset_0_0_0_2px_rgba(var(--accent),0.5)]'
            : isOver && over?.pos === 'before'
              ? 'shadow-[inset_0_2px_0_rgb(var(--accent))]'
              : isOver && over?.pos === 'after'
                ? 'shadow-[inset_0_-2px_0_rgb(var(--accent))]'
                : ''
        }`}
      >
        {canDrag && (
          <button
            draggable
            onDragStart={(e) => {
              // Drag the whole row, not a bare handle — the operator should
              // see the item itself move.
              const rowEl = (e.currentTarget as HTMLElement).closest(
                '[data-item-row]'
              ) as HTMLElement | null
              if (rowEl) {
                const r = rowEl.getBoundingClientRect()
                e.dataTransfer.setDragImage(rowEl, e.clientX - r.left, e.clientY - r.top)
              }
              setDragId(i.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={endDrag}
            title="Drag to reorder, attach to another item, or move to another section"
            className="shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-[var(--ink-20)] hover:text-[var(--ink-50)] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Icon name="drag_indicator" size={16} />
          </button>
        )}
        <button
          onClick={() => hasMore && toggleExpanded(i.id)}
          title={hasMore ? (isOpen ? 'Collapse' : 'Show the full text') : undefined}
          aria-expanded={isOpen}
          disabled={!hasMore}
          className={`shrink-0 mt-0.5 ${hasMore ? 'fb-press cursor-pointer' : 'cursor-default'}`}
        >
          <Icon
            name={hasMore ? (isOpen ? 'expand_more' : 'chevron_right') : (QUEUE_ICON[queueOf(i)] ?? 'check_circle')}
            size={16}
            className="text-[var(--ink-30)]"
          />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => hasMore && toggleExpanded(i.id)}
              title={hasMore && !isOpen ? i.title : undefined}
              className={`fb-t-body font-medium text-[var(--ink-100)] text-left min-w-0 ${
                isOpen ? 'whitespace-pre-wrap break-words' : 'truncate'
              } ${hasMore ? 'fb-press' : 'cursor-default'}`}
            >
              {i.title}
            </button>
            {dueChip(i, nowMs)}
          </div>
          {isOpen && notes && (
            <div className="mt-1.5 text-[12px] text-[var(--ink-70)] whitespace-pre-wrap break-words select-text">
              {notes}
            </div>
          )}
          {reason && <div className="text-[11px] text-[var(--ink-40)] mt-0.5">{reason}</div>}
          {group && group.childCount > 0 && (
            <div className="text-[11px] text-[var(--ink-40)] mt-0.5">
              {group.childCount} related item{group.childCount === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <div
          data-row-action
          className={`flex items-center gap-1 transition-opacity ${
            isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {group?.isChild && (
            <button
              onClick={() => void ungroup(i.id)}
              title="Detach from its group"
              className="icon-btn !h-7 !w-7"
            >
              <Icon name="link_off" size={14} />
            </button>
          )}
          {hasMore && (
            <button
              onClick={() => void copyItem(i)}
              title="Copy the full text"
              className="icon-btn !h-7 !w-7"
            >
              <Icon name={copiedId === i.id ? 'check' : 'content_copy'} size={14} />
            </button>
          )}
          {inDetached ? (
            <button
              onClick={() => void moveDetached(i)}
              className="h-7 px-2.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)]"
            >
              Move…
            </button>
          ) : (
            <>
              {hasDesk && (
                <button
                  onClick={() => openSource(i)}
                  title="Open its desk"
                  className="icon-btn !h-7 !w-7"
                >
                  <Icon name="desk" size={14} />
                </button>
              )}
              <button
                onClick={() => void snoozeTomorrow(i.id)}
                title="Snooze until tomorrow morning"
                className="icon-btn !h-7 !w-7"
              >
                <Icon name="snooze" size={14} />
              </button>
              <button
                onClick={() => void reclassifyItem(i)}
                title="This isn’t right — reclassify"
                className="icon-btn !h-7 !w-7"
              >
                <Icon name="swap_horiz" size={14} />
              </button>
              <button
                onClick={() => void setState(i.id, 'archived')}
                title="Archive — keep it, out of the way"
                className="icon-btn !h-7 !w-7"
              >
                <Icon name="archive" size={14} />
              </button>
              <button
                onClick={() => void setState(i.id, primary.state)}
                className="h-7 px-2.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)]"
              >
                {primary.label}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-base)] text-[var(--ink-100)]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="fb-t-title text-[var(--ink-90)]">Attention</h1>
            <p className="fb-t-body text-[var(--ink-50)] mt-1">
              Everything that needs you, filed by what it’s trying to do. Items live with their
              desks — this is the lens, not the drawer.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowNew((v) => !v)}
              title="A plain form — you pick the queue yourself"
              className="inline-flex items-center gap-1.5 h-9 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] hover:text-[var(--ink-100)]"
            >
              <Icon name="add_task" size={15} /> New item
            </button>
            <button
              onClick={() => openConsole()}
              className="inline-flex items-center gap-1.5 h-9 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] hover:text-[var(--ink-100)]"
            >
              <Icon name="add" size={15} /> Capture
            </button>
          </div>
        </div>
        {showNew && (
          <div
            className="mb-4 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-4 py-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !newBusy) void fileNewItem()
              if (e.key === 'Escape') setShowNew(false)
            }}
          >
            <div className="flex items-center justify-between">
              <span className="fb-t-label text-[var(--ink-70)]">New attention item</span>
              <button
                onClick={() => setShowNew(false)}
                title="Close"
                className="icon-btn !h-7 !w-7"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs you?"
              className="fb-field mt-2 w-full bg-[var(--surface-sunken)] px-3 py-2 text-[13px]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {CLASS_CHOICES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setNewClass(c.value)}
                  title={c.hint}
                  className={`px-2.5 h-7 fb-t-label fb-press rounded-full ${
                    newClass === c.value
                      ? 'bg-[rgb(var(--accent))] text-white'
                      : 'bg-[var(--surface-sunken)] text-[var(--ink-60)] hover:text-[var(--ink-100)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                title="Due date (optional)"
                className="fb-field bg-[var(--surface-sunken)] px-2 py-1 text-[12px]"
              />
              <select
                value={newDeskId}
                onChange={(e) => setNewDeskId(e.target.value)}
                title="File onto a desk (optional)"
                className="fb-field bg-[var(--surface-sunken)] px-2 py-1 text-[12px] max-w-[220px]"
              >
                <option value="">No desk</option>
                {deskChoices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title || 'Untitled desk'}
                  </option>
                ))}
              </select>
              <div className="flex-1" />
              {newFiled && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-50)]">
                  <Icon name="check_circle" size={13} /> Filed “{newFiled}”
                </span>
              )}
              <button
                onClick={() => void fileNewItem()}
                disabled={newBusy || !newTitle.trim()}
                className="h-8 px-3.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50"
              >
                {newBusy ? 'Filing…' : 'File it ↵'}
              </button>
            </div>
          </div>
        )}
        <div className="mb-4 flex items-center gap-1">
          <span className="fb-t-label text-[var(--ink-40)] mr-1">Group by</span>
          {(
            [
              ['queue', 'Queue'],
              ['due', 'Due'],
              ['origin', 'Origin']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => pickLens(key)}
              className={`px-2.5 h-7 fb-t-label fb-press rounded-[var(--radius-field)] ${
                lens === key
                  ? 'bg-[var(--surface-sunken)] text-[var(--ink-100)]'
                  : 'text-[var(--ink-50)] hover:text-[var(--ink-100)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loaded && total === 0 && detached.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="check_circle" size={28} className="text-[var(--ink-30)] mb-3" />
            <div className="fb-t-label text-[var(--ink-50)]">Nothing needs you</div>
            <div className="fb-t-body text-[var(--ink-30)] mt-1">
              Capture anything with ⌘K → “Capture a work item”.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {queues.map((q) => {
              // DEC-035: in the Queue lens the rows carry grouping + manual
              // order; the other lenses (Due/Origin) answer a different
              // question, so they stay ranked and undraggable.
              const grouped =
                lens === 'queue' ? orderWithGroups(q.items, (x) => rankScore(x, nowMs)) : null
              return (
                <section
                  key={q.queue}
                  // The WHOLE section takes the drop, not just its header —
                  // dragging between classifications has to be easy to hit.
                  // Row drops stopPropagation, so a precise drop still wins.
                  onDragOver={
                    lens === 'queue' && dragId
                      ? (e) => {
                          e.preventDefault()
                          setOverSection(q.queue)
                        }
                      : undefined
                  }
                  onDragLeave={() => setOverSection((c) => (c === q.queue ? null : c))}
                  onDrop={
                    lens === 'queue' && dragId
                      ? (e) => {
                          e.preventDefault()
                          void moveToSection(q.queue, grouped ?? [])
                        }
                      : undefined
                  }
                  className={`rounded-lg ${
                    overSection === q.queue && dragId
                      ? 'ring-2 ring-[rgba(var(--accent),0.45)] ring-offset-4 ring-offset-[var(--surface-base)]'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={QUEUE_ICON[q.queue] ?? 'label'} size={14} className="text-[var(--ink-40)]" />
                    <span className="fb-t-label text-[var(--ink-70)]">{q.label}</span>
                    <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{q.items.length}</span>
                    {overSection === q.queue && (
                      <span className="fb-t-caption text-[rgb(var(--accent))]">move here</span>
                    )}
                  </div>
                  <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
                    {grouped
                      ? grouped.map((g) =>
                          row(g.item, false, {
                            isChild: g.isChild,
                            childCount: g.childCount,
                            rows: grouped,
                            queue: q.queue
                          })
                        )
                      : q.items.map((i) => row(i, false))}
                  </div>
                </section>
              )
            })}
            {signals.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="desk" size={14} className="text-[var(--ink-40)]" />
                  <span className="fb-t-label text-[var(--ink-70)]">From your desks</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{signals.length}</span>
                </div>
                <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
                  {signals.map((s) => (
                    <div
                      key={s.key}
                      className="group flex items-center gap-3 px-4 py-2.5 bg-[var(--surface-raised)]"
                    >
                      <Icon
                        name={s.kind === 'desk-due' ? 'schedule' : s.kind === 'plan-due' ? 'account_tree' : 'bedtime'}
                        size={16}
                        className="text-[var(--ink-30)] shrink-0"
                      />
                      <button
                        onClick={() => {
                          if (s.target === 'plan') {
                            goProject(s.id)
                          } else {
                            setActive(s.id)
                            goTask(s.id)
                          }
                        }}
                        className="flex-1 min-w-0 text-left fb-press"
                      >
                        <span className="fb-t-body font-medium text-[var(--ink-100)] truncate block">
                          {s.title}
                        </span>
                        <span className="text-[11px] text-[var(--ink-40)]">{s.line}</span>
                      </button>
                      <button
                        onClick={() => muteSignal(s)}
                        title="Mute this nudge"
                        className="icon-btn !h-7 !w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icon name="notifications_off" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {detached.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="link_off" size={14} className="text-[var(--ink-40)]" />
                  <span className="fb-t-label text-[var(--ink-70)]">Detached</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{detached.length}</span>
                </div>
                <p className="text-[11px] text-[var(--ink-40)] mb-2">
                  Their desks were removed or moved — the items were kept. Give each a new home.
                </p>
                <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
                  {detached.map((i) => row(i, true))}
                </div>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <button
                  onClick={() => setShowClosed((v) => !v)}
                  className="flex items-center gap-2 mb-2 fb-press"
                >
                  <Icon
                    name={showClosed ? 'expand_more' : 'chevron_right'}
                    size={14}
                    className="text-[var(--ink-40)]"
                  />
                  <span className="fb-t-label text-[var(--ink-70)]">Recently closed</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{closed.length}</span>
                </button>
                {showClosed && (
                  <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden opacity-80">
                    {closed.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 px-4 py-2 bg-[var(--surface-raised)]">
                        <Icon name="task_alt" size={14} className="text-[var(--ink-30)] shrink-0" />
                        <span className="fb-t-body text-[var(--ink-50)] truncate flex-1">{i.title}</span>
                        <span className="text-[11px] text-[var(--ink-30)]">{i.workItemState}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {archived.length > 0 && (
              <section>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex items-center gap-2 mb-2 fb-press"
                >
                  <Icon
                    name={showArchived ? 'expand_more' : 'chevron_right'}
                    size={14}
                    className="text-[var(--ink-40)]"
                  />
                  <span className="fb-t-label text-[var(--ink-70)]">Archived</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{archived.length}</span>
                </button>
                {showArchived && (
                  <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden opacity-80">
                    {archived.map((i) => (
                      <div
                        key={i.id}
                        className="group flex items-center gap-3 px-4 py-2 bg-[var(--surface-raised)]"
                      >
                        <Icon name="archive" size={14} className="text-[var(--ink-30)] shrink-0" />
                        <span className="fb-t-body text-[var(--ink-50)] truncate flex-1">{i.title}</span>
                        <button
                          onClick={() => void setState(i.id, 'open')}
                          title="Back to the queues"
                          className="h-7 px-2.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] hover:text-[var(--ink-100)] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Unarchive
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
      {editing && (
        <AttentionItemEditor
          item={editing}
          desks={deskChoices}
          onClose={(changed) => {
            setEditing(null)
            if (changed) void refresh()
          }}
        />
      )}
    </div>
  )
}
