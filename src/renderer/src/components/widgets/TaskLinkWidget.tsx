import type { Widget } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useFocusSessionStore } from '../../stores/focusSession'
import { useViewStore } from '../../stores/view'
import { futuristicPowerOn } from '../../lib/audioBeep'
import { projectPath } from '../../lib/dashboardScope'
import WidgetFrame from './WidgetFrame'
import Icon from '../Icon'

interface Props {
  widget: Widget
  inline?: boolean
}

// A reference to another task — created by dragging a task from the sidebar onto a canvas.
// Stores the referenced task id in `widget.content`. Renders the task's title, project path,
// status icon, due chip, and a one-click "Just 5 min" / "Open" pair.
export default function TaskLinkWidget({ widget, inline = false }: Props): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const updateNode = useNodeStore((s) => s.update)
  const startSession = useFocusSessionStore((s) => s.start)
  const goTask = useViewStore((s) => s.goTask)

  const targetId = widget.content.trim()
  const task = targetId ? nodes.find((n) => n.id === targetId && n.kind === 'task') ?? null : null

  function openTarget(): void {
    if (!task) return
    setActive(task.id)
    goTask(task.id)
  }

  function fivePromise(): void {
    if (!task) return
    futuristicPowerOn()
    void startSession(task.id, 5 * 60, '5min')
    if (task.status === 'open') void updateNode(task.id, { status: 'in_progress' })
    setActive(task.id)
    goTask(task.id)
  }

  const path = task ? projectPath(nodes, task.id) : []

  const body = (
    <div className="min-h-full w-full flex flex-col bg-white dark:bg-stone-900 p-3 gap-1.5">
      {task ? (
        <>
          <div className="flex items-center gap-2">
            <Icon
              name={task.status === 'in_progress' ? 'play_arrow' : 'task_alt'}
              size={14}
              filled={task.status === 'in_progress'}
              className={
                task.status === 'done'
                  ? 'text-emerald-700'
                  : task.status === 'in_progress'
                    ? 'text-blue-700 dark:text-blue-400'
                    : 'text-stone-500 dark:text-stone-400'
              }
            />
            <button
              onClick={openTarget}
              className={`text-sm font-medium text-left truncate flex-1 ${
                task.status === 'done'
                  ? 'line-through text-stone-400 dark:text-stone-500'
                  : 'text-stone-900 dark:text-stone-100 hover:text-accent'
              }`}
              title="Open this task"
            >
              {task.title}
            </button>
          </div>
          {path.length > 0 && (
            <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate flex items-center gap-0.5">
              {path.map((segment, i) => (
                <span key={i} className="flex items-center gap-0.5">
                  {i > 0 && <Icon name="chevron_right" size={9} />}
                  <span>{segment}</span>
                </span>
              ))}
            </div>
          )}
          {task.dueDate != null && (() => {
            const daysLeft = Math.ceil((task.dueDate - Date.now()) / 86_400_000)
            const overdue = daysLeft < 0
            const cls = overdue
              ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400'
              : daysLeft <= 1
                ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
            const label =
              daysLeft === 0
                ? 'due today'
                : daysLeft === 1
                  ? 'due tomorrow'
                  : overdue
                    ? `${-daysLeft}d late`
                    : `due in ${daysLeft}d`
            return (
              <span
                className={`self-start text-[10px] font-mono px-1.5 py-0.5 rounded ${cls}`}
              >
                {label}
              </span>
            )
          })()}
          <div className="flex items-center gap-1.5 mt-auto pt-1">
            <button
              onClick={fivePromise}
              disabled={task.status === 'done'}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: 'rgb(var(--accent))' }}
              title="Start a 5-minute focus session on this task"
            >
              <Icon name="bolt" size={11} />
              <span>5 min</span>
            </button>
            <button
              onClick={openTarget}
              className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              title="Open this task"
            >
              <Icon name="arrow_forward" size={11} />
              <span>Open</span>
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center gap-1">
          <Icon name="link_off" size={20} className="text-stone-400 dark:text-stone-500" />
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Referenced task was deleted or moved.
          </p>
        </div>
      )}
    </div>
  )

  if (inline) return body
  return (
    <WidgetFrame widget={widget} headerLabel="task link" headerAccent="bg-stone-200/70">
      {body}
    </WidgetFrame>
  )
}
