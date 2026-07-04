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

// "Start the highest-priority task with Just 5 min" — the ADHD-friendly default.
// The hardest part of any session is picking which thing to start; this picks for you.
export default function QuickStartCard({ taskIds, nodes }: Props): JSX.Element | null {
  const updateNode = useNodeStore((s) => s.update)
  const startSession = useFocusSessionStore((s) => s.start)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)

  const candidates = nodes.filter(
    (n) =>
      n.kind === 'task' &&
      taskIds.has(n.id) &&
      n.status !== 'done' &&
      n.status !== 'parked'
  )
  if (candidates.length === 0) return null

  const top = [...candidates].sort((a, b) => priorityScore(b) - priorityScore(a))[0]

  function fire(): void {
    futuristicPowerOn()
    void startSession(top.id, 5 * 60, '5min')
    if (top.status === 'open') {
      void updateNode(top.id, { status: 'in_progress' })
    }
    setActive(top.id)
    goTask(top.id)
  }

  // Reason chips — explain why this task surfaced
  const reasons: string[] = []
  if (top.status === 'in_progress') reasons.push('in progress')
  if (top.dueDate != null) {
    const daysLeft = Math.ceil((top.dueDate - Date.now()) / 86_400_000)
    if (daysLeft < 0) reasons.push(`${-daysLeft}d overdue`)
    else if (daysLeft === 0) reasons.push('due today')
    else if (daysLeft <= 2) reasons.push(`due ${daysLeft}d`)
  }
  if (top.priority >= 4) reasons.push(`urgent ${top.priority}/5`)
  if (top.importance >= 4) reasons.push(`important ${top.importance}/5`)

  return (
    <div
      className="rounded-xl border-2 p-4 flex items-center gap-3"
      style={{
        borderColor: 'rgb(var(--accent) / 0.4)',
        background: 'linear-gradient(135deg, rgb(var(--accent) / 0.06), transparent)'
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-1">
          Start with
        </div>
        <div className="text-sm font-semibold text-[var(--ink-100)] truncate">
          {top.title}
        </div>
        {reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {reasons.map((r) => (
              <span
                key={r}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--ink-70)]"
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={fire}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-medium transition-all hover:brightness-110"
        style={{ backgroundColor: 'rgb(var(--accent))' }}
        title="The 5-Minute Promise — start a focus session on this task"
      >
        <Icon name="bolt" size={14} />
        <span>Just 5 min</span>
      </button>
    </div>
  )
}
