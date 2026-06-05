import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FbNode, Widget } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import Icon from './Icon'

// "Make this a task" dialog — invoked from a widget or section's right-click
// context menu. Lets the user create a task in an existing folder OR in a
// brand-new folder, with the task title pre-filled from whatever the user
// right-clicked. Portalled into document.body so the canvas's stacking
// contexts can't trap it behind sibling widgets.

interface Props {
  // Pre-filled task title — usually the widget/section's display name or a
  // first-line summary of its content. The user can edit before saving.
  seedTitle: string
  // Optional default parent folder — when the right-click happened inside
  // a context that already implies a folder (e.g. a section that was
  // dragged from a folder view). Falls back to the first folder in the
  // sidebar or to "create new" if none exist yet.
  defaultParentId?: string | null
  // The widget the user right-clicked to open this dialog. When set, we
  // surface a checkbox that lets them clone the widget into the new task
  // after creation — useful for "promote this thing I'm working on to a
  // proper task" flows where the widget is the genesis of the task.
  sourceWidget?: Widget | null
  onClose: () => void
}

const NEW_FOLDER_VALUE = '__new__'

export default function MakeTaskDialog({
  seedTitle,
  defaultParentId,
  sourceWidget,
  onClose
}: Props): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const create = useNodeStore((s) => s.create)
  const setActiveTask = useNodeStore((s) => s.setActive)
  const createWidget = useWidgetStore((s) => s.create)
  const updateWidget = useWidgetStore((s) => s.update)
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const folders = useMemo(
    () => nodes.filter((n) => n.kind === 'folder'),
    [nodes]
  )
  // The folder the user is currently working in = the active task's parent.
  // This is what we default the picker to (the operator's explicit ask).
  const currentFolderId = useMemo(() => {
    const task = nodes.find((n) => n.id === activeTaskId)
    const pid = task?.parentId ?? null
    return pid && folders.some((f) => f.id === pid) ? pid : null
  }, [nodes, activeTaskId, folders])

  const [taskTitle, setTaskTitle] = useState(seedTitle.trim() || 'Untitled task')
  const [folderQuery, setFolderQuery] = useState('')
  // Default to ON when a source widget was passed — almost always what the
  // user wants from a right-click "make this a task" flow. They can untick
  // if they just want the task and the widget should stay on the current
  // canvas (e.g. a sticky that's a reference, not the task itself).
  const [copyWidget, setCopyWidget] = useState<boolean>(!!sourceWidget)
  const [switchToNewTask, setSwitchToNewTask] = useState<boolean>(!!sourceWidget)
  // Default the selector to the supplied parent if it's a real folder,
  // otherwise the first existing folder, otherwise the "new folder" path.
  const [folderSel, setFolderSel] = useState<string>(() => {
    // Default order: explicit prop → the current folder (active task's parent)
    // → first folder → create-new.
    if (defaultParentId && folders.some((f) => f.id === defaultParentId)) {
      return defaultParentId
    }
    const task = nodes.find((n) => n.id === activeTaskId)
    const pid = task?.parentId ?? null
    if (pid && folders.some((f) => f.id === pid)) return pid
    if (folders.length > 0) return folders[0].id
    return NEW_FOLDER_VALUE
  })
  const [newFolderName, setNewFolderName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(): Promise<void> {
    if (busy) return
    const title = taskTitle.trim()
    if (!title) {
      setError('Give the task a title.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let parentId: string
      if (folderSel === NEW_FOLDER_VALUE) {
        const folderName = newFolderName.trim()
        if (!folderName) {
          setError('Give the new folder a name.')
          setBusy(false)
          return
        }
        const folder = await create({
          parentId: null,
          kind: 'folder',
          title: folderName
        } as Parameters<typeof create>[0])
        parentId = folder.id
      } else {
        parentId = folderSel
      }
      const newTask = await create({
        parentId,
        kind: 'task',
        title
      } as Parameters<typeof create>[0])
      // If the user opted in (default when a source widget was supplied),
      // clone the widget into the new task. We use the widget store's
      // create() rather than IPC-level copy because it includes optimistic
      // updates + activity log entries. Fresh canvas position so the clone
      // doesn't collide with the original's stored x/y if the user happens
      // to land on the new task quickly.
      if (sourceWidget && copyWidget) {
        // Link the copy to the source so edits stay in sync across the two
        // tasks (tick a checkbox / rename here → it mirrors there). Reuse the
        // source's group or create one and tag the source too.
        let groupId = sourceWidget.syncGroupId
        if (!groupId) {
          groupId = crypto.randomUUID()
          await updateWidget(sourceWidget.id, { syncGroupId: groupId })
        }
        await createWidget({
          taskId: newTask.id,
          kind: sourceWidget.kind,
          title: sourceWidget.title,
          content: sourceWidget.content,
          x: 80,
          y: 80,
          width: sourceWidget.width,
          height: sourceWidget.height,
          color: sourceWidget.color,
          sourceAppId: sourceWidget.sourceAppId,
          mode: sourceWidget.mode,
          syncGroupId: groupId
        })
      }
      // Switch the active task so the user lands on the new task they
      // just created. Off by default unless a widget was being promoted —
      // matches the "ok this is now my next thing to work on" intent.
      if (switchToNewTask) {
        setActiveTask(newTask.id)
      }
      onClose()
    } catch (e) {
      setError((e as Error).message ?? 'Failed to create task')
      setBusy(false)
    }
  }

  return createPortal(
    <div
      // Modal backdrop — click to dismiss, but only on the backdrop
      // itself (not when the click bubbles up from a child input/button).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[250] bg-stone-900/40 backdrop-blur-[2px] flex items-center justify-center"
    >
      <div
        className="w-[380px] rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <Icon name="task_alt" size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Make this a task
          </h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Task title
            </label>
            <input
              autoFocus
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit()
              }}
              className="w-full text-sm px-2.5 py-1.5 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-accent"
              placeholder="What is the task?"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Folder
            </label>
            {folderSel === NEW_FOLDER_VALUE ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSubmit()
                  }}
                  placeholder="New folder name — e.g. Q3 outreach"
                  className="w-full text-sm px-2.5 py-1.5 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setFolderSel(currentFolderId || folders[0]?.id || NEW_FOLDER_VALUE)}
                  className="text-[11px] text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                >
                  ← Pick an existing folder
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={folderQuery}
                  onChange={(e) => setFolderQuery(e.target.value)}
                  placeholder="Search folders…"
                  className="w-full text-sm px-2.5 py-1.5 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-accent"
                />
                <div className="mt-1 max-h-40 overflow-auto rounded border border-stone-200 dark:border-stone-700">
                  {folders
                    .filter((f: FbNode) =>
                      (f.title || '').toLowerCase().includes(folderQuery.trim().toLowerCase())
                    )
                    .map((f: FbNode) => (
                      <button
                        type="button"
                        key={f.id}
                        onClick={() => setFolderSel(f.id)}
                        className={`w-full text-left px-2.5 py-1.5 text-sm flex items-center justify-between gap-2 ${
                          folderSel === f.id
                            ? 'bg-accent/15 text-accent'
                            : 'text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800'
                        }`}
                      >
                        <span className="truncate">{f.title || '(untitled folder)'}</span>
                        {f.id === currentFolderId && (
                          <span className="text-[9px] uppercase tracking-wider text-stone-400 shrink-0">
                            current
                          </span>
                        )}
                      </button>
                    ))}
                  {folders.filter((f: FbNode) =>
                    (f.title || '').toLowerCase().includes(folderQuery.trim().toLowerCase())
                  ).length === 0 && (
                    <div className="px-2.5 py-1.5 text-[11px] text-stone-400">No folders match.</div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setFolderSel(NEW_FOLDER_VALUE)
                      if (folderQuery.trim()) setNewFolderName(folderQuery.trim())
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-sm text-accent border-t border-stone-200 dark:border-stone-700 hover:bg-accent/5"
                  >
                    + Create new folder{folderQuery.trim() ? ` "${folderQuery.trim()}"` : '…'}
                  </button>
                </div>
              </div>
            )}
          </div>
          {sourceWidget && (
            <div className="pt-1 border-t border-stone-200 dark:border-stone-700 space-y-1.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyWidget}
                  onChange={(e) => setCopyWidget(e.target.checked)}
                  className="mt-0.5 accent-accent"
                />
                <div className="flex-1">
                  <div className="text-[12px] text-stone-800 dark:text-stone-100">
                    Copy this widget into the new task
                  </div>
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-tight">
                    A 🔗 linked copy lands on the new task — its content, title and colour stay in sync with this one (unlink anytime from the widget menu).
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={switchToNewTask}
                  onChange={(e) => setSwitchToNewTask(e.target.checked)}
                  className="mt-0.5 accent-accent"
                />
                <div className="flex-1">
                  <div className="text-[12px] text-stone-800 dark:text-stone-100">
                    Switch to the new task
                  </div>
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-tight">
                    Otherwise it just appears in your sidebar — you'll stay on the current desk.
                  </div>
                </div>
              </label>
            </div>
          )}
          {error && (
            <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
