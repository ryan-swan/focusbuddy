import { useMemo, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useFocusSessionStore } from '../../stores/focusSession'
import { useViewStore } from '../../stores/view'
import { futuristicPowerOn, taskComplete } from '../../lib/audioBeep'
import { priorityScore, projectPath } from '../../lib/dashboardScope'
import { energyAffinity, energyFitForTask, useEnergyStore } from '../../stores/energy'
import Icon from '../Icon'

type Filter = 'today' | 'overdue' | 'upcoming' | 'open' | 'done'
type Sort = 'smart' | 'energy' | 'due' | 'updated' | 'alpha'

const FILTERS: Array<{ value: Filter; label: string; icon: string }> = [
  { value: 'today', label: 'Today', icon: 'today' },
  { value: 'overdue', label: 'Overdue', icon: 'alarm' },
  { value: 'upcoming', label: 'Upcoming', icon: 'event' },
  { value: 'open', label: 'All open', icon: 'checklist' },
  { value: 'done', label: 'Done', icon: 'check_circle' }
]

// 'energy' kept as a Sort enum value for backward-compat with any persisted state,
// but no longer offered in the dropdown — two-axis model dropped Energy/Interest.
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'smart', label: 'Smart' },
  { value: 'due', label: 'Due date' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'alpha', label: 'Alphabetical' }
]

const MS_PER_DAY = 86_400_000
const ONE_WEEK = 7 * MS_PER_DAY

