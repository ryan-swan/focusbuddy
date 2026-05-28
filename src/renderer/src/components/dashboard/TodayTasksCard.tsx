import type { FbNode } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useFocusSessionStore } from '../../stores/focusSession'
import { useViewStore } from '../../stores/view'
import { futuristicPowerOn } from '../../lib/audioBeep'
import { priorityScore } from '../../lib/dashboardScope'
import Icon from '../Icon'

interface Props {
  taskIds: Set<string>
  nodes: FbNode[]
}

const MAX_ROWS = 10

// "Today and overdue" — every open/in-progress task in scope, sorted by overdue → today
// → upcoming → priority score. Each row shows an inline "Just 5 min" trigger so the
// dashboard is itself a launch surface, not just a reporting view.
export default function TodayTasksCard({ taskIds, nodes }: Props): JSX.Element {
  const updateNode = useNodeStore((s) => s.update)
  const startSession = useFocusSessionStore((s) => s.start)
  const goTask = useViewStore((s) => s.goTask)
  const setActive = useNodeStore((s) => s.setActive)

  const now = Date.now()
  const candidates = nodes.filter(
    (n) =>
      n.kind === 'task' &&
      taskIds.has(n.id) &&
      n.status !== 'done' &&
      n.status !== 'parked'
  )

  // Rank: overdue first, then due-today, then upcoming, then no-due-date by priority score
  const ranked = [...candidates].sort((a, b) => {
    const aOverdue = a.dueDate != null && a.dueDate < now
    const bOverdue = b.dueDate != null && b.dueDate < now
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    const aDue = a.dueDate ?? Number.POSITIVE_INFINITY
    const bDue = b.dueDate ?? Number.POSITIVE_INFINITY
    if (aDue !== bDue) return aDue - bDue
    return priorityScore(b) - priorityScore(a)
  })

  const rows = ranked.slice(0, MAX_ROWS)
  const overflow = ranked.length - rows.length

  function quickStart(task: FbNode): void {
    futuristicPowerOn()
    void startSession(task.id, 5 * 60, '5min')
    if (task.status === 'open') {
      void updateNode(task.id, { status: 'in_progress' })
    }
    // Take user TO the task so they can see the session ring + canvas
    setActive(task.id)
    goTask(task.id)
  }

  function openTask(task: FbNode): void {
    setActive(task.id)
    goTask(task.id)
  }

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 backdrop-blur">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold">
          <Icon name="checklist" size={12} />
          <span>Open tasks</span>
        </div>
        <span className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">
          {candidates.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 pb-4 text-center">
          <div className="text-2xl mb-1">🌤️</div>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            Nothing open in this scope. Either everything's done — or it's time to add the next thing.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          {rows.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onQuickStart={() => quickStart(task)}
              onOpen={() => openTask(task)}
            />
          ))}
          {overflow > 0 && (
            <div className="px-4 py-2 text-[11px] text-stone-500 dark:text-stone-400 text-center">
              + {overflow} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  onQuickStart,
  onOpen
}: {
  task: FbNode
  onQuickStart: () => void
  onOpen: () => void
}): JSX.Element {
  const now = Date.now()
  let dueLabel: string | null = null
  let dueClass = 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
  if (task.dueDate != null) {
    const daysLeft = Math.ceil((task.dueDate - now) / 86_400_000)
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
      dueLabel = `${daysLeft}d`
    }
  }

  return (
    <div className="px-4 py-2 flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800/50 group transition-colors">
      <Icon
        name={task.status === 'in_progress' ? 'play_arrow' : 'task_alt'}
        size={14}
        filled={task.status === 'in_progress'}
        className={
          task.status === 'in_progress'
            ? 'text-blue-700 dark:text-blue-400'
            : 'text-stone-400 dark:text-stone-500'
        }
      />
      <button
        onClick={onOpen}
        className="flex-1 text-left text-sm text-stone-900 dark:text-stone-100 truncate hover:text-accent transition-colors min-w-0"
      >
        {task.title}
      </button>
      {dueLabel && (
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${dueClass}`}
          title={task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : ''}
        >
          {dueLabel}
        </span>
      )}
      <button
        onClick={onQuickStart}
        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-white transition-all"
        style={{ backgroundColor: 'rgb(var(--accent))' }}
        title="Start a 5-minute focus session on this task"
      >
        <Icon name="bolt" size={11} />
        <span>5 min</span>
      </button>
    </div>
  )
}
