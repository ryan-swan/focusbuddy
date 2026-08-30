import { useEffect, useMemo, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useWorkItemStore } from '../../stores/workItems'
import { useTimeBlockStore } from '../../stores/timeBlocks'
import { useViewStore } from '../../stores/view'
import Icon from '../Icon'
import WeekTimeGrid, { type GridGhost } from './WeekTimeGrid'
import {
  loadPlannerSettings,
  planDay,
  schedulableItems,
  sweepMissed,
  type PlannedProposal
} from '../../lib/attentionPlanner'
import { parseTags } from '../../lib/itemTags'
import { parseMentions } from '../../lib/itemMentions'
import { useActionHistory } from '../../stores/actionHistory'
import { useRef } from 'react'
import {
  QUEUE_COLOR,
  QUEUE_LABEL,
  QUEUE_ORDER,
  queueOf,
  queueTint,
  rankScore,
  isTerminalState
} from '../../lib/attentionQueues'
import { useCaptureConsole } from '../../stores/captureConsole'
import {
  savePlannerSettings,
  type PlannerSettings
} from '../../lib/attentionPlanner'

// The Calendar destination (DEC-052, Analysis 24 §0) — the planning half of
// the Attention layer. The queue rides on the LEFT as a draggable list (the
// Akiflow adjacency: list and grid on screen together, drag between them),
// the grid on the right in Day / 3-Day / Week, plus a Month overview. One
// grid component serves this page wide and the Attention rail narrow.
//
// This view was previously wired to legacy desk tasks and a second ranker
// (priorityScore) — it could not see Attention work at all, which is why the
// tab went unused (GAP-007/A-006). It now reads work items and the SAME
// ranker the queues use, so the two surfaces can never disagree about what
// matters today.

type CalMode = 'day' | '3day' | 'week' | 'month'

const MODE_DAYS: Record<Exclude<CalMode, 'month'>, number> = { day: 1, '3day': 3, week: 7 }

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function dayMs(d: Date): number {
  return dayStart(d).getTime()
}