function endOfTodayMs(): number {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function isOverdue(n: FbNode, now: number): boolean {
  return n.dueDate != null && n.dueDate < now && n.status !== 'done'
}

function isToday(n: FbNode): boolean {
  if (n.dueDate == null) return false
  const dueDay = new Date(n.dueDate)
  const today = new Date()
  return (
    dueDay.getFullYear() === today.getFullYear() &&
    dueDay.getMonth() === today.getMonth() &&
    dueDay.getDate() === today.getDate()
  )
}

function matchesFilter(n: FbNode, filter: Filter, now: number): boolean {
  if (filter === 'done') return n.status === 'done'
  if (n.status === 'done' || n.status === 'parked') return false
  switch (filter) {
    case 'today':
      return n.status === 'in_progress' || isOverdue(n, now) || isToday(n)
    case 'overdue':
      return isOverdue(n, now)
    case 'upcoming':
      return (
        n.dueDate != null &&
        n.dueDate > endOfTodayMs() &&
        n.dueDate <= now + ONE_WEEK
      )
    case 'open':
      return true
    default:
      return true
  }
}

function sortTasks(
  tasks: FbNode[],
  sort: Sort,
  now: number,
  currentEnergy: 'low' | 'medium' | 'high' | null
): FbNode[] {
  const arr = [...tasks]
  switch (sort) {
    case 'smart':
      arr.sort((a, b) => {
        const aOver = isOverdue(a, now)
        const bOver = isOverdue(b, now)
        if (aOver !== bOver) return aOver ? -1 : 1
        const aDue = a.dueDate ?? Number.POSITIVE_INFINITY
        const bDue = b.dueDate ?? Number.POSITIVE_INFINITY
        if (aDue !== bDue) return aDue - bDue
        return priorityScore(b) - priorityScore(a)
      })
      break
    case 'energy':
      // No current energy = fall back to smart. Otherwise rank by affinity, then priority.
      if (!currentEnergy) {
        return sortTasks(tasks, 'smart', now, null)
      }
      arr.sort((a, b) => {
        const aFit = energyAffinity(currentEnergy, energyFitForTask(a))
        const bFit = energyAffinity(currentEnergy, energyFitForTask(b))
        if (aFit !== bFit) return bFit - aFit // higher affinity first
        // Within same affinity bucket, overdue wins, then due date, then priority
        const aOver = isOverdue(a, now)
        const bOver = isOverdue(b, now)
        if (aOver !== bOver) return aOver ? -1 : 1
        const aDue = a.dueDate ?? Number.POSITIVE_INFINITY
        const bDue = b.dueDate ?? Number.POSITIVE_INFINITY
        if (aDue !== bDue) return aDue - bDue
        return priorityScore(b) - priorityScore(a)
      })
      break
    case 'due':
      arr.sort((a, b) => {
        const aDue = a.dueDate ?? Number.POSITIVE_INFINITY
        const bDue = b.dueDate ?? Number.POSITIVE_INFINITY
        return aDue - bDue
      })
      break
    case 'updated':
      arr.sort((a, b) => b.updatedAt - a.updatedAt)
      break
    case 'alpha':
      arr.sort((a, b) => a.title.localeCompare(b.title))
      break
  }
  return arr
}

export default function AllTasksView(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const updateNode = useNodeStore((s) => s.update)
  const setActive = useNodeStore((s) => s.setActive)
  const startSession = useFocusSessionStore((s) => s.start)
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const currentEnergy = useEnergyStore((s) => s.current)
  const [filter, setFilter] = useState<Filter>('today')
  const [sort, setSort] = useState<Sort>('smart')
  const [search, setSearch] = useState('')

  const now = Date.now()
  const allTasks = useMemo(() => nodes.filter((n) => n.kind === 'task'), [nodes])

  // Pre-compute counts for filter chips
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      today: 0,
      overdue: 0,
      upcoming: 0,
      open: 0,
      done: 0
    }
    for (const t of allTasks) {
      if (matchesFilter(t, 'today', now)) c.today += 1
      if (matchesFilter(t, 'overdue', now)) c.overdue += 1
      if (matchesFilter(t, 'upcoming', now)) c.upcoming += 1
      if (matchesFilter(t, 'open', now)) c.open += 1
      if (matchesFilter(t, 'done', now)) c.done += 1
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = allTasks.filter((t) => {
      if (!matchesFilter(t, filter, now)) return false
      if (q) {
        const hay = `${t.title} ${t.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return sortTasks(filtered, sort, now, currentEnergy?.level ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, filter, sort, search, currentEnergy?.level])

  function openTask(task: FbNode): void {
    setActive(task.id)
    goTask(task.id)
  }

  function quickStart(task: FbNode): void {
    futuristicPowerOn()
    void startSession(task.id, 5 * 60, '5min')
    if (task.status === 'open') {
      void updateNode(task.id, { status: 'in_progress' })
    }
    setActive(task.id)
    goTask(task.id)
  }

  function markDone(task: FbNode): void {
    void updateNode(task.id, { status: 'done' })
    // taskComplete chime is fired by the node store's update method on the transition,
    // but call it here too in case the chime path misses; harmless duplicate.
    taskComplete()
  }

  return (
    <div className="h-full overflow-auto desk-paper no-tod">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
        {/* Header */}
        <div className="flex items-baseline gap-3 mb-1">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 shadow-sm">
            <Icon name="checklist" size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
              All Tasks
            </h1>
            <p className="text-[12px] text-stone-500 dark:text-stone-400">
              Every task across every project, flat.
            </p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.value
            const count = counts[f.value]
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
                  active
                    ? 'bg-accent/15 text-accent border border-accent/40'
                    : 'bg-white/80 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500'
                }`}
              >
                <Icon name={f.icon} size={12} filled={active} />
                <span>{f.label}</span>
                <span
                  className={`text-[10px] font-mono px-1 rounded ${
                    active
                      ? 'bg-accent/20 text-accent'
                      : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Icon
              name="search"
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 rounded-md pl-7 pr-3 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 rounded-md px-2 py-1.5 text-xs text-stone-700 dark:text-stone-300 focus:outline-none focus:border-stone-700 dark:focus:border-stone-400"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 backdrop-blur overflow-hidden">
          {visible.length === 0 ? (
            <EmptyState filter={filter} hasSearch={search.trim().length > 0} />
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {visible.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  nodes={nodes}
                  onOpen={() => openTask(task)}
                  onQuickStart={() => quickStart(task)}
                  onMarkDone={() => markDone(task)}
                  onOpenProject={(id) => goProject(id)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="text-[11px] text-stone-500 dark:text-stone-500 text-center">
          {visible.length} of {counts.open + counts.done} task{visible.length === 1 ? '' : 's'}{' '}
          shown
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  filter,
  hasSearch
}: {
  filter: Filter
  hasSearch: boolean
}): JSX.Element {
  const msg = hasSearch
    ? "Nothing matches your search."
    : filter === 'today'
      ? "Nothing due today, nothing overdue, nothing in progress. You're caught up."
      : filter === 'overdue'
        ? 'Nothing overdue — sweet.'
        : filter === 'upcoming'
          ? 'Nothing in the next 7 days.'
          : filter === 'done'
            ? "Nothing completed yet — when you finish tasks they show up here."
            : 'No open tasks. Add one from the sidebar.'
  return (
    <div className="py-10 text-center">
      <div className="text-3xl mb-2">🌤️</div>
      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed px-6">{msg}</p>
    </div>
  )
}

interface RowProps {
  task: FbNode
  nodes: FbNode[]
  onOpen: () => void
  onQuickStart: () => void
  onMarkDone: () => void
  onOpenProject: (id: string) => void
}

function TaskRow({
  task,
  nodes,
  onOpen,
  onQuickStart,
  onMarkDone,
  onOpenProject
}: RowProps): JSX.Element {
  const now = Date.now()
  let dueLabel: string | null = null
  let dueClass = 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
  if (task.dueDate != null) {
    const daysLeft = Math.ceil((task.dueDate - now) / MS_PER_DAY)
    if (daysLeft < 0) {
      dueLabel = `${-daysLeft}d late`
      dueClass = 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400'
    } else if (daysLeft === 0) {
      dueLabel = 'today'
      dueClass = 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
    } else if (daysLeft === 1) {
      dueLabel = 'tomorrow'
      dueClass = 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
    } else if (daysLeft <= 7) {
      dueLabel = `${daysLeft}d`
    } else {
      dueLabel = new Date(task.dueDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
    }
  }

  const path = projectPath(nodes, task.id)
  const parentNode = task.parentId ? nodes.find((n) => n.id === task.parentId) : null
  const isDone = task.status === 'done'

  return (
    <li className="px-4 py-2 flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800/50 group transition-colors">
      <button
        onClick={onMarkDone}
        disabled={isDone}
        title={isDone ? 'Already done' : 'Mark done'}
        className={`shrink-0 h-5 w-5 inline-flex items-center justify-center rounded-full border transition-colors ${
          isDone
            ? 'border-emerald-500 bg-emerald-500 text-white cursor-default'
            : task.status === 'in_progress'
              ? 'border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40'
              : 'border-stone-300 dark:border-stone-600 text-transparent hover:text-stone-700 dark:hover:text-stone-300 hover:border-stone-500 dark:hover:border-stone-400'
        }`}
      >
        <Icon
          name={isDone ? 'check' : task.status === 'in_progress' ? 'play_arrow' : 'check'}
          size={11}
          filled={isDone}
        />
      </button>
      <div className="flex-1 min-w-0">
        <button
          onClick={onOpen}
          className={`text-sm text-left truncate w-full ${
            isDone
              ? 'line-through text-stone-400 dark:text-stone-500'
              : 'text-stone-900 dark:text-stone-100 hover:text-accent'
          }`}
        >
          {task.title}
        </button>
        {path.length > 0 && (
          <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate flex items-center gap-0.5 mt-0.5">
            {path.map((segment, i) => (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && <Icon name="chevron_right" size={10} />}
                <button
                  onClick={() => {
                    // Last segment = immediate parent (always); open that project's dashboard
                    if (i === path.length - 1 && parentNode) onOpenProject(parentNode.id)
                  }}
                  className={i === path.length - 1 ? 'hover:text-stone-700 dark:hover:text-stone-300' : ''}
                >
                  {segment}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      {dueLabel && (
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${dueClass}`}
          title={task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : ''}
        >
          {dueLabel}
        </span>
      )}
      <AxisDots task={task} />
      {!isDone && (
        <button
          onClick={onQuickStart}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-white transition-all shrink-0"
          style={{ backgroundColor: 'rgb(var(--accent))' }}
          title="Start a 5-minute focus session on this task"
        >
          <Icon name="bolt" size={11} />
          <span>5 min</span>
        </button>
      )}
    </li>
  )
}

function AxisDots({ task }: { task: FbNode }): JSX.Element {
  const dots = (val: number): JSX.Element => (
    <div className="flex gap-[1px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1 h-1 rounded-full ${
            i <= val ? 'bg-stone-700 dark:bg-stone-300' : 'bg-stone-200 dark:bg-stone-700'
          }`}
        />
      ))}
    </div>
  )
  return (
    <div
      className="hidden md:flex items-center gap-2 shrink-0 text-stone-400 dark:text-stone-500"
      title={`Urgency ${task.priority} · Importance ${task.importance}`}
    >
      <div className="flex items-center gap-0.5">
        <Icon name="priority_high" size={10} />
        {dots(task.priority)}
      </div>
      <div className="flex items-center gap-0.5">
        <Icon name="flag" size={10} />
        {dots(task.importance)}
      </div>
    </div>
  )
}
