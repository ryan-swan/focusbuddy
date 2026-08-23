import { useMemo, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useTimeBlockStore } from '../../stores/timeBlocks'
import { useFocusSessionStore } from '../../stores/focusSession'
import { useViewStore } from '../../stores/view'
import { priorityScore } from '../../lib/dashboardScope'
import { futuristicPowerOn } from '../../lib/audioBeep'
import Icon from '../Icon'
import { DashboardHeader } from '../plexi'
import WeekTimeGrid from './WeekTimeGrid'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Returns 6 weeks × 7 days starting from the Monday on or before the first of the month
function monthGrid(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  // JS getDay: 0=Sun..6=Sat. We want week starting Monday.
  const weekdayMon = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - weekdayMon)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

// Bucket tasks by due date (only those with a dueDate, not done/parked)
function bucketTasksByDay(tasks: FbNode[]): Map<number, FbNode[]> {
  const m = new Map<number, FbNode[]>()
  for (const t of tasks) {
    if (t.dueDate == null) continue
    if (t.status === 'parked') continue
    const key = dayMs(new Date(t.dueDate))
    const list = m.get(key) ?? []
    list.push(t)
    m.set(key, list)
  }
  // Within each day, sort by the three-axis combined score (urgency × importance + due boost)
  for (const list of m.values()) {
    list.sort((a, b) => priorityScore(b) - priorityScore(a))
  }
  return m
}

