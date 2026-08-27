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
import {
  QUEUE_COLOR,
  queueOf,
  queueTint,
  rankScore,
  isTerminalState
} from '../../lib/attentionQueues'

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
  const [query, setQuery] = useState('')

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
          !(i.snoozeUntil != null && i.snoozeUntil > nowMs)
      ),
    [items, nowMs]
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
    const q = query.trim().toLowerCase()
    const list = q ? active.filter((i) => (i.title || '').toLowerCase().includes(q)) : active
    return [...list].sort((a, b) => {
      const as = scheduledIds.has(a.id) ? 1 : 0
      const bs = scheduledIds.has(b.id) ? 1 : 0
      if (as !== bs) return as - bs
      return rankScore(b, nowMs) - rankScore(a, nowMs)
    })
  }, [active, query, scheduledIds, nowMs])

  // ── DEC-052 B3/B4 — the planner: preview-first, always ──────────────────
  const [intent, setIntent] = useState('')
  const [proposals, setProposals] = useState<PlannedProposal[] | null>(null)
  const [planNote, setPlanNote] = useState<string | null>(null)
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
        out = planDay(items, blocks, settings, planDayMs, nowMs, { ...opts, onlyItemIds: sel.ids })
        setPlanNote(sel.note)
      } else {
        out = planDay(items, blocks, settings, planDayMs, nowMs, opts)
      }
      setProposals(out.length ? out : null)
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
        deskTitles
      })
      setProposals(out.length ? out : null)
      setPlanNote(
        out.length
          ? `${missed.length} block${missed.length === 1 ? '' : 's'} slipped — marked missed (the record stays), fresh time proposed below.`
          : `${missed.length} slipped block${missed.length === 1 ? '' : 's'} marked missed — no room left today to re-propose.`
      )
    } finally {
      setPlanBusy(false)
    }
  }

  async function acceptPlan(): Promise<void> {
    if (!proposals) return
    // One gesture, one undo: the whole accepted plan reverses with a single
    // ⌘Z (the batch seam the AI "Apply all" uses).
    useActionHistory.getState().beginBatch()
    try {
      for (const p of proposals) {
        await createBlock({
          taskId: p.itemId,
          title: '',
          startMs: p.startMs,
          durationMin: p.durationMin,
          origin: 'auto'
        })
      }
    } finally {
      useActionHistory.getState().endBatch(`Planned ${proposals.length} blocks`)
    }
    setProposals(null)
    setPlanNote(null)
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
        className={`group relative flex items-center gap-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] pl-3 pr-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-[var(--edge-firm)] transition-colors ${
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
    <div className="h-full overflow-y-auto bg-[var(--surface-base)] text-[var(--ink-100)]">
      <div className="max-w-[1500px] mx-auto px-6 xl:px-10 py-8">
        <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="fb-t-title text-[var(--ink-90)]">Calendar</h1>
            <p className="fb-t-body text-[var(--ink-50)] mt-1">
              Your attention, on the clock. Drag work from the queue into your day — deadlines ride
              above the grid, blocks live in it.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-lg bg-[var(--surface-sunken)] p-0.5">
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
                  className={`px-2.5 h-7 fb-t-label fb-press rounded-[var(--radius-field)] ${
                    mode === m
                      ? 'bg-[var(--surface-raised)] text-[var(--ink-100)] shadow-sm'
                      : 'text-[var(--ink-50)] hover:text-[var(--ink-100)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => shift(-1)} className="icon-btn" title="Earlier">
              <Icon name="chevron_left" size={16} />
            </button>
            <button
              onClick={() => setAnchor(dayStart(new Date()))}
              className="h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)]"
            >
              Today
            </button>
            <button onClick={() => shift(1)} className="icon-btn" title="Later">
              <Icon name="chevron_right" size={16} />
            </button>
            <span className="fb-t-label text-[var(--ink-70)] fb-tabular min-w-[130px] text-right">
              {rangeLabel}
            </span>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)] items-start">
          {/* The queue rail — the half you drag FROM. */}
          <aside className="hidden xl:flex flex-col gap-2 sticky top-0">
            <div className="flex items-center gap-2">
              <Icon name="notifications" size={14} className="text-[var(--ink-40)]" />
              <span className="fb-t-label text-[var(--ink-70)] flex-1">To schedule</span>
              <button
                onClick={goAttention}
                className="fb-t-caption text-[var(--ink-40)] hover:text-[var(--ink-80)] fb-press"
              >
                Open Attention
              </button>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter items…"
              className="fb-field w-full bg-[var(--surface-sunken)] px-3 py-1.5 text-[12px]"
            />
            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-220px)] pr-0.5">
              {railItems.length === 0 ? (
                <div className="text-[11px] text-[var(--ink-30)] py-4 text-center">
                  {query ? 'Nothing matches.' : 'Nothing needs scheduling. Clear runway.'}
                </div>
              ) : (
                railItems.map(railRow)
              )}
            </div>
          </aside>

          <div className="min-w-0">
            {mode !== 'month' && (
              <div className="mb-3 flex flex-col gap-2" data-testid="plan-bar">
                <div className="flex items-center gap-2 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] pl-3 pr-2 py-2">
                  <Icon name="auto_awesome" size={15} className="shrink-0 text-[rgb(var(--accent))]" />
                  <input
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void runPlan()
                    }}
                    placeholder="What's this day about? (optional — leave empty and Plexii picks by priority)"
                    className="flex-1 bg-transparent outline-none text-[13px] text-[var(--ink-90)] placeholder:text-[var(--ink-30)]"
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
                </div>
                {(proposals || planNote) && (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-accent/50 bg-accent/[0.05] px-3 py-2">
                    <Icon name="draw" size={14} className="shrink-0 text-[rgb(var(--accent))]" />
                    <span className="fb-t-label text-[var(--ink-80)] flex-1 min-w-0 truncate">
                      {proposals
                        ? `${proposals.length} block${proposals.length === 1 ? '' : 's'} proposed · ${proposals.reduce((n, x) => n + x.durationMin, 0)} min${planNote ? ` — ${planNote}` : ''}`
                        : planNote}
                    </span>
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
              <div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div key={d} className="text-center fb-t-caption font-semibold text-[var(--ink-40)]">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
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
                        className={`min-h-[92px] rounded-lg border p-1.5 flex flex-col gap-1 ${
                          isToday
                            ? 'border-accent/40 bg-accent/[0.04]'
                            : 'border-[var(--edge-soft)] bg-[var(--surface-raised)]'
                        } ${inMonth ? '' : 'opacity-45'}`}
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
                            className="relative w-full text-left truncate rounded-[var(--radius-chip)] pl-2 pr-1 py-0.5 text-[10.5px] fb-press"
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
              <WeekTimeGrid
                weekStart={rangeStart}
                days={MODE_DAYS[mode]}
                ghosts={ghosts}
                onGhostRemove={(itemId) =>
                  setProposals((cur) => {
                    const next = (cur ?? []).filter((p) => p.itemId !== itemId)
                    return next.length ? next : null
                  })
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
