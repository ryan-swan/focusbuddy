import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useWorkItemStore } from '../../stores/workItems'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useCaptureConsole } from '../../stores/captureConsole'
import { promptText } from '../plexi/PromptDialog'
import Icon from '../Icon'
import AttentionItemEditor from '../AttentionItemEditor'
import { useWidgetStore } from '../../stores/widgets'
import { useAssistantChrome } from '../../stores/assistantChrome'
import { startPromptForItem, startPromptForMany } from '../../lib/startPrompt'
import TagMentionInput from '../TagMentionInput'
import { serializeTags } from '../../lib/itemTags'
import { parseMentions, serializeMentions, mentionKey, MENTION_ICON, type ItemMention } from '../../lib/itemMentions'
import { CAPTURE_STATES } from '@shared/workItems'
import {
  OverdueRadarBlock,
  AgendaBlock,
  RecentActivityBlock,
  AnalyticsBlock,
  StartHereBlock
} from '../attention/attentionBlocks'
import { KPI_FILTERS, type KpiKey } from '../../lib/attentionAnalytics'
import ItemStatusPill from '../attention/ItemStatusPill'
import { useCloseWorkItem } from '../attention/useCloseWorkItem'
import {
  itemContext,
  urgencyOf,
  parseTags,
  sourceLabel,
  hasTag,
  tagVocabulary
} from '../../lib/itemTags'
import {
  groupIntoQueues,
  groupByDue,
  groupByOrigin,
  recentlyClosed,
  archivedItems,
  detachedItems,
  itemReason,
  itemFullText,
  isTerminalState,
  queueOf,
  rankScore,
  clusterByDesk,
  PRIMARY_ACTION,
  QUEUE_ICON,
  QUEUE_ORDER,
  QUEUE_LABEL,
  QUEUE_COLOR,
  queueTint,
  CLASS_CHOICES
} from '../../lib/attentionQueues'
import {
  MAX_GROUP_DEPTH,
  orderWithGroups,
  planDrop,
  planDropMulti,
  planMoveToQueue,
  planMoveToQueueMulti,
  planUngroup,
  subtaskProgress,
  subtreeHeight,
  subtreeIds,
  visibleRows,
  type DropPosition
, hasFollowingSibling } from '../../lib/attentionGrouping'
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

/** Desk status labels — prefixed "Desk:" wherever shown, because All-Desks'
 *  "To Do" group and the item class To Do are different facts wearing one
 *  word (analysis/23's naming caution). */
/** DEC-049 — how a KPI tile names itself once it is the active filter. */
const KPI_LABEL: Record<string, string> = {
  open: 'open items',
  due_today: 'items due today',
  overdue: 'overdue items',
  in_progress: 'work in progress',
  waiting: 'waiting / blocked work',
  closed_7d: 'recently closed'
}

const DESK_STATUS_LABEL: Record<string, string> = {
  open: 'to do',
  in_progress: 'in progress',
  done: 'done',
  parked: 'parked'
}

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

// DEC-062 — the indent step. Was 22px, which at one level of nesting read as a
// slightly ragged left edge rather than a hierarchy; the operator asked for the
// whole sub-item row to sit further in. 28px is wide enough to be unmistakable
// and still leaves the third level inside the box at normal widths.
const INDENT_PX = 28
const MAX_INDENT = 3