// 6 weeks × 7 days from the Monday on or before the 1st.
function monthGrid(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

export default function CalendarView(): JSX.Element {
  const items = useWorkItemStore((s) => s.items)
  const wiLoaded = useWorkItemStore((s) => s.loaded)
  const refreshItems = useWorkItemStore((s) => s.refresh)
  const updateFields = useWorkItemStore((s) => s.updateFields)
  const blocks = useTimeBlockStore((s) => s.blocks)
  const createBlock = useTimeBlockStore((s) => s.create)
  const updateBlock = useTimeBlockStore((s) => s.update)
  const nodes = useNodeStore((s) => s.nodes)
  const goAttention = useViewStore((s) => s.goAttention)
  const openConsole = useCaptureConsole((s) => s.openConsole)

  useEffect(() => {
    if (!wiLoaded) void refreshItems()
  }, [wiLoaded, refreshItems])

  const today = new Date()
  const [mode, setMode] = useState<CalMode>(
    () => (localStorage.getItem('calendar.mode') as CalMode) || 'week'
  )
  const pickMode = (m: CalMode): void => {
    localStorage.setItem('calendar.mode', m)
    setMode(m)
  }
  const [anchor, setAnchor] = useState<Date>(() => dayStart(today))
  // DEC-053 — one classification at a time, or all. Persisted like the mode.
  const [classFilter, setClassFilter] = useState<string>(
    () => localStorage.getItem('calendar.classFilter') || 'all'
  )
  const pickClass = (c: string): void => {
    localStorage.setItem('calendar.classFilter', c)
    setClassFilter(c)
  }
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<PlannerSettings>(() => loadPlannerSettings())
  const patchSettings = (patch: Partial<PlannerSettings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    savePlannerSettings(next)
  }
  // DEC-053 — dragging a block over the queue rail unschedules it.
  const railRef = useRef<HTMLElement | null>(null)
  const [blockDragging, setBlockDragging] = useState(false)

  const rangeStart = useMemo(() => {
    if (mode === 'week') return mondayOf(anchor)
    if (mode === 'month') return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    return dayStart(anchor)
  }, [anchor, mode])

  function shift(dir: -1 | 1): void {
    const a = new Date(anchor)
    if (mode === 'month') a.setMonth(a.getMonth() + dir)
    else a.setDate(a.getDate() + dir * MODE_DAYS[mode])
    setAnchor(a)
  }

  const nowMs = Date.now()

  // ── The queue rail: what could be scheduled ───────────────────────────────
  const active = useMemo(
    () =>
      items.filter(
        (i) =>
          !isTerminalState(i.workItemState) &&
          i.detachedFromId == null &&
          !(i.snoozeUntil != null && i.snoozeUntil > nowMs) &&
          (classFilter === 'all' || queueOf(i) === classFilter)
      ),
    [items, nowMs, classFilter]
  )
  // An item with a FUTURE block is already placed — it sinks below the rest
  // (never hidden: nothing leaves the queue without landing somewhere).
  const scheduledIds = useMemo(() => {
    const set = new Set<string>()
    for (const b of blocks) {
      if (b.taskId && b.status === 'planned' && b.startMs + b.durationMin * 60000 > nowMs)
        set.add(b.taskId)
    }
    return set
  }, [blocks, nowMs])
  const railItems = useMemo(() => {
    return [...active].sort((a, b) => {
      const as = scheduledIds.has(a.id) ? 1 : 0
      const bs = scheduledIds.has(b.id) ? 1 : 0
      if (as !== bs) return as - bs
      return rankScore(b, nowMs) - rankScore(a, nowMs)
    })
  }, [active, scheduledIds, nowMs])

  // ── DEC-052 B3/B4 — the planner: preview-first, always ──────────────────
  const [intent, setIntent] = useState('')
  const [proposals, setProposals] = useState<PlannedProposal[] | null>(null)
  const [planNote, setPlanNote] = useState<string | null>(null)
  // DEC-071 — the proposal is REVIEWABLE before it is accepted. A summary line
  // that truncates ("3 blocks proposed · 82 min — Top creative items: Update
  // Chan…") is an assurance, not an explanation: it cannot say WHICH items,
  // WHEN each lands, or WHY it chose them, and the ghosts on the grid cannot be
  // clicked because nothing is booked yet. So the plan opens in a review pane.
  const [reviewOpen, setReviewOpen] = useState(false)
  // The prompt that produced the current proposal, echoed in the review so the
  // plan can be judged against what was actually asked for.
  const [planIntent, setPlanIntent] = useState('')
  const intentRef = useRef<HTMLTextAreaElement | null>(null)
  // Measure-then-set: collapse to auto first so the field can SHRINK when text
  // is deleted, not just grow. Capped to match the max-h so the scroll takes
  // over instead of the box running away.
  useEffect(() => {
    const el = intentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 152)}px`
  }, [intent])
  const [planBusy, setPlanBusy] = useState(false)

  /** The day being planned: the visible day, or today when the week shows. */
  const planDayMs = useMemo(() => {
    if (mode === 'week' || mode === 'month') {
      const t = dayMs(new Date())
      const end = rangeStart.getTime() + (mode === 'week' ? 7 : 31) * 86_400_000
      return t >= rangeStart.getTime() && t < end ? t : rangeStart.getTime()
    }
    return rangeStart.getTime()
  }, [mode, rangeStart])

  const deskTitles = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of nodes) if (n.kind === 'task') m.set(n.id, n.title || 'Untitled desk')
    return m
  }, [nodes])

  async function runPlan(): Promise<void> {
    if (planBusy) return
    setPlanBusy(true)
    setPlanNote(null)
    try {
      const opts = { placedIds: scheduledIds, deskTitles }
      const settings = loadPlannerSettings()
      let out: PlannedProposal[]
      if (intent.trim()) {
        // Intent mode: the model (or its keyword fallback) picks + orders;
        // placement stays deterministic and local.
        const candidates = schedulableItems(items, nowMs)
          .filter((i) => !scheduledIds.has(i.id))
          .map((i) => ({
            id: i.id,
            title: i.title || '',
            context: [
              ...parseTags(i.tags),
              ...parseMentions(i.mentions).map((mn) => mn.title),
              i.parentId ? deskTitles.get(i.parentId) ?? '' : ''
            ]
              .filter(Boolean)
              .join(', ')
          }))
        const sel = await window.api.workItems.planSelect(intent, candidates)
        if (!sel.ids.length) {
          setPlanNote('Nothing in the queue matches that. Try different words, or leave it empty to let Plexii pick.')
          setProposals(null)
          return
        }
        out = planDay(items, blocks, settings, planDayMs, nowMs, {
          ...opts,
          onlyItemIds: sel.ids,
          source: 'intent'
        })
        setPlanNote(sel.note)
      } else {
        out = planDay(items, blocks, settings, planDayMs, nowMs, opts)
      }
      setProposals(out.length ? out : null)
      // DEC-071 — a plan arrives for REVIEW, not as a fait accompli behind a
      // truncated line. Nothing is booked by opening it.
      if (out.length) {
        setPlanIntent(intent.trim())
        setReviewOpen(true)
      }
      if (!out.length)
        setPlanNote(
          'Nothing to place — the day is full, or everything left is waiting on someone else.'
        )
    } finally {
      setPlanBusy(false)
    }
  }

  /** B4 — replan undone: mark slipped blocks missed (the record stays; nothing
   *  moves) and re-propose their items into what's left of the day. */
  async function replanUndone(): Promise<void> {
    if (planBusy) return
    setPlanBusy(true)
    setPlanNote(null)
    try {
      const missed = sweepMissed(blocks, nowMs)
      if (!missed.length) {
        setPlanNote('Nothing slipped. Clean slate.')
        setProposals(null)
        return
      }
      for (const b of missed) await updateBlock(b.id, { status: 'missed' })
      const itemIds = [...new Set(missed.map((b) => b.taskId).filter((x): x is string => !!x))]
      const out = planDay(items, blocks, loadPlannerSettings(), planDayMs, nowMs, {
        onlyItemIds: itemIds,
        deskTitles,
        source: 'replan'
      })
      setProposals(out.length ? out : null)
      // DEC-071 — a plan arrives for REVIEW, not as a fait accompli behind a
      // truncated line. Nothing is booked by opening it.
      if (out.length) {
        setPlanIntent(intent.trim())
        setReviewOpen(true)
      }
      setPlanNote(
        out.length
          ? `${missed.length} block${missed.length === 1 ? '' : 's'} slipped — marked missed (the record stays), fresh time proposed below.`
          : `${missed.length} slipped block${missed.length === 1 ? '' : 's'} marked missed — no room left today to re-propose.`
      )
    } finally {
      setPlanBusy(false)
    }
  }

  /** DEC-053 — a block released over the rail: delete it (undo-able); the
   *  item drops back into "To schedule" by construction. Locked blocks are
   *  the pin — a pin dropped on the rail stays put. */
  const removeBlock = useTimeBlockStore.getState().remove
  function handleBlockDragOut(
    block: import('@shared/types').TimeBlock,
    x: number,
    y: number
  ): boolean {
    const r = railRef.current?.getBoundingClientRect()
    if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) return false
    if (block.locked) return false
    void removeBlock(block.id)
    return true
  }

  async function acceptPlan(only?: PlannedProposal[]): Promise<void> {
    const take = only ?? proposals
    if (!take || take.length === 0) return
    // One gesture, one undo: the whole accepted plan reverses with a single
    // ⌘Z (the batch seam the AI "Apply all" uses).
    useActionHistory.getState().beginBatch()
    try {
      for (const p of take) {
        await createBlock({
          taskId: p.itemId,
          title: '',
          startMs: p.startMs,
          durationMin: p.durationMin,
          origin: 'auto'
        })
      }
    } finally {
      useActionHistory.getState().endBatch(`Planned ${take.length} blocks`)
    }
    setProposals(null)
    setPlanNote(null)
    setReviewOpen(false)
  }

  /** Drop one block from the proposal without touching the rest. */
  function dropProposal(itemId: string, startMs: number): void {
    setProposals((prev) => {
      const next = (prev ?? []).filter((p) => !(p.itemId === itemId && p.startMs === startMs))
      if (next.length > 0) return next
      // Emptying the set is the same as discarding it — leaving an empty
      // review open would be a dialog about nothing.
      setReviewOpen(false)
      setPlanNote(null)
      return null
    })
  }

  const ghosts: GridGhost[] = useMemo(
    () => (proposals ?? []).map((p) => ({ ...p })),
    [proposals]
  )

  // ── Month data: due work items (primary) + due desks (secondary) ──────────
  const monthDays = useMemo(() => monthGrid(rangeStart), [rangeStart])
  const dueItemsByDay = useMemo(() => {
    const m = new Map<number, FbNode[]>()
    for (const i of active) {
      if (!i.dueAt) continue
      const t = Date.parse(i.dueAt)
      if (Number.isNaN(t)) continue
      const key = dayMs(new Date(t))
      m.set(key, [...(m.get(key) ?? []), i])
    }
    for (const list of m.values()) list.sort((a, b) => rankScore(b, nowMs) - rankScore(a, nowMs))
    return m
  }, [active, nowMs])
  const dueDesksByDay = useMemo(() => {
    const m = new Map<number, FbNode[]>()
    for (const n of nodes) {
      if (n.kind !== 'task' || n.dueDate == null || n.status === 'done' || n.status === 'parked')
        continue
      const key = dayMs(new Date(n.dueDate))
      m.set(key, [...(m.get(key) ?? []), n])
    }
    return m
  }, [nodes])

  const rangeLabel = useMemo(() => {
    if (mode === 'month')
      return rangeStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const end = new Date(rangeStart)
    end.setDate(rangeStart.getDate() + MODE_DAYS[mode] - 1)
    const s = rangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    if (mode === 'day') return s
    return `${s} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  }, [mode, rangeStart])

  function railRow(i: FbNode): JSX.Element {
    const hue = QUEUE_COLOR[queueOf(i)] ?? '#64748b'
    const placed = scheduledIds.has(i.id)
    const overdue = i.dueAt && Date.parse(i.dueAt) < nowMs
    return (
      <div
        key={i.id}
        draggable
        onDragStart={(e) => {
          // The grid (and the month cells) read this to book/date the item.
          e.dataTransfer.setData('text/fb-workitem', i.id)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        className={`group relative flex items-center gap-2 rounded-lg fb-glass-row pl-3 pr-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-[rgba(var(--accent),0.05)] hover:-translate-y-px transition-all ${
          placed ? 'opacity-60' : ''
        }`}
        title={placed ? `${i.title} — already on the calendar` : `Drag onto the calendar to schedule: ${i.title}`}
      >
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full"
          style={{ backgroundColor: queueTint(hue, 0.55) }}
        />
        <Icon
          name="drag_indicator"
          size={13}
          className="shrink-0 text-[var(--ink-20)] group-hover:text-[var(--ink-50)]"
        />
        <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-90)] truncate">{i.title}</span>
        {i.dueAt && (
          <span
            className={`shrink-0 text-[10px] fb-tabular ${overdue ? 'text-rose-500' : 'text-[var(--ink-40)]'}`}
          >
            {new Date(i.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        {placed && (
          <Icon name="event_available" size={13} className="shrink-0 text-emerald-500" />
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto paper-texture text-[var(--ink-100)]">
      <div className="fb-cq max-w-[1600px] mx-auto px-5 lg:px-8 xl:px-10 py-7">
        {/* DEC-054 — the header is TWO stable rows, not one that reflows: a
            title row, then a toolbar that keeps its shape whether the left
            panel is open or closed. The mode switcher never compresses (its
            buttons carry a min width) and the toolbar wraps as a whole
            instead of squeezing its members. */}
        <div className="mb-5 flex flex-col gap-3.5">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="fb-t-title text-[var(--ink-90)]">Calendar</h1>
              <p className="fb-t-body text-[var(--ink-50)] mt-1 max-w-[62ch]">
                Your attention, on the clock. Drag work from the queue into your day — deadlines
                ride above the grid, blocks live in it.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <select
                value={classFilter}
                onChange={(e) => pickClass(e.target.value)}
                title="Show one classification"
                className="fb-field h-9 min-w-[124px] bg-[var(--surface-raised)] px-2.5 text-[12.5px] text-[var(--ink-80)] shadow-[0_0_0_1px_var(--edge-hairline)]"
                data-testid="calendar-class-filter"
              >
                <option value="all">All classes</option>
                {QUEUE_ORDER.map((q) => (
                  <option key={q} value={q}>
                    {QUEUE_LABEL[q]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => openConsole()}
                title="Capture a new attention item"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--radius-field)] fb-glass-row fb-press fb-t-label text-[var(--ink-80)] hover:text-[var(--ink-100)] hover:bg-[rgba(var(--accent),0.06)] transition-colors"
              >
                <Icon name="add" size={15} /> New
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center rounded-[var(--radius-field)] fb-glass-row p-1 gap-0.5 shrink-0">
              {(
                [
                  ['day', 'Day'],
                  ['3day', '3-Day'],
                  ['week', 'Week'],
                  ['month', 'Month']
                ] as Array<[CalMode, string]>
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => pickMode(m)}
                  className={`min-w-[62px] px-3 h-8 fb-t-label fb-press rounded-[calc(var(--radius-field)-3px)] whitespace-nowrap transition-colors ${
                    mode === m
                      ? 'bg-[rgba(var(--accent),0.14)] text-[var(--ink-100)] shadow-[inset_0_0_0_1px_rgba(var(--accent),0.3)]'
                      : 'text-[var(--ink-50)] hover:text-[var(--ink-100)] hover:bg-[rgba(var(--accent),0.06)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => shift(-1)} className="icon-btn !h-9 !w-9" title="Earlier">
                <Icon name="chevron_left" size={17} />
              </button>
              <button
                onClick={() => setAnchor(dayStart(new Date()))}
                className="h-9 px-3.5 rounded-[var(--radius-field)] fb-glass-row fb-press fb-t-label text-[var(--ink-80)] hover:bg-[rgba(var(--accent),0.06)] transition-colors"
              >
                Today
              </button>
              <button onClick={() => shift(1)} className="icon-btn !h-9 !w-9" title="Later">
                <Icon name="chevron_right" size={17} />
              </button>
            </div>

            <span className="fb-t-label text-[var(--ink-70)] fb-tabular whitespace-nowrap px-1">
              {rangeLabel}
            </span>
          </div>
        </div>

        <div className="fb-cq-cal">
          {/* The queue rail — the half you drag FROM. */}
          <aside
            ref={railRef}
            className={`fb-cq-rail flex-col gap-2 sticky top-0 rounded-xl transition-shadow ${
              blockDragging ? 'ring-2 ring-[rgba(var(--accent),0.45)] ring-offset-4 ring-offset-[var(--surface-base)]' : ''
            }`}
          >
            {/* DEC-055 — the panel is a SOLID glass surface, not a list lying
                on the dotted paper, and it filters by CLASSIFICATION (the
                free-text box is gone). The dropdown writes the same one
                filter the header shows, so there is a single truth with two
                places to reach it. */}
            <div className="rounded-[var(--radius-card)] fb-glass-panel p-3 flex flex-col gap-2.5 min-h-0">
              <div className="flex items-center gap-2">
                <Icon name="notifications" size={14} className="text-[var(--ink-40)]" />
                <span className="fb-t-label text-[var(--ink-70)] flex-1 truncate">
                  {blockDragging ? 'Drop here to unschedule' : 'To schedule'}
                </span>
                <button
                  onClick={goAttention}
                  className="fb-t-caption text-[var(--ink-40)] hover:text-[var(--ink-80)] fb-press shrink-0"
                >
                  Open Attention
                </button>
              </div>
              <select
                value={classFilter}
                onChange={(e) => pickClass(e.target.value)}
                title="Filter this list by classification"
                data-testid="rail-class-filter"
                className="fb-field w-full bg-[var(--surface-sunken)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink-80)]"
              >
                <option value="all">All open items</option>
                {QUEUE_ORDER.map((q) => (
                  <option key={q} value={q}>
                    {QUEUE_LABEL[q]}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-268px)] pr-0.5 -mr-0.5">
                {railItems.length === 0 ? (
                  <div className="text-[11.5px] text-[var(--ink-30)] py-6 text-center leading-relaxed">
                    {classFilter === 'all'
                      ? 'Nothing needs scheduling. Clear runway.'
                      : `Nothing open in ${QUEUE_LABEL[classFilter] ?? 'this class'}.`}
                  </div>
                ) : (
                  railItems.map(railRow)
                )}
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            {mode !== 'month' && (
              <div className="mb-3 flex flex-col gap-2" data-testid="plan-bar">
                <div className="flex items-start gap-2 rounded-[var(--radius-card)] fb-glass-card pl-3.5 pr-2 py-2">
                  <Icon name="auto_awesome" size={15} className="shrink-0 text-[rgb(var(--accent))]" />
                  {/* DEC-071 — a textarea that grows with what you type. It
                      was a single-line input, so a real intent prompt ("I'm
                      feeling extra creative right now. Good ideas are flowing,
                      so review all of my rooms, desks, and…") scrolled out of
                      sight while being written. You cannot check the sentence
                      you are asking the planner to act on if you can only see
                      the last third of it. Enter still plans; Shift+Enter is a
                      newline. Capped at ~7 lines, then it scrolls — the field
                      must not push the calendar off the screen. */}
                  <textarea
                    ref={intentRef}
                    rows={1}
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void runPlan()
                      }
                    }}
                    placeholder="What's this day about? (optional — leave empty and Plexii picks by priority)"
                    className="flex-1 min-w-0 resize-none bg-transparent outline-none text-[13px] leading-[1.45] py-1 max-h-[152px] text-[var(--ink-90)] placeholder:text-[var(--ink-30)]"
                  />
                  <button
                    onClick={() => void runPlan()}
                    disabled={planBusy}
                    className="h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] disabled:opacity-50 shrink-0"
                  >
                    {planBusy ? 'Planning…' : 'Plan my day'}
                  </button>
                  <button
                    onClick={() => void replanUndone()}
                    disabled={planBusy}
                    title="Sweep blocks that slipped past (they stay on the record as missed) and propose fresh time for their items"
                    className="h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] disabled:opacity-50 shrink-0"
                  >
                    Replan undone
                  </button>
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowSettings((v) => !v)}
                      title="Planner settings — working hours, daily ceiling, session length"
                      className="icon-btn !h-8 !w-8"
                      data-testid="planner-settings"
                    >
                      <Icon name="tune" size={15} />
                    </button>
                    {showSettings && (
                      <div className="absolute right-0 top-10 z-30 w-[292px] rounded-[var(--radius-card)] fb-glass-card p-3.5 flex flex-col gap-2.5">
                        <div className="fb-t-label text-[var(--ink-70)]">Planner settings</div>
                        <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--ink-60)]">
                          Day starts
                          <select
                            value={settings.dayStartMin}
                            onChange={(e) => patchSettings({ dayStartMin: Number(e.target.value) })}
                            className="fb-field bg-[var(--surface-sunken)] px-1.5 py-1 text-[12px]"
                          >
                            {Array.from({ length: 13 }, (_, h) => h + 5).map((h) => (
                              <option key={h} value={h * 60}>
                                {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'AM' : 'PM'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--ink-60)]">
                          Day ends
                          <select
                            value={settings.dayEndMin}
                            onChange={(e) => patchSettings({ dayEndMin: Number(e.target.value) })}
                            className="fb-field bg-[var(--surface-sunken)] px-1.5 py-1 text-[12px]"
                          >
                            {Array.from({ length: 12 }, (_, k) => k + 12).map((h) => (
                              <option key={h} value={h * 60}>
                                {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'AM' : 'PM'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--ink-60)]">
                          Planned work ceiling
                          <select
                            value={settings.maxDailyPlannedMin}
                            onChange={(e) => patchSettings({ maxDailyPlannedMin: Number(e.target.value) })}
                            className="fb-field bg-[var(--surface-sunken)] px-1.5 py-1 text-[12px]"
                          >
                            {[180, 240, 330, 390, 480].map((m) => (
                              <option key={m} value={m}>
                                {(m / 60).toFixed(1).replace('.0', '')} h/day
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--ink-60)]">
                          Longest sitting
                          <select
                            value={settings.maxSessionMin}
                            onChange={(e) => patchSettings({ maxSessionMin: Number(e.target.value) })}
                            className="fb-field bg-[var(--surface-sunken)] px-1.5 py-1 text-[12px]"
                          >
                            {[45, 60, 90, 120].map((m) => (
                              <option key={m} value={m}>
                                {m} min
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--ink-60)]">
                          Breathing room
                          <select
                            value={settings.gapMin}
                            onChange={(e) => patchSettings({ gapMin: Number(e.target.value) })}
                            className="fb-field bg-[var(--surface-sunken)] px-1.5 py-1 text-[12px]"
                          >
                            {[5, 10, 15, 20].map((m) => (
                              <option key={m} value={m}>
                                {m} min between blocks
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="fb-t-caption text-[var(--ink-30)]">
                          The planner reads these next time you plan. Saved on this device.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {(proposals || planNote) && (
                  <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-accent/50 bg-accent/[0.06] px-3.5 py-2 backdrop-blur-sm">
                    <Icon name="draw" size={14} className="shrink-0 text-[rgb(var(--accent))]" />
                    {/* DEC-071 — the bar carries the COUNT; the review carries
                        the content. It used to append a truncated note here,
                        which read as an explanation while being unable to
                        finish a sentence. Clicking it reopens the review. */}
                    {proposals ? (
                      <button
                        onClick={() => setReviewOpen(true)}
                        className="fb-t-label text-[var(--ink-80)] flex-1 min-w-0 text-left hover:text-[var(--ink-100)] fb-press"
                      >
                        {proposals.length} block{proposals.length === 1 ? '' : 's'} proposed ·{' '}
                        {proposals.reduce((n, x) => n + x.durationMin, 0)} min
                        <span className="text-[rgb(var(--accent))] ml-1.5">Review</span>
                      </button>
                    ) : (
                      <span className="fb-t-label text-[var(--ink-80)] flex-1 min-w-0">{planNote}</span>
                    )}
                    {proposals && (
                      <>
                        <span className="fb-t-caption text-[var(--ink-40)] shrink-0 hidden lg:inline">
                          Nothing is booked until you accept
                        </span>
                        <button
                          onClick={() => void acceptPlan()}
                          className="h-7 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)] shrink-0"
                        >
                          Accept all
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setProposals(null)
                        setPlanNote(null)
                      }}
                      className="icon-btn !h-7 !w-7 shrink-0"
                      title="Clear"
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {mode === 'month' ? (
              <div className="rounded-[var(--radius-card)] fb-glass-card p-3">
                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div key={d} className="text-center fb-t-caption font-semibold text-[var(--ink-40)]">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {monthDays.map((d) => {
                    const key = dayMs(d)
                    const inMonth = d.getMonth() === rangeStart.getMonth()
                    const isToday = d.toDateString() === today.toDateString()
                    const due = dueItemsByDay.get(key) ?? []
                    const desks = dueDesksByDay.get(key) ?? []
                    return (
                      <div
                        key={key}
                        onDragOver={(e) => {
                          if (e.dataTransfer.types.includes('text/fb-workitem')) e.preventDefault()
                        }}
                        onDrop={(e) => {
                          // Dropping an item on a month day sets its DUE date —
                          // month is the deadlines lens, not the hour grid.
                          const id = e.dataTransfer.getData('text/fb-workitem')
                          if (!id) return
                          e.preventDefault()
                          const iso = new Date(key + 17 * 3600_000).toISOString()
                          void updateFields(id, { dueAt: iso })
                        }}
                        className={`min-h-[104px] rounded-lg p-2 flex flex-col gap-1 transition-colors ${
                          isToday
                            ? 'fb-glass-row ring-2 ring-[rgba(var(--accent),0.45)]'
                            : 'fb-glass-row'
                        } ${inMonth ? '' : 'opacity-40'}`}
                      >
                        <div
                          className={`fb-t-caption fb-tabular ${
                            isToday ? 'text-accent font-semibold' : 'text-[var(--ink-40)]'
                          }`}
                        >
                          {d.getDate()}
                        </div>
                        {due.slice(0, 3).map((i) => (
                          <button
                            key={i.id}
                            onClick={goAttention}
                            title={i.title}
                            className="relative w-full text-left truncate rounded-[var(--radius-chip)] pl-2.5 pr-1.5 py-1 text-[11px] leading-snug fb-press"
                            style={{
                              backgroundColor: queueTint(QUEUE_COLOR[queueOf(i)] ?? '#64748b', 0.12),
                              color: 'var(--ink-80)'
                            }}
                          >
                            <span
                              aria-hidden
                              className="absolute left-0 top-0.5 bottom-0.5 w-[2px] rounded-full"
                              style={{
                                backgroundColor: queueTint(QUEUE_COLOR[queueOf(i)] ?? '#64748b', 0.65)
                              }}
                            />
                            {i.title}
                          </button>
                        ))}
                        {due.length > 3 && (
                          <button
                            onClick={goAttention}
                            className="fb-t-caption text-[var(--ink-40)] text-left fb-press"
                          >
                            +{due.length - 3} more
                          </button>
                        )}
                        {desks.slice(0, 2).map((n) => (
                          <div
                            key={n.id}
                            title={`Desk due: ${n.title}`}
                            className="flex items-center gap-1 truncate text-[10px] text-[var(--ink-40)]"
                          >
                            <Icon name="desk" size={9} />
                            <span className="truncate">{n.title}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-[var(--radius-card)] fb-glass-card p-3">
              <WeekTimeGrid
                weekStart={rangeStart}
                days={MODE_DAYS[mode]}
                filterQueue={classFilter === 'all' ? undefined : classFilter}
                onBlockDragOut={handleBlockDragOut}
                onBlockDragActive={setBlockDragging}
                ghosts={ghosts}
                onGhostRemove={(itemId) =>
                  setProposals((cur) => {
                    const next = (cur ?? []).filter((p) => p.itemId !== itemId)
                    return next.length ? next : null
                  })
                }
              />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DEC-071 — the plan review. Centre-peek, same shape as the item editor
          (DEC-065): centred, bounded by the viewport, scrolls internally rather
          than running off a laptop screen.

          It exists because a proposal was previously un-inspectable. The
          summary line truncated, and the ghosts on the grid are not real blocks
          — nothing is booked until accept — so there was nothing to click. You
          could see THAT three blocks were proposed and never which items, when
          each landed, or why the planner chose them. Every one of those facts
          already existed on PlannedProposal; none of them were shown. */}
      {reviewOpen && proposals && proposals.length > 0 && (
        <div
          className="fb-scrim fixed inset-0 z-[320] flex items-center justify-center p-6"
          onMouseDown={() => setReviewOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Review the proposed plan"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setReviewOpen(false)
            }}
            className="fb-card w-[min(680px,94vw)] p-4 max-h-full overflow-y-auto"
          >
            <div className="flex items-start gap-2">
              <Icon name="auto_awesome" size={16} className="mt-0.5 text-[rgb(var(--accent))]" />
              <div className="min-w-0 flex-1">
                <div className="fb-t-h3 text-[var(--ink-100)]">The plan Plexii proposes</div>
                <div className="fb-t-caption text-[var(--ink-45)] mt-0.5">
                  {proposals.length} block{proposals.length === 1 ? '' : 's'} ·{' '}
                  {proposals.reduce((n, x) => n + x.durationMin, 0)} min · nothing is booked until
                  you accept
                </div>
              </div>
              <button onClick={() => setReviewOpen(false)} className="icon-btn !h-7 !w-7 shrink-0">
                <Icon name="close" size={14} />
              </button>
            </div>

            {/* What was actually asked for, echoed in full — the prompt is the
                thing the plan has to be judged against, and it is the text that
                used to scroll out of the single-line field. */}
            {planIntent && (
              <div className="mt-3 rounded-[var(--radius-row)] bg-[var(--surface-sunken)] px-3 py-2">
                <div className="fb-t-caption uppercase tracking-wider text-[var(--ink-40)]">
                  You asked for
                </div>
                <div className="fb-t-body text-[var(--ink-70)] mt-1 whitespace-pre-wrap break-words">
                  {planIntent}
                </div>
              </div>
            )}

            {/* The planner's own note, in full rather than truncated into the bar. */}
            {planNote && (
              <div className="mt-3 fb-t-body text-[var(--ink-60)] whitespace-pre-wrap break-words">
                {planNote}
              </div>
            )}

            {/* Grouped by day, because a plan routinely spans several and a flat
                list makes "when" the hardest thing to read off it. */}
            <div className="mt-3 flex flex-col gap-3">
              {Array.from(
                proposals.reduce((m, p) => {
                  const key = new Date(p.startMs).toDateString()
                  const arr = m.get(key) ?? []
                  arr.push(p)
                  m.set(key, arr)
                  return m
                }, new Map<string, PlannedProposal[]>())
              ).map(([day, ps]) => (
                <div key={day}>
                  <div className="fb-t-caption uppercase tracking-wider text-[var(--ink-40)] mb-1">
                    {new Date(ps[0].startMs).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric'
                    })}
                    <span className="ml-2 fb-tabular normal-case tracking-normal text-[var(--ink-30)]">
                      {ps.reduce((n, x) => n + x.durationMin, 0)} min
                    </span>
                  </div>
                  <div className="rounded-[var(--radius-card)] border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
                    {ps
                      .slice()
                      .sort((a, b) => a.startMs - b.startMs)
                      .map((pr) => (
                        <div
                          key={`${pr.itemId}-${pr.startMs}`}
                          className="group flex items-start gap-3 px-3 py-2.5 bg-[var(--surface-raised)]"
                        >
                          <span className="fb-t-caption fb-tabular text-[var(--ink-50)] shrink-0 w-[112px] pt-0.5">
                            {new Date(pr.startMs).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                            {' – '}
                            {new Date(
                              pr.startMs + pr.durationMin * 60_000
                            ).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="fb-t-body text-[var(--ink-90)] break-words">
                              {pr.title}
                            </div>
                            {/* The WHY. It was on the proposal all along and had
                                nowhere to be shown. */}
                            {pr.reason && (
                              <div className="fb-t-caption text-[var(--ink-45)] mt-0.5 break-words">
                                {pr.reason}
                              </div>
                            )}
                          </div>
                          <span className="fb-t-caption fb-tabular text-[var(--ink-40)] shrink-0 pt-0.5">
                            {pr.durationMin}m
                          </span>
                          <button
                            onClick={() => dropProposal(pr.itemId, pr.startMs)}
                            title="Drop this block from the plan"
                            className="icon-btn !h-6 !w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="fb-t-caption text-[var(--ink-40)] flex-1">
                Accepting books {proposals.length} block{proposals.length === 1 ? '' : 's'} — ⌘Z
                undoes the whole plan.
              </span>
              <button
                onClick={() => {
                  setProposals(null)
                  setPlanNote(null)
                  setReviewOpen(false)
                }}
                className="h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)]"
              >
                Discard
              </button>
              <button
                onClick={() => void acceptPlan()}
                className="btn-primary"
                data-testid="plan-review-accept"
              >
                <Icon name="check" size={14} />
                <span>Accept all</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