export default function CalendarView(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const updateNode = useNodeStore((s) => s.update)
  const startSession = useFocusSessionStore((s) => s.start)
  const goTask = useViewStore((s) => s.goTask)
  const blockCount = useTimeBlockStore((s) => s.blocks.length)

  const today = new Date()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [viewMonth, setViewMonth] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  )
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(today))

  const tasks = useMemo(() => nodes.filter((n) => n.kind === 'task'), [nodes])
  const buckets = useMemo(() => bucketTasksByDay(tasks), [tasks])
  const days = useMemo(() => monthGrid(viewMonth), [viewMonth])

  function goPrev(): void {
    if (mode === 'month') {
      setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
    } else {
      const w = new Date(weekStart)
      w.setDate(w.getDate() - 7)
      setWeekStart(w)
    }
  }
  function goNext(): void {
    if (mode === 'month') {
      setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
    } else {
      const w = new Date(weekStart)
      w.setDate(w.getDate() + 7)
      setWeekStart(w)
    }
  }
  function jumpToToday(): void {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setWeekStart(mondayOf(today))
  }

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  function openTask(task: FbNode): void {
    setActive(task.id)
    goTask(task.id)
  }

  function fivePromise(task: FbNode): void {
    futuristicPowerOn()
    void startSession(task.id, 5 * 60, '5min')
    if (task.status === 'open') void updateNode(task.id, { status: 'in_progress' })
    setActive(task.id)
    goTask(task.id)
  }

  // Stats for the visible month
  const monthTasks = days
    .filter((d) => d.getMonth() === viewMonth.getMonth())
    .flatMap((d) => buckets.get(dayMs(d)) ?? [])
  const monthOverdue = monthTasks.filter(
    (t) => t.dueDate != null && t.dueDate < Date.now() && t.status !== 'done'
  ).length

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="h-full overflow-auto bg-[var(--surface-base)] text-[var(--ink-100)]">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-3">
        <DashboardHeader
          title="Calendar"
          subtitle={
            mode === 'month'
              ? 'Tasks placed by due date. Sorted within each day by urgency × importance + due-date boost.'
              : 'Book time to focus. Click a slot to add a block, drag to reschedule, start a session from any block.'
          }
          actions={
            <div className="flex items-center gap-2">
              {/* Month / Week toggle */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] shadow-[0_0_0_1px_var(--edge-hairline)] shrink-0">
                {(['month', 'week'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-2.5 py-1 rounded-[var(--radius-chip)] fb-t-label capitalize fb-press transition-colors ${
                      mode === m
                        ? 'bg-[var(--surface-raised)] text-accent shadow-[var(--shadow-soft)]'
                        : 'text-[var(--ink-50)] hover:text-[var(--ink-80)]'
                    }`}
                    data-testid={`calendar-mode-${m}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={goPrev} className="icon-btn" title="Previous">
                  <Icon name="chevron_left" size={16} />
                </button>
                <button onClick={jumpToToday} className="btn-ghost">
                  Today
                </button>
                <button onClick={goNext} className="icon-btn" title="Next">
                  <Icon name="chevron_right" size={16} />
                </button>
              </div>
            </div>
          }
        />

        {mode === 'week' && (
          <>
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="fb-t-title text-[var(--ink-100)]">
                {weekLabel}
              </h2>
              <span className="fb-t-caption">
                {blockCount} block{blockCount === 1 ? '' : 's'} booked
              </span>
            </div>
            <WeekTimeGrid weekStart={weekStart} />
          </>
        )}

        {mode === 'month' && (
        <>
        <div className="flex items-baseline gap-3 mb-2">
          <h2 className="fb-t-title text-[var(--ink-100)]">
            {monthLabel}
          </h2>
          <span className="fb-t-caption">
            {monthTasks.length} task{monthTasks.length === 1 ? '' : 's'} due
            {monthOverdue > 0 && (
              <span className="ml-2 text-rose-500">
                {monthOverdue} overdue
              </span>
            )}
          </span>
        </div>

        {/* Empty-month hint — the one quiet line that tells a new user what this
            surface is for, instead of a bare grid. Only when there is truly
            nothing: no tasks due this month and no time blocks anywhere. */}
        {monthTasks.length === 0 && blockCount === 0 && (
          <div className="mb-2 flex items-center gap-3">
            <p className="fb-t-body text-[var(--ink-50)]">
              Nothing scheduled yet. Give a task a due date, or block time for focused work.
            </p>
            <button
              onClick={() => setMode('week')}
              className="inline-flex items-center gap-1.5 h-8 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-90)] shrink-0"
            >
              <Icon name="view_week" size={14} /> Plan your week
            </button>
          </div>
        )}

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="fb-t-caption uppercase tracking-wider font-semibold py-1 px-2"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1 fb-fade-in-up">
          {days.map((d) => {
            const inMonth = d.getMonth() === viewMonth.getMonth()
            const isToday = sameDay(d, today)
            const dayTasks = buckets.get(dayMs(d)) ?? []
            return (
              <div
                key={d.getTime()}
                className={`rounded-[var(--radius-row)] border min-h-[100px] flex flex-col p-1.5 ${
                  isToday
                    ? 'border-accent bg-accent/5'
                    : inMonth
                      ? 'border-[var(--edge-soft)] bg-[var(--surface-sunken)]'
                      : 'border-[var(--edge-soft)] bg-transparent opacity-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`fb-t-label font-mono fb-tabular ${
                      isToday
                        ? 'text-accent font-semibold'
                        : inMonth
                          ? 'text-[var(--ink-70)]'
                          : 'text-[var(--ink-30)]'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="fb-t-caption font-mono">
                      {dayTasks.length}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 overflow-hidden flex-1">
                  {dayTasks.slice(0, 4).map((task) => (
                    <CalendarTaskChip
                      key={task.id}
                      task={task}
                      now={today}
                      onOpen={() => openTask(task)}
                      onQuickStart={() => fivePromise(task)}
                    />
                  ))}
                  {dayTasks.length > 4 && (
                    <div className="fb-t-caption px-1">
                      +{dayTasks.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="fb-t-caption text-center pt-2">
          Hover a task → quick-start 5 min. Click → open in canvas. Add due dates from the edit
          dialog (pencil on any sidebar row) to populate this view.
        </p>
        </>
        )}
      </div>
    </div>
  )
}

function CalendarTaskChip({
  task,
  now,
  onOpen,
  onQuickStart
}: {
  task: FbNode
  now: Date
  onOpen: () => void
  onQuickStart: () => void
}): JSX.Element {
  const isOverdue =
    task.dueDate != null && task.dueDate < now.getTime() && task.status !== 'done'
  const isDone = task.status === 'done'
  const isInProgress = task.status === 'in_progress'

  let bg = 'bg-[var(--surface-base)] shadow-[0_0_0_1px_var(--edge-hairline)] text-[var(--ink-70)]'
  if (isDone) bg = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 line-through'
  else if (isOverdue) bg = 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
  else if (isInProgress) bg = 'bg-sky-500/15 text-sky-600 dark:text-sky-400'

  return (
    <div
      className={`rounded-[var(--radius-chip)] px-1.5 py-0.5 fb-t-caption truncate group/chip cursor-pointer fb-press flex items-center gap-1 ${bg}`}
      onClick={onOpen}
      title={`${task.title}${task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString()}` : ''}`}
    >
      <span className="truncate flex-1">{task.title}</span>
      {!isDone && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuickStart()
          }}
          className="opacity-0 group-hover/chip:opacity-100 group-focus-within/chip:opacity-100 h-3.5 w-3.5 inline-flex items-center justify-center rounded-[var(--radius-chip)] bg-accent !text-white fb-press shrink-0"
          title="Just 5 min on this task"
        >
          <Icon name="bolt" size={9} />
        </button>
      )}
    </div>
  )
}
