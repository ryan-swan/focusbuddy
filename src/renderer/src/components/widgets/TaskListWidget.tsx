import { useState, useMemo } from 'react'
import type { NodePatch, Widget } from '@shared/types'
import type { TaskItemCategory } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import WidgetFrame from './WidgetFrame'
import Icon from '../Icon'
import TaskDetailPanel from '../TaskDetailPanel'

interface Props {
  widget: Widget
}

const CATEGORY_COLORS: Record<TaskItemCategory, string> = {
  action: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  review: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  deliverable: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  decision: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  wait: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  research: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  misc: 'bg-[var(--surface-sunken)] text-[var(--ink-60)]'
}

type Scope = 'desk' | 'room'

export default function TaskListWidget({ widget }: Props): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const createNode = useNodeStore((s) => s.create)
  const updateNode = useNodeStore((s) => s.update)
  const removeNode = useNodeStore((s) => s.remove)

  const [newText, setNewText] = useState('')
  const [scope, setScope] = useState<Scope>('desk')

  // The desk this widget lives on — use its task id as the parent for new items
  const deskId = widget.taskId

  // Find the room (top-level folder ancestor) of the current desk
  const roomId = useMemo(() => {
    let cur = nodes.find((n) => n.id === deskId)
    while (cur && cur.parentId !== null) {
      cur = nodes.find((n) => n.id === cur!.parentId)
    }
    return cur?.id ?? null
  }, [nodes, deskId])

  // Collect all desk ids that belong to this room (for room-scope filtering)
  const roomDeskIds = useMemo(() => {
    if (!roomId) return new Set<string>([deskId])
    // BFS / collect task-kind nodes whose ancestor chain includes roomId
    const result = new Set<string>()
    const visit = (id: string): void => {
      const children = nodes.filter((n) => n.parentId === id)
      for (const child of children) {
        if (child.kind === 'task') result.add(child.id)
        visit(child.id)
      }
    }
    visit(roomId)
    return result
  }, [nodes, roomId, deskId])

  const taskItems = useMemo(() => {
    return nodes.filter((n) => {
      if (n.kind !== 'task-item') return false
      if (scope === 'desk') return n.parentId === deskId
      // room scope: any task-item whose parent is a desk in this room
      return n.parentId !== null && roomDeskIds.has(n.parentId)
    })
  }, [nodes, scope, deskId, roomDeskIds])

  const open = taskItems.filter((n) => n.status !== 'done')
  const done = taskItems.filter((n) => n.status === 'done')

  async function handleAdd(e: React.KeyboardEvent<HTMLInputElement>): Promise<void> {
    if (e.key !== 'Enter') return
    const text = newText.trim()
    if (!text) return
    setNewText('')
    await createNode({
      parentId: deskId,
      kind: 'task-item',
      title: text,
      description: ''
    })
  }

  async function toggleDone(id: string, currentStatus: string): Promise<void> {
    await updateNode(id, { status: currentStatus === 'done' ? 'open' : 'done' })
  }

  async function deleteItem(id: string): Promise<void> {
    await removeNode(id)
  }

  return (
    <WidgetFrame widget={widget}>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Scope toggle */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-1 shrink-0">
          {(['desk', 'room'] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors capitalize ${
                scope === s
                  ? 'bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent))]'
                  : 'text-[var(--ink-60)] hover:text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* New item input */}
        <div className="px-3 pb-1.5 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-1.5">
            <Icon name="add" size={13} className="text-[var(--ink-40)] shrink-0" />
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => void handleAdd(e)}
              placeholder="Add task…"
              className="flex-1 bg-transparent text-[12.5px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] outline-none"
            />
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {open.length === 0 && done.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Icon name="checklist" size={28} className="text-[var(--ink-20)] mb-2" />
              <p className="text-[11px] text-[var(--ink-50)] leading-relaxed">
                No tasks yet.<br />Type above and press Enter to add one.
              </p>
            </div>
          )}

          {open.map((item) => (
            <div key={item.id} className="mb-1">
              <TaskDetailPanel
                node={item}
                onUpdate={(patch: NodePatch) => void updateNode(item.id, patch)}
                onDelete={(id) => void deleteItem(id)}
              />
            </div>
          ))}

          {done.length > 0 && (
            <>
              <div className="mt-2 mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-40)]">
                Done ({done.length})
              </div>
              {done.map((item) => (
                <div key={item.id} className="mb-1">
                  <TaskDetailPanel
                    node={item}
                    onUpdate={(patch: NodePatch) => void updateNode(item.id, patch)}
                    onDelete={(id) => void deleteItem(id)}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </WidgetFrame>
  )
}

interface RowProps {
  title: string
  isDone: boolean
  category?: TaskItemCategory
  onToggle: () => void
  onDelete: () => void
}

function TaskItemRow({ title, isDone, category, onToggle, onDelete }: RowProps): JSX.Element {
  return (
    <div className="group flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
      <button
        onClick={onToggle}
        className={`shrink-0 h-4 w-4 inline-flex items-center justify-center rounded border transition-colors ${
          isDone
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-[var(--edge-firm)] text-transparent hover:border-[var(--ink-50)]'
        }`}
        aria-label={isDone ? 'Mark undone' : 'Mark done'}
      >
        {isDone && <Icon name="check" size={9} />}
      </button>

      <span
        className={`flex-1 min-w-0 text-[12.5px] truncate ${
          isDone ? 'line-through text-[var(--ink-40)]' : 'text-[var(--ink-90)]'
        }`}
      >
        {title}
      </span>

      {category && (
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9.5px] font-medium capitalize ${CATEGORY_COLORS[category]}`}
        >
          {category}
        </span>
      )}

      <button
        onClick={onDelete}
        className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 h-4 w-4 inline-flex items-center justify-center rounded text-[var(--ink-40)] hover:text-rose-500 transition-all"
        aria-label="Delete task"
      >
        <Icon name="close" size={10} />
      </button>
    </div>
  )
}
