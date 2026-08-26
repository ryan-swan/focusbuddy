import { useEffect } from 'react'
import Icon from '../../Icon'
import { useNodeStore } from '../../../stores/nodes'
import { useViewStore } from '../../../stores/view'

// Assistant → Tasks tab (spec §5.3). A condensed list of open / in-progress task
// desks from the real nodes store (same source as All Tasks), each row opening its
// desk. No invented tasks; an empty workspace says so honestly.

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-[var(--surface-sunken)] text-[var(--ink-60)]' },
  in_progress: { label: 'In progress', cls: 'bg-sky-500/15 text-sky-500' },
  blocked: { label: 'Blocked', cls: 'bg-rose-500/15 text-rose-500' }
}

export default function AssistantTasksTab(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const refresh = useNodeStore((s) => s.refresh)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tasks = nodes
    .filter((n) => n.kind === 'task' && !n.archived && n.status !== 'done')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40)

  const now = Date.now()

  return (
    <div className="h-full overflow-y-auto px-3 py-3" data-testid="assistant-tab-tasks-body">
      {tasks.length === 0 ? (
        <div className="py-10 text-center text-[12.5px] text-[var(--ink-50)]">
          No open desks yet. New desks show up here.
        </div>
      ) : (
        <ul className="space-y-1">
          {tasks.map((n) => {
            const pill = STATUS_PILL[n.status ?? 'open'] ?? STATUS_PILL.open
            const overdue = n.dueDate != null && n.dueDate < now
            return (
              <li key={n.id}>
                <button
                  onClick={() => {
                    setActive(n.id)
                    goTask(n.id)
                  }}
                  data-testid={`assistant-task-${n.id}`}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--surface-sunken)]"
                >
                  <Icon name="desk" size={15} className="text-[var(--ink-40)] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[var(--ink-100)]">
                      {n.title || 'Untitled desk'}
                    </span>
                    {n.dueDate != null && (
                      <span className={`block text-[11px] ${overdue ? 'text-rose-500' : 'text-[var(--ink-50)]'}`}>
                        {overdue ? 'Overdue' : 'Due'} {new Date(n.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 text-[10.5px] px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
