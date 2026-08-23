import { useEffect, useMemo, useState } from 'react'
import type { AxisValue, FbNode } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import Icon from '../Icon'

// Turn an email into a task. The user picks where it lands (All Tasks at the top
// level, an existing folder/desk, or nested under an existing task), or creates a
// new folder on the spot, then sets a due date and an urgency. The task is
// created as a real node, so it shows in All Tasks and inside its folder.

interface EmailLike {
  subject: string
  fromName: string
  fromAddress: string
  text: string
}

interface Props {
  email: EmailLike
  onClose: () => void
  onCreated: (title: string) => void
}

const URGENCY: Array<{ value: AxisValue; label: string }> = [
  { value: 1, label: 'Low' },
  { value: 2, label: 'Minor' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Urgent' }
]

// Order nodes as a depth-indented tree so the destination list reads naturally.
function orderTree(nodes: FbNode[]): Array<{ node: FbNode; depth: number }> {
  const byParent = new Map<string | null, FbNode[]>()
  for (const n of nodes) {
    if (n.archived) continue
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
  const out: Array<{ node: FbNode; depth: number }> = []
  const walk = (parentId: string | null, depth: number): void => {
    for (const n of byParent.get(parentId) ?? []) {
      out.push({ node: n, depth })
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export default function EmailTaskDialog({ email, onClose, onCreated }: Props): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const refresh = useNodeStore((s) => s.refresh)
  const createNode = useNodeStore((s) => s.create)

  const [title, setTitle] = useState(email.subject || '(no subject)')
  const [parentId, setParentId] = useState<string | null>(null) // null = All Tasks (top level)
  const [due, setDue] = useState('') // yyyy-mm-dd
  const [urgency, setUrgency] = useState<AxisValue>(3)
  const [newFolder, setNewFolder] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (nodes.length === 0) void refresh()
  }, [nodes.length, refresh])

  const tree = useMemo(() => orderTree(nodes), [nodes])

  async function submit(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      let destination = parentId
      // Create a new folder first if one was named.
      if (newFolder.trim()) {
        const folder = await createNode({ parentId: null, kind: 'folder', title: newFolder.trim() })
        destination = folder.id
      }
      const snippet = email.text.trim().slice(0, 400)
      const dueMs = due ? new Date(`${due}T00:00:00`).getTime() : null
      await createNode({
        parentId: destination,
        kind: 'task',
        title: title.trim() || '(no subject)',
        description: `From ${email.fromName} <${email.fromAddress}>\n\n${snippet}`,
        priority: urgency,
        dueDate: Number.isFinite(dueMs as number) ? dueMs : null
      })
      onCreated(title.trim() || '(no subject)')
    } catch (e) {
      setBusy(false)
      setError((e as Error)?.message ?? 'Could not create the task.')
    }
  }

  const inputCls =
    'w-full bg-[var(--surface-sunken)] rounded-lg px-3 py-2 text-[13px] focus:border-accent'

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="email-task-dialog"
        className="fb-card w-[480px] max-w-[92vw] p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Icon name="add_task" size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-[var(--ink-90)]">Make a task from this email</span>
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[var(--ink-40)]">Task</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls + ' mt-1'} data-testid="email-task-title" />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[var(--ink-40)]">Place it in</span>
          <select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value || null)}
            disabled={!!newFolder.trim()}
            data-testid="email-task-destination"
            className={inputCls + ' mt-1 disabled:opacity-50'}
          >
            <option value="">All Tasks (top level)</option>
            {tree.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {`${'  '.repeat(depth)}${node.kind === 'folder' ? '📁 ' : '• '}${node.title || 'Untitled'}`}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[var(--ink-40)]">…or new folder</span>
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="Name a new folder to create and file it under"
            data-testid="email-task-newfolder"
            className={inputCls + ' mt-1'}
          />
        </label>

        <div className="flex gap-3">
          <label className="block flex-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--ink-40)]">Due date</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} data-testid="email-task-due" className={inputCls + ' mt-1'} />
          </label>
          <div className="flex-1">
            <span className="text-[11px] uppercase tracking-wide text-[var(--ink-40)]">Urgency</span>
            <div className="mt-1 flex gap-1" data-testid="email-task-urgency">
              {URGENCY.map((u) => (
                <button
                  key={u.value}
                  onClick={() => setUrgency(u.value)}
                  className={`flex-1 py-1.5 rounded text-[11px] border ${
                    urgency === u.value
                      ? 'border-accent bg-accent/15 text-accent font-medium'
                      : 'border-[var(--edge-soft)] text-[var(--ink-50)]'
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="text-[12px] text-red-600 dark:text-red-400">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="fb-btn-surface text-[12px] px-3 py-1.5 text-[var(--ink-70)]">
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={busy} className="btn-primary text-[12px] px-3 py-1.5" data-testid="email-task-create">
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  )
}