export default function AttentionView(): JSX.Element {
  const items = useWorkItemStore((s) => s.items)
  const loaded = useWorkItemStore((s) => s.loaded)
  const refresh = useWorkItemStore((s) => s.refresh)
  const setState = useWorkItemStore((s) => s.setState)
  const snooze = useWorkItemStore((s) => s.snooze)
  const createItem = useWorkItemStore((s) => s.create)
  const updateFields = useWorkItemStore((s) => s.updateFields)
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const goRoom = useViewStore((s) => s.goRoom)
  const openConsole = useCaptureConsole((s) => s.openConsole)
  const setFocusedWidget = useWidgetStore((s) => s.setFocused)
  const openAssistant = useAssistantChrome((s) => s.openPanel)
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
  // DEC-043 — one PAGE per class. 'all' is the full-list view (the old
  // layout); a class tab shows only that queue, so no queue ever requires
  // scrolling past the others. Persisted like the lens.
  const [queueTab, setQueueTab] = useState<string>(
    () => localStorage.getItem('attention.queueTab') || 'all'
  )
  const pickTab = (t: string): void => {
    localStorage.setItem('attention.queueTab', t)
    setQueueTab(t)
  }
  // DEC-037 — filtering by a chosen tag. One at a time: the point is to narrow
  // to a thread of work, not to build a query language.
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  // DEC-049 — the KPI band's tiles double as filters: press "Overdue 3" and
  // the queues below narrow to exactly those three (same predicate, so the
  // number and the rows can never disagree).
  const [kpiFilter, setKpiFilter] = useState<KpiKey | null>(null)
  // DEC-038 — selection mode. The Attention page's own bulk pattern, matching
  // the index pages' Select/Select-all shape (DEC-022) so the muscle memory
  // carries. Its one bulk action today is handing the set to Plexii.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelected = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [bulkBusy, setBulkBusy] = useState(false)
  const closeWithOffer = useCloseWorkItem()

  // DEC-048 — collapsed parents. View state, persisted so an outline the
  // operator folded stays folded across restarts.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('attention.collapsed') || '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const toggleCollapsed = (id: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('attention.collapsed', JSON.stringify([...next]))
      return next
    })

  // DEC-048 — marquee selection: Shift+drag sweeps a rectangle over the
  // queues and selects every row it touches (Shift, because a bare drag is
  // already the reorder gesture). Viewport-space rect, drawn fixed.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null
  )
  const marqueeBase = useRef<Set<string>>(new Set())
  const marqueeMoved = useRef(false)
  const startMarquee = (e: React.MouseEvent): void => {
    if (!e.shiftKey || e.button !== 0) return
    e.preventDefault()
    marqueeBase.current = new Set(selected)
    marqueeMoved.current = false
    const x0 = e.clientX
    const y0 = e.clientY
    setMarquee({ x0, y0, x1: x0, y1: y0 })
    const onMove = (ev: MouseEvent): void => {
      const rect = {
        left: Math.min(x0, ev.clientX),
        right: Math.max(x0, ev.clientX),
        top: Math.min(y0, ev.clientY),
        bottom: Math.max(y0, ev.clientY)
      }
      if (rect.right - rect.left + (rect.bottom - rect.top) > 8) marqueeMoved.current = true
      setMarquee({ x0, y0, x1: ev.clientX, y1: ev.clientY })
      const hit = new Set(marqueeBase.current)
      document.querySelectorAll<HTMLElement>('[data-item-row][data-item-id]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top)
          hit.add(el.dataset.itemId!)
      })
      setSelected(hit)
      if (hit.size > 0) setSelectMode(true)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setMarquee(null)
      // A real sweep must not ALSO fire the click under the cursor.
      if (marqueeMoved.current) {
        const swallow = (ce: Event): void => {
          ce.stopPropagation()
          ce.preventDefault()
        }
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // DEC-035 — the six-dot handle: rearrange, attach one item to another, or
  // move between classifications. Native HTML5 drag (the house pattern; there
  // is no dnd library in this codebase). `over` is the row being hovered and
  // where; `overSection` is a whole-section target.
  const [dragId, setDragId] = useState<string | null>(null)
  // DEC-048 — dragging a SELECTED row in select mode drags the whole
  // selection: one gesture nests or moves them all.
  const [dragMulti, setDragMulti] = useState(false)
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
    setDragMulti(false)
    setOver(null)
    setOverSection(null)
    clearDwell()
  }

  /** The ids riding the current drag: the selection when a selected row is
   *  dragged in select mode, otherwise just the grabbed row. */
  const draggedIds = (): string[] =>
    dragMulti && dragId ? [...new Set([...selected, dragId])] : dragId ? [dragId] : []

  /** Can the current drag NEST under a row at this rendered depth? Mirrors
   *  the planner's cap so the dwell affordance never offers a drop the write
   *  path would refuse (the db guard remains the backstop). */
  const canNestUnder = (targetId: string, targetDepth: number): boolean => {
    const ids = draggedIds()
    if (!ids.length || ids.includes(targetId)) return false
    for (const id of ids) if (subtreeIds(id, items).has(targetId)) return false
    const maxH = Math.max(...ids.map((id) => subtreeHeight(id, items)))
    return targetDepth + 1 + maxH <= MAX_GROUP_DEPTH
  }

  /** A drop ONTO a row. When that row lives in a different queue the same
   *  gesture reclassifies — the whole subtree crosses with its parent, and a
   *  multi-drag applies the one gesture to every selected item (DEC-048). */
  async function applyDrop(
    targetId: string,
    pos: DropPosition,
    rows: ReturnType<typeof orderWithGroups>,
    targetQueue: string
  ): Promise<void> {
    const ids = draggedIds()
    const multi = dragMulti
    endDrag()
    if (!ids.length) return
    const list = items.filter((x) => ids.includes(x.id))
    if (!list.length) return
    const crossQueue = list.some((x) => queueOf(x) !== targetQueue)
    const intoQueue = crossQueue ? targetQueue : undefined
    const writes =
      multi && list.length > 1
        ? planDropMulti(ids, targetId, pos, rows, intoQueue, items)
        : planDrop(list[0], targetId, pos, rows, intoQueue, items)
    await writeAll(writes)
  }

  /** Dropping on a section's header or empty space: reclassify into it and
   *  land at the end. Roots detach from their old parents, but each moved
   *  item's OWN subtree crosses with it. */
  async function moveToSection(
    queue: string,
    rows: ReturnType<typeof orderWithGroups>
  ): Promise<void> {
    const ids = draggedIds()
    const multi = dragMulti
    endDrag()
    if (!ids.length) return
    const movers = items.filter((x) => ids.includes(x.id) && queueOf(x) !== queue)
    if (!movers.length) return
    const writes =
      multi && ids.length > 1
        ? planMoveToQueueMulti(ids, queue, rows, items)
        : planMoveToQueue(movers[0].id, queue, rows, items)
    await writeAll(writes)
  }

  // DEC-051 — closing runs through the SHARED path (useCloseWorkItem), so the
  // desk-done offer and the subtask accounting behave identically here, on the
  // home widget, and on the desk widget. See that module for the rules.

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
  // DEC-062 — which desk clusters are folded shut. Session-scoped by design:
  // a fold is a "get this out of my way for now", not a preference worth
  // persisting across launches, and an item that reappears tomorrow is the
  // point of the queue.
  const [deskFolded, setDeskFolded] = useState<Set<string>>(new Set())
  const toggleDeskFold = (deskId: string): void =>
    setDeskFolded((prev) => {
      const next = new Set(prev)
      if (next.has(deskId)) next.delete(deskId)
      else next.add(deskId)
      return next
    })
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
  const [newTags, setNewTags] = useState<string[]>([])
  const [newNotes, setNewNotes] = useState('')
  const [newState, setNewState] = useState('open')
  const [newMentions, setNewMentions] = useState<ItemMention[]>([])
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
        notes: newNotes.trim() || undefined,
        parentId: newDeskId || null,
        intentClass: newClass,
        dueAt: newDate ? new Date(`${newDate}T17:00:00`).toISOString() : null,
        tags: serializeTags(newTags),
        mentions: serializeMentions(newMentions),
        state: newState === 'open' ? undefined : newState,
        confidence: 1, // human-stated, not inferred
        approvalState: 'auto',
        sourceType: 'note',
        wiOrigin: 'human'
      })
      setNewTitle('')
      setNewDate('')
      setNewTags([])
      setNewMentions([])
      setNewNotes('')
      setNewState('open')
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

  const visible = useMemo(() => {
    let out = tagFilter ? items.filter((i) => hasTag(i, tagFilter)) : items
    if (kpiFilter) out = out.filter((i) => KPI_FILTERS[kpiFilter](i, nowMs))
    return out
  }, [items, tagFilter, kpiFilter, nowMs])
  const allQueues = useMemo(
    () =>
      lens === 'due'
        ? groupByDue(visible, nowMs)
        : lens === 'origin'
          ? groupByOrigin(visible, nowMs)
          : groupIntoQueues(visible, nowMs),
    [visible, nowMs, lens]
  )
  // A class tab narrows to its one queue; the alternate lenses (Due/Origin)
  // answer a different question and always show everything.
  const queues = useMemo(
    () =>
      queueTab === 'all' || lens !== 'queue'
        ? allQueues
        : allQueues.filter((q) => q.queue === queueTab),
    [allQueues, queueTab, lens]
  )
  const countByClass = useMemo(() => {
    const m: Record<string, number> = {}
    for (const q of groupIntoQueues(items, nowMs)) m[q.queue] = q.items.length
    return m
  }, [items, nowMs])
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
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

  /** DEC-038 — hand the captured intent to Plexii as a PREFILLED chat.
   *  Staged in the composer, never sent (fb:composer-stage, the same seam the
   *  console's Expand mode uses): the assistant must not start acting because
   *  the operator glanced at his queue. He reads it, edits it, presses send.
   *  When the work belongs to a desk we go there first, so the assistant has
   *  that desk's context in its prompt rather than answering in the abstract. */
  function startWithPlexii(list: FbNode[]): void {
    if (list.length === 0) return
    const prompt =
      list.length === 1
        ? startPromptForItem(list[0], nodesById)
        : startPromptForMany(list, nodesById)
    if (!prompt) return
    const deskId = list.length === 1 ? list[0].parentId : null
    if (deskId && nodes.some((n) => n.id === deskId && n.kind === 'task')) {
      setActive(deskId)
      goTask(deskId)
    }
    useAssistantChrome.getState().setTab('chat')
    openAssistant()
    const stage = (): void => {
      window.dispatchEvent(new CustomEvent('fb:composer-stage', { detail: prompt }))
    }
    stage()
    // The panel may still be mounting; the second dispatch covers that (same
    // belt-and-braces the capture console uses).
    setTimeout(stage, 400)
    setSelectMode(false)
    setSelected(new Set())
  }

  /** DEC-048 — bulk closing verbs for the selection. "Complete" uses each
   *  item's OWN queue verb (a Meet item schedules, a Decide item decides…)
   *  so the record stays honest; "Dismiss" is the delete-shaped verb — items
   *  park recoverable, nothing is destroyed (work items have no hard delete
   *  by design). */
  async function bulkClose(kind: 'primary' | 'dismissed' | 'archived'): Promise<void> {
    const list = items.filter(
      (i) => selected.has(i.id) && !isTerminalState(i.workItemState) && i.detachedFromId == null
    )
    if (!list.length || bulkBusy) return
    setBulkBusy(true)
    try {
      for (const i of list) {
        const state =
          kind === 'primary' ? (PRIMARY_ACTION[queueOf(i)] ?? PRIMARY_ACTION.to_do).state : kind
        await setState(i.id, state)
      }
      await refresh()
    } finally {
      setBulkBusy(false)
      setSelected(new Set())
    }
  }

  /** Open the DESK the item lives on — the whole canvas, in context. */
  function openSource(i: FbNode): void {
    if (i.parentId && nodes.some((n) => n.id === i.parentId && n.kind === 'task')) {
      setActive(i.parentId)
      goTask(i.parentId)
    }
  }

  /** DEC-037 — open the marked OBJECT itself, inside Plexi, full-screen.
   *  Marking a Notion tool and then pressing the desk button launched the
   *  external Notion app (operator live QA): the desk button opens a canvas,
   *  and whatever that canvas hosts does its own thing. This is the other
   *  door — go to the desk, then put that one widget into Focus Mode, so the
   *  item can be dealt with in a single app without leaving Plexi. */
  function openHere(i: FbNode): void {
    if (!i.parentId || !i.sourceRef) return
    setActive(i.parentId)
    goTask(i.parentId)
    // After the canvas mounts, hand it the widget to focus.
    setTimeout(() => setFocusedWidget(i.sourceRef as string), 250)
  }

  function row(
    i: FbNode,
    inDetached: boolean,
    group?: {
      isChild: boolean
      childCount: number
      /** DEC-053 — rendered under this desk's cluster header, so the desk
       *  chip would repeat what the header already says. */
      clusterDeskId?: string | null
      /** STORAGE nesting depth (0 = root) — what the cap is measured against. */
      depth: number
      /** Rendered indent level: storage depth plus the desk-cluster offset. */
      indent: number
      /** Rows hidden while this one is collapsed. */
      descendants: number
      rows: ReturnType<typeof orderWithGroups>
      queue: string
    }
  ): JSX.Element {
    const isCollapsed = collapsed.has(i.id)
    const primary = PRIMARY_ACTION[queueOf(i)] ?? PRIMARY_ACTION.to_do
    const reason = itemReason(i, nowMs)
    const hasDesk = !!(i.parentId && nodes.some((n) => n.id === i.parentId))
    const isOpen = expanded.has(i.id)
    const notes = (i.description || '').trim()
    // Worth opening when the title is long enough to clip, or notes exist.
    const hasMore = notes.length > 0 || i.title.length > 60
    const canDrag = !!group && !inDetached
    const isOver = over?.id === i.id
    // DEC-050 — the project-tool anatomy: does it have subtasks, how far
    // along are they, how urgent is it, and who is on it.
    const hasKids = !!group && (group.childCount > 0 || (isCollapsed && group.descendants > 0))
    const progress = hasKids
      ? subtaskProgress(i.id, items, (x) => isTerminalState(x.workItemState))
      : null
    const urgency = urgencyOf(i)
    const assignees = parseMentions(i.mentions).filter((m) => m.kind === 'person')
    // DEC-062 — the elbow's geometry. `indentLevel` is the row's rendered
    // indent (storage depth plus the desk-cluster offset), clamped to the cap;
    // `elbowColor` is this row's own queue colour so the corner reads as part
    // of the same spine it joins; `moreSiblings` decides whether the parent's
    // trunk continues past the corner to reach the next child.
    const indentLevel = Math.min(group?.indent ?? 0, MAX_INDENT)
    // DEC-062 — the elbow keys off STORAGE depth, not rendered indent. A desk
    // cluster also indents its rows (indent = depth + 1), so keying off indent
    // drew a corner beside every item that merely sits on a desk — a ladder of
    // brackets down the cluster claiming a parent-child relationship that does
    // not exist. Only a genuine sub-item gets the corner.
    const isSubItem = (group?.depth ?? 0) > 0
    const elbowColor = queueTint(QUEUE_COLOR[queueOf(i)] ?? '#64748b', 0.45)
    const myIndex = group ? group.rows.findIndex((r) => r.item.id === i.id) : -1
    const moreSiblings = myIndex >= 0 && hasFollowingSibling(group!.rows, myIndex)
    return (
      <div
        key={i.id}
        data-item-row
        data-item-id={inDetached ? undefined : i.id}
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
                  // DEC-048 — the UI never offers a nest the cap would refuse:
                  // no dwell arm on a row the drag cannot legally land under.
                  if (canNestUnder(i.id, group?.depth ?? 0)) {
                    dwell.current = {
                      id: i.id,
                      timer: window.setTimeout(
                        () => setOver({ id: i.id, pos: 'into' }),
                        GROUP_DWELL_MS
                      )
                    }
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
        style={{ paddingLeft: `${8 + indentLevel * INDENT_PX}px` }}
        className={`group relative flex items-center gap-2 pr-2.5 py-1.5 min-h-[40px] transition-colors ${
          selected.has(i.id) && selectMode
            ? 'bg-[rgba(var(--accent),0.08)]'
            : 'hover:bg-[rgba(var(--accent),0.05)]'
        } ${
          dragId === i.id || (dragMulti && dragId && selected.has(i.id)) ? 'opacity-40' : ''
        } ${
          isOver && over?.pos === 'into'
            ? 'shadow-[inset_0_0_0_2px_rgba(var(--accent),0.5)]'
            : isOver && over?.pos === 'before'
              ? 'shadow-[0_-2px_0_rgb(var(--accent))]'
              : isOver && over?.pos === 'after'
                ? 'shadow-[0_2px_0_rgb(var(--accent))]'
                : ''
        }`}
      >
        {/* DEC-050 — the queue's colour as a spine down the row's left edge:
            which kind of work this is, readable without reading. */}
        <span
          aria-hidden
          className="absolute top-0 bottom-0 w-[3px]"
          style={{
            left: `${indentLevel * INDENT_PX}px`,
            backgroundColor: queueTint(QUEUE_COLOR[queueOf(i)] ?? '#64748b', 0.55)
          }}
        />
        {/* DEC-062 — the elbow. A sub-item used to sit at a deeper indent with
            its own free-floating spine, which reads as "another row, further
            right" rather than "this belongs to the one above". The corner joins
            the two: down the parent's line, a rounded bend inward, then across
            to where the child's own spine begins. */}
        {isSubItem && (
          <span
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              left: `${(indentLevel - 1) * INDENT_PX + 1}px`,
              top: 0,
              height: '50%',
              width: `${INDENT_PX - 1}px`,
              borderLeft: `2px solid ${elbowColor}`,
              borderBottom: `2px solid ${elbowColor}`,
              borderBottomLeftRadius: '9px'
            }}
          />
        )}
        {/* ...and when siblings follow, the parent's trunk carries on past the
            corner to reach them. Without this the last-but-one child's line
            appears to stop mid-row. */}
        {isSubItem && moreSiblings && (
          <span
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              left: `${(indentLevel - 1) * INDENT_PX + 1}px`,
              top: '50%',
              bottom: 0,
              width: '2px',
              backgroundColor: elbowColor
            }}
          />
        )}
        {selectMode && !inDetached && (
          <button
            onClick={() => toggleSelected(i.id)}
            title={selected.has(i.id) ? 'Deselect' : 'Select'}
            className="shrink-0 fb-press"
          >
            <Icon
              name={selected.has(i.id) ? 'check_box' : 'check_box_outline_blank'}
              size={16}
              className={selected.has(i.id) ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-30)]'}
            />
          </button>
        )}
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
              // DEC-048 — grabbing a SELECTED row moves the whole selection.
              setDragMulti(selectMode && selected.has(i.id) && selected.size > 1)
              // DEC-052 — the same drag can land OUTSIDE the queues: the rail
              // day grid (and the Calendar page) read this payload to book
              // the item. Internal reorder/nest handlers keep using state.
              e.dataTransfer.setData('text/fb-workitem', i.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={endDrag}
            title={
              selectMode && selected.has(i.id) && selected.size > 1
                ? `Drag to move all ${selected.size} selected — drop ON an item to nest them as its subtasks`
                : 'Drag to reorder, attach to another item, or move to another section'
            }
            /* DEC-055 — absolutely placed in the spine gutter: reserving a
               column for a hover-only affordance was the dead space to the
               left of the checkbox. */
            style={{ left: `${indentLevel * INDENT_PX}px` }}
            className="absolute z-0 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-[var(--ink-20)] hover:text-[var(--ink-50)] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Icon name="drag_indicator" size={16} />
          </button>
        )}
        {/* A fixed slot for the subtask chevron, so every title starts at the
            same x whether or not the row has children. */}
        {/* DEC-062 — `relative z-10`: the drag handle is absolutely positioned in
            this same gutter, and a positioned element paints above a static one
            whatever the DOM order, so the handle was swallowing every click
            meant for this chevron. The chevron is a persistent control and the
            handle a hover-only one, so the chevron wins the overlap. */}
        <span className="relative z-10 shrink-0 w-3.5 flex items-center justify-center">
          {hasKids && (
            <button
              data-row-action
              onClick={() => toggleCollapsed(i.id)}
              title={isCollapsed ? 'Show its subtasks' : 'Collapse its subtasks'}
              aria-expanded={!isCollapsed}
              className="h-4 w-4 flex items-center justify-center rounded text-[var(--ink-50)] hover:text-[var(--ink-100)] hover:bg-[var(--surface-sunken)] fb-press"
            >
              <Icon name={isCollapsed ? 'chevron_right' : 'expand_more'} size={15} />
            </button>
          )}
        </span>
        {!inDetached && (
          /* DEC-050 — the completion circle every task app puts first. It
             closes with the QUEUE's own verb (Done / Scheduled / Answered…),
             so one click never mislabels what happened. The queue's identity
             lives in the row's coloured spine, so no icon competes with it. */
          <button
            data-row-action
            onClick={() => void closeWithOffer(i, primary.state)}
            title={`${primary.label} — close this item`}
            className="shrink-0 h-[18px] w-[18px] rounded-full border-[1.5px] border-[var(--ink-30)] text-transparent flex items-center justify-center fb-press transition-colors hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10"
          >
            <Icon name="check" size={13} />
          </button>
        )}
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
          </div>
          {isOpen && notes && (
            <div className="mt-1.5 text-[12px] text-[var(--ink-70)] whitespace-pre-wrap break-words select-text">
              {notes}
            </div>
          )}
          {(() => {
            // DEC-037 — what this item is ABOUT, at a glance. Derived chips
            // (desk, plan, source) are facts and can never go stale; chosen
            // chips (urgency, tags) are optional by design.
            const ctx = itemContext(i, nodesById)
            const tags = parseTags(i.tags)
            // People render as avatars in the meta rail; the rest stay chips.
            const ments = parseMentions(i.mentions).filter((m) => m.kind !== 'person')
            if (!ctx.desk && !ctx.plan && !ctx.source && tags.length === 0 && ments.length === 0)
              return null
            return (
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {ctx.plan && (
                  <button
                    onClick={() => goProject(ctx.plan!.id)}
                    title="Open the plan"
                    className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] bg-[var(--surface-sunken)] text-[var(--ink-50)] hover:text-[var(--ink-100)] fb-press max-w-[160px]"
                  >
                    <Icon name="account_tree" size={10} />
                    <span className="truncate">{ctx.plan.title}</span>
                  </button>
                )}
                {ctx.desk && ctx.desk.id !== group?.clusterDeskId && (
                  <button
                    onClick={() => openSource(i)}
                    title="Open the desk"
                    className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] bg-[var(--surface-sunken)] text-[var(--ink-50)] hover:text-[var(--ink-100)] fb-press max-w-[160px]"
                  >
                    <Icon name="desk" size={10} />
                    <span className="truncate">{ctx.desk.title}</span>
                  </button>
                )}
                {ctx.source && (
                  <span
                    title={sourceLabel(ctx.source.type)}
                    className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] bg-[var(--surface-sunken)] text-[var(--ink-40)]"
                  >
                    <Icon name="widgets" size={10} />
                    {ctx.source.type}
                  </span>
                )}
                {ments.map((m) => (
                  <button
                    key={mentionKey(m)}
                    onClick={() => {
                      // Desk/room/plan mentions NAVIGATE; a person mention is
                      // informational until SPEC-027 routing exists.
                      if (m.kind === 'desk') {
                        setActive(m.id)
                        goTask(m.id)
                      } else if (m.kind === 'plan') goProject(m.id)
                      else if (m.kind === 'room') goRoom(m.id)
                    }}
                    title={
                      m.kind === 'person'
                        ? `${m.title} — mentioned (notifications arrive with routing)`
                        : `Open ${m.title}`
                    }
                    className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] bg-[rgba(var(--accent),0.10)] text-[var(--ink-60)] hover:text-[var(--ink-100)] fb-press max-w-[150px]"
                  >
                    <Icon name={MENTION_ICON[m.kind]} size={10} />
                    <span className="truncate">{m.title}</span>
                  </button>
                ))}
                {tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter((f) => (f === t ? null : t))}
                    title={tagFilter === t ? 'Clear this filter' : `Show only “${t}”`}
                    className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] fb-press ${
                      tagFilter === t
                        ? 'bg-[rgb(var(--accent))] text-white'
                        : 'bg-[rgba(var(--accent),0.10)] text-[var(--ink-60)] hover:text-[var(--ink-100)]'
                    }`}
                  >
                    <Icon name="sell" size={10} />
                    {t}
                  </button>
                ))}
              </div>
            )
          })()}
          {reason && <div className="text-[11px] text-[var(--ink-40)] mt-px leading-tight">{reason}</div>}
          {progress && progress.total > 0 && (
            /* DEC-048/050 — subtask progress, the "2/5" a project tool shows,
               with a bar. The chevron beside the title does the folding. */
            <button
              data-row-action
              onClick={() => toggleCollapsed(i.id)}
              title={isCollapsed ? 'Show its subtasks' : 'Collapse its subtasks'}
              className="mt-1.5 inline-flex items-center gap-2 fb-press group/prog"
            >
              <span className="h-1 w-16 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(progress.done / progress.total) * 100}%`,
                    backgroundColor: queueTint('#10b981', 0.75)
                  }}
                />
              </span>
              <span className="fb-t-caption fb-tabular text-[var(--ink-40)] group-hover/prog:text-[var(--ink-70)]">
                {progress.done}/{progress.total} subtask{progress.total === 1 ? '' : 's'}
                {isCollapsed ? ' · hidden' : ''}
              </span>
            </button>
          )}
        </div>
        {/* DEC-050 — the meta rail: the columns a project tool aligns down the
            right of every row. Always visible (unlike the hover actions), so
            the list can be SCANNED: priority, status, date, who. */}
        <div className="flex items-center gap-1.5 shrink-0">
          {urgency && (
            <span
              title={`Priority: ${urgency}`}
              className={`inline-flex items-center justify-center h-6 w-6 rounded ${
                urgency === 'urgent'
                  ? 'text-red-500 bg-red-500/10'
                  : urgency === 'high'
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-[var(--ink-30)]'
              }`}
            >
              <Icon name="flag" size={13} />
            </span>
          )}
          {!inDetached && (
            <ItemStatusPill
              state={i.workItemState}
              closeChoice={{ state: primary.state, label: primary.label }}
              onPick={(next) => {
                // The queue's closing verb runs through the SAME path the
                // completion circle uses, so the desk-done offer and the
                // subtask accounting fire either way.
                if (next === primary.state) void closeWithOffer(i, next)
                else void setState(i.id, next)
              }}
            />
          )}
          {i.dueAt && dueChip(i, nowMs)}
          {assignees.length > 0 && (
            <span className="flex items-center -space-x-1.5 pl-0.5">
              {assignees.slice(0, 3).map((m) => (
                <span
                  key={mentionKey(m)}
                  title={`${m.title} — mentioned`}
                  className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold uppercase text-[var(--ink-70)] bg-[var(--surface-sunken)] ring-1 ring-[var(--surface-raised)]"
                >
                  {(m.title || '?')
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')}
                </span>
              ))}
              {assignees.length > 3 && (
                <span className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] text-[var(--ink-50)] bg-[var(--surface-sunken)] ring-1 ring-[var(--surface-raised)]">
                  +{assignees.length - 3}
                </span>
              )}
            </span>
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
              className="icon-btn !h-6 !w-6"
            >
              <Icon name="link_off" size={14} />
            </button>
          )}
          {hasMore && (
            <button
              onClick={() => void copyItem(i)}
              title="Copy the full text"
              className="icon-btn !h-6 !w-6"
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
              {hasDesk && i.sourceRef && i.sourceType !== 'note' && (
                <button
                  onClick={() => openHere(i)}
                  title="Open it here — the object itself, full screen inside Plexi"
                  className="icon-btn !h-6 !w-6"
                >
                  <Icon name="open_in_full" size={14} />
                </button>
              )}
              {hasDesk && (
                <button
                  onClick={() => openSource(i)}
                  title="Open the whole desk it came from"
                  className="icon-btn !h-6 !w-6"
                >
                  <Icon name="desk" size={14} />
                </button>
              )}
              <button
                onClick={() => startWithPlexii([i])}
                title="Start it with Plexii — opens a chat prefilled from this capture"
                className="icon-btn !h-6 !w-6"
              >
                <Icon name="auto_awesome" size={14} />
              </button>
              <button
                onClick={() => void snoozeTomorrow(i.id)}
                title="Snooze until tomorrow morning"
                className="icon-btn !h-6 !w-6"
              >
                <Icon name="snooze" size={14} />
              </button>
              <button
                onClick={() => void setState(i.id, 'archived')}
                title="Archive — keep it, out of the way"
                className="icon-btn !h-6 !w-6"
              >
                <Icon name="archive" size={14} />
              </button>
              <button
                onClick={() => setEditing(i)}
                title="Open the item"
                className="icon-btn !h-6 !w-6"
              >
                <Icon name="open_in_new" size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto paper-texture text-[var(--ink-100)]">
      {/* DEC-048 — the command center: a wide grid, not stretched text. The
          queue column keeps a readable measure; the rail carries the
          attention-backed blocks (full variants of the SAME components the
          home dashboard shows compact). */}
      <div className="fb-cq max-w-[1600px] mx-auto px-5 lg:px-8 xl:px-10 py-7">
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
              onClick={() => {
                setSelectMode((v) => !v)
                setSelected(new Set())
              }}
              title="Select several items to hand to Plexii at once"
              className={`inline-flex items-center gap-1.5 h-9 px-3 fb-btn-surface fb-press fb-t-label ${
                selectMode ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-70)] hover:text-[var(--ink-100)]'
              }`}
            >
              <Icon name="checklist" size={15} /> {selectMode ? 'Done' : 'Select'}
            </button>
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
            className="mb-4 rounded-[var(--radius-card)] fb-glass-card px-4 py-3"
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
                className="icon-btn !h-6 !w-6"
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
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              onKeyDown={(e) => {
                // Enter makes a newline here; the form's Enter-to-file lives
                // on the container and must not fire mid-note.
                if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) e.stopPropagation()
              }}
              rows={2}
              placeholder="Notes (optional)"
              className="fb-field mt-2 w-full bg-[var(--surface-sunken)] px-3 py-2 text-[12px] resize-y text-[var(--ink-70)]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="fb-t-caption text-[var(--ink-40)] mr-1">Status</span>
              {CAPTURE_STATES.map((st) => (
                <button
                  key={st}
                  onClick={() => setNewState(st)}
                  className={`px-2 h-6 fb-t-label fb-press rounded-full ${
                    newState === st
                      ? 'bg-[var(--surface-raised)] text-[var(--ink-100)] shadow-[inset_0_0_0_1px_var(--edge-soft)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--ink-50)] hover:text-[var(--ink-100)]'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
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
            <div className="mt-2">
              <TagMentionInput
                tags={newTags}
                mentions={newMentions}
                onTags={setNewTags}
                onMentions={setNewMentions}
              />
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
        {/* DEC-049 — the dashboard region. Analytics KPIs run across the top
            of the working column (CRM-style), the AI strip sits with them,
            and the day's calendar takes the top right, directly under the
            banner. The rail below it is SHORT and sticky, so nothing
            important is a long scroll away. */}
        <div className="fb-cq-att">
        <div className="min-w-0">
        <div className="flex flex-col gap-4 mb-5">
          <AnalyticsBlock
            variant="band"
            activeKpi={kpiFilter}
            onPickKpi={(k) => {
              if (k === 'closed_7d') {
                setShowClosed(true)
                setKpiFilter(null)
                return
              }
              setKpiFilter((cur) => (cur === k ? null : k))
            }}
          />
          <StartHereBlock variant="band" />
        </div>
        <div className="mb-3 flex items-center gap-1 flex-wrap">
          {(['all', ...QUEUE_ORDER] as string[]).map((t) => {
            const active = queueTab === t
            const hue = t === 'all' ? null : QUEUE_COLOR[t]
            const n = t === 'all' ? undefined : countByClass[t]
            return (
              <button
                key={t}
                onClick={() => pickTab(t)}
                onDragOver={
                  dragId && t !== 'all'
                    ? (e) => {
                        e.preventDefault()
                        setOverSection(t)
                      }
                    : undefined
                }
                onDragLeave={dragId ? () => setOverSection((c) => (c === t ? null : c)) : undefined}
                onDrop={
                  dragId && t !== 'all'
                    ? (e) => {
                        e.preventDefault()
                        void moveToSection(t, [])
                      }
                    : undefined
                }
                style={
                  active && hue
                    ? { backgroundColor: queueTint(hue, 0.1), boxShadow: `inset 0 -2px 0 ${queueTint(hue, 0.45)}` }
                    : overSection === t && dragId
                      ? { backgroundColor: queueTint(hue ?? '#64748b', 0.14) }
                      : undefined
                }
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg fb-t-label fb-press ${
                  active
                    ? hue
                      ? 'text-[var(--ink-100)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--ink-100)]'
                    : 'text-[var(--ink-50)] hover:text-[var(--ink-100)]'
                }`}
              >
                <Icon
                  name={t === 'all' ? 'notifications' : (QUEUE_ICON[t] ?? 'label')}
                  size={14}
                  style={hue ? { color: hue } : undefined}
                />
                {t === 'all' ? 'All' : QUEUE_LABEL[t]}
                {n !== undefined && n > 0 && (
                  <span className="fb-t-caption fb-tabular text-[var(--ink-40)]">{n}</span>
                )}
              </button>
            )
          })}
        </div>
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
        {selectMode && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.06)] px-3 py-2">
            <span className="fb-t-label text-[var(--ink-70)]">
              {selected.size} selected
            </span>
            <button
              onClick={() => setSelected(new Set(visible.filter((i) => !isTerminalState(i.workItemState)).map((i) => i.id)))}
              className="fb-t-label text-[var(--ink-50)] hover:text-[var(--ink-100)] fb-press"
            >
              Select all
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="fb-t-label text-[var(--ink-50)] hover:text-[var(--ink-100)] fb-press"
              >
                Clear
              </button>
            )}
            <span className="fb-t-caption text-[var(--ink-40)] hidden lg:inline">
              Shift+drag sweeps a selection · drag a selected row onto an item to nest
            </span>
            <div className="flex-1" />
            <button
              onClick={() => void bulkClose('primary')}
              disabled={selected.size === 0 || bulkBusy}
              title="Close each with its own queue’s verb — done, scheduled, answered…"
              className="inline-flex items-center gap-1.5 h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-40"
            >
              <Icon name="done_all" size={14} />
              Complete all
            </button>
            <button
              onClick={() => void bulkClose('dismissed')}
              disabled={selected.size === 0 || bulkBusy}
              title="Dismiss the selection — parked and recoverable, nothing is destroyed"
              className="inline-flex items-center gap-1.5 h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] disabled:opacity-40"
            >
              <Icon name="delete_sweep" size={14} />
              Dismiss all
            </button>
            <button
              onClick={() => void bulkClose('archived')}
              disabled={selected.size === 0 || bulkBusy}
              title="Archive the selection — kept, out of the way"
              className="inline-flex items-center gap-1.5 h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] disabled:opacity-40"
            >
              <Icon name="archive" size={14} />
              Archive all
            </button>
            <button
              onClick={() => startWithPlexii(items.filter((i) => selected.has(i.id)))}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-40"
            >
              <Icon name="auto_awesome" size={14} />
              Get started with Plexii
            </button>
          </div>
        )}
        {kpiFilter && (
          /* DEC-049 — a narrowed queue always SAYS it is narrowed, with the
             escape right there. */
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full fb-t-label bg-[rgba(var(--accent),0.12)] text-[var(--ink-80)]">
              <Icon name="filter_alt" size={13} />
              Showing {KPI_LABEL[kpiFilter]} only
            </span>
            <button
              onClick={() => setKpiFilter(null)}
              className="fb-t-label text-[var(--ink-50)] hover:text-[var(--ink-100)] fb-press"
            >
              Clear
            </button>
          </div>
        )}
        {(() => {
          const vocab = tagVocabulary(items)
          if (vocab.length === 0) return null
          return (
            <div className="mb-4 flex items-center gap-1 flex-wrap">
              <span className="fb-t-label text-[var(--ink-40)] mr-1">Tags</span>
              {vocab.slice(0, 10).map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter((f) => (f === tag ? null : tag))}
                  className={`inline-flex items-center gap-1 px-2 h-6 rounded-full fb-t-label fb-press ${
                    tagFilter === tag
                      ? 'bg-[rgb(var(--accent))] text-white'
                      : 'bg-[var(--surface-sunken)] text-[var(--ink-50)] hover:text-[var(--ink-100)]'
                  }`}
                >
                  {tag}
                  <span className="opacity-60 fb-tabular">{count}</span>
                </button>
              ))}
              {tagFilter && (
                <button
                  onClick={() => setTagFilter(null)}
                  className="text-[11px] text-[var(--ink-40)] hover:text-[var(--ink-100)] fb-press ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          )
        })()}
        {loaded && total === 0 && detached.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="check_circle" size={28} className="text-[var(--ink-30)] mb-3" />
            <div className="fb-t-label text-[var(--ink-50)]">Nothing needs you</div>
            <div className="fb-t-body text-[var(--ink-30)] mt-1">
              Capture anything with ⌘K → “Capture a work item”.
            </div>
          </div>
        ) : (
          /* DEC-048 — Shift+drag anywhere over the queues sweeps a marquee. */
          <div className="flex flex-col gap-6" onMouseDown={startMarquee}>
            {queues.map((q) => {
              // DEC-035: in the Queue lens the rows carry grouping + manual
              // order; the other lenses (Due/Origin) answer a different
              // question, so they stay ranked and undraggable.
              const grouped =
                lens === 'queue' ? orderWithGroups(q.items, (x) => rankScore(x, nowMs)) : null
              const shown = grouped ? visibleRows(grouped, collapsed) : null
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
                  <div className="flex items-center gap-2 mb-2 px-0.5">
                    <Icon
                      name={QUEUE_ICON[q.queue] ?? 'label'}
                      size={14}
                      className="text-[var(--ink-40)]"
                      style={QUEUE_COLOR[q.queue] ? { color: QUEUE_COLOR[q.queue] } : undefined}
                    />
                    <span className="fb-t-label text-[var(--ink-70)]">{q.label}</span>
                    <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{q.items.length}</span>
                    {overSection === q.queue && (
                      <span className="fb-t-caption text-[rgb(var(--accent))]">move here</span>
                    )}
                  </div>
                  {/* DEC-055 — ONE box holds the queue; rows sit flush inside
                      it, separated by a hairline. The per-desk grouping is a
                      FRAGMENT, not a wrapper div: a wrapper made every row a
                      grandchild, so `divide-y` only ever drew between desk
                      clusters (the reason the first divider attempt showed
                      nothing at all). */}
                  <div className="rounded-[var(--radius-card)] fb-glass-card overflow-hidden divide-y divide-[var(--edge-soft)]">
                    {shown && grouped
                      ? clusterByDesk(shown).map((cluster, ci) => {
                          const desk = cluster.deskId ? nodesById.get(cluster.deskId) : null
                          return (
                            <Fragment key={cluster.deskId ?? `flat-${ci}`}>
                              {desk && (
                                /* DEC-047 D-2 — the desk header: DERIVED from
                                   parentId, never stored. Title · the desk's
                                   OWN status (labeled "Desk:" so it cannot be
                                   read as an item class) · due · open count.
                                   Click opens the desk. */
                                <button
                                  /* DEC-062 — the header now FOLDS its cluster.
                                     The operator: "when I click lakedash it
                                     hides all the items associated and if i
                                     click again it expands the full list".
                                     Opening the desk moved onto the icon, which
                                     keeps that reachable without stealing the
                                     click he asked for. */
                                  onClick={() => toggleDeskFold(desk.id)}
                                  aria-expanded={!deskFolded.has(desk.id)}
                                  title={
                                    deskFolded.has(desk.id)
                                      ? `Show the ${cluster.rows.length} items on this desk`
                                      : 'Hide this desk’s items'
                                  }
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left fb-press"
                                  style={{
                                    /* DEC-062 — tinted in the QUEUE's colour, not
                                       the generic accent: the operator asked for
                                       an obvious cue for what kind of work sits
                                       under the header (to-do blue, meet green).
                                       Kept faint — it is a band behind a whole
                                       cluster, so it carries further than the
                                       3px spine at the same alpha would. */
                                    backgroundColor: queueTint(
                                      QUEUE_COLOR[q.queue] ?? '#64748b',
                                      0.1
                                    )
                                  }}
                                >
                                  <Icon
                                    name={deskFolded.has(desk.id) ? 'chevron_right' : 'expand_more'}
                                    size={14}
                                    className="text-[var(--ink-40)] shrink-0"
                                  />
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    title="Open this desk"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setActive(desk.id)
                                      goTask(desk.id)
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== 'Enter' && e.key !== ' ') return
                                      e.stopPropagation()
                                      setActive(desk.id)
                                      goTask(desk.id)
                                    }}
                                    className="shrink-0 flex items-center rounded hover:bg-[var(--surface-sunken)] p-0.5 fb-press"
                                  >
                                    <Icon name="desk" size={13} className="text-[var(--ink-40)]" />
                                  </span>
                                  <span className="fb-t-label text-[var(--ink-70)] truncate">
                                    {desk.title || 'Untitled desk'}
                                  </span>
                                  <span className="fb-t-caption text-[var(--ink-40)]">
                                    Desk: {DESK_STATUS_LABEL[desk.status] ?? desk.status}
                                  </span>
                                  {desk.dueDate != null && (
                                    <span className="fb-t-caption text-[var(--ink-40)]">
                                      due{' '}
                                      {new Date(desk.dueDate).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric'
                                      })}
                                    </span>
                                  )}
                                  <span className="fb-t-caption fb-tabular text-[var(--ink-30)] ml-auto">
                                    {cluster.rows.length}
                                  </span>
                                </button>
                              )}
                              {(desk && deskFolded.has(desk.id) ? [] : cluster.rows).map((g) =>
                                row(g.item, false, {
                                  isChild: g.isChild || !!desk,
                                  childCount: g.childCount,
                                  clusterDeskId: desk?.id ?? null,
                                  depth: g.depth,
                                  indent: g.depth + (desk ? 1 : 0),
                                  descendants: g.descendants,
                                  rows: grouped,
                                  queue: q.queue
                                })
                              )}
                            </Fragment>
                          )
                        })
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
                <div className="flex flex-col gap-1.5">
                  {signals.map((s) => (
                    <div
                      key={s.key}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg fb-glass-row hover:bg-[rgba(var(--accent),0.05)] transition-colors"
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
                <div className="rounded-[var(--radius-card)] fb-glass-card overflow-hidden divide-y divide-[var(--edge-soft)]">
                  {detached.map((i) => row(i, true))}
                </div>
              </section>
            )}
            {/* DEC-049 — recent activity is history, so it sits at the FOOT of
                the working column beside the other history shelves, not in
                the rail where live work belongs. */}
            <RecentActivityBlock variant="full" />
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
        <aside className="fb-cq-rail flex-col gap-4 min-w-0 sticky top-0 self-start">
          <AgendaBlock variant="full" />
          <OverdueRadarBlock variant="full" />
        </aside>
        </div>
      </div>
      {marquee && (
        <div
          className="fixed z-50 pointer-events-none rounded-sm border border-[rgba(var(--accent),0.6)] bg-[rgba(var(--accent),0.08)]"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0)
          }}
        />
      )}
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
