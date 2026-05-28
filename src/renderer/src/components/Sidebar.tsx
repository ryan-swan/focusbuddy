import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectedApp, FbNode, NodeKind, WidgetSuggestion } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useConnectedAppsStore } from '../stores/connectedApps'
import { useViewStore, type View } from '../stores/view'
import { chimeOut } from '../lib/audioBeep'
import { catalogFor } from '../lib/widgetCatalog'
import { chimeIn } from '../lib/audioBeep'
import { splitFavourites } from '../lib/connectedAppSort'
import NewNodeDialog from './NewNodeDialog'
import AISetupDialog from './AISetupDialog'
import AddConnectedAppDialog from './AddConnectedAppDialog'
import Icon from './Icon'

// MIME used when dragging a Connected App row from the sidebar onto the canvas.
// The Canvas drop handler reads this to spawn a webview widget bound to the app.
export const CONNECTED_APP_DRAG_MIME = 'text/fb-connected-app'

interface ConnectedAppRowProps {
  active: boolean
  onOpen: () => void
  onTogglePinned: () => void
}

function renderConnectedAppRow(
  app: ConnectedApp,
  props: ConnectedAppRowProps
): JSX.Element {
  const { active, onOpen, onTogglePinned } = props
  const isLocal = app.kind === 'local'
  return (
    <div
      key={app.id}
      draggable
      onDragStart={(e) => {
        // The connected app's id is the contract — Canvas resolves it back to a URL
        // + partition + vault binding (web) or launcher tile (local). We also
        // stash the URL/path as text/uri-list so dragging into a non-Canvas
        // surface (system browser, text field) still produces something useful.
        e.dataTransfer.setData(CONNECTED_APP_DRAG_MIME, app.id)
        e.dataTransfer.setData('text/uri-list', app.url)
        e.dataTransfer.setData('text/plain', app.url)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className={`relative group flex items-center pr-1.5 py-0.5 px-2 ${
        active ? 'bg-stone-100/80 dark:bg-stone-800/60' : ''
      }`}
      title={
        isLocal
          ? `Click to launch ${app.title} (drag onto a canvas to add a launcher tile)`
          : `Drag onto a canvas to use ${app.title} inside a task`
      }
    >
      {active && <span className="absolute left-0 h-6 w-[3px] rounded-r bg-accent" />}
      <button
        onClick={onOpen}
        className={`flex-1 flex items-center gap-2 px-1.5 py-1 rounded text-left min-w-0 ${
          active ? '' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
        }`}
      >
        {app.iconPngBase64 ? (
          // Real macOS app icon (or favicon-like for web). Pre-cached as base64
          // PNG at create-time so renders are cheap and don't IPC per-paint.
          <img
            src={`data:image/png;base64,${app.iconPngBase64}`}
            alt=""
            className="h-5 w-5 rounded shrink-0"
          />
        ) : (
          <span
            className="h-5 w-5 rounded inline-flex items-center justify-center shrink-0"
            style={
              app.color
                ? { backgroundColor: `${app.color}1a`, color: app.color }
                : {
                    backgroundColor: 'rgb(var(--accent) / 0.12)',
                    color: 'rgb(var(--accent))'
                  }
            }
          >
            <Icon name={app.icon || 'apps'} size={12} />
          </span>
        )}
        <span
          className={`text-sm truncate flex-1 ${
            active
              ? 'text-stone-900 dark:text-stone-100 font-medium'
              : 'text-stone-800 dark:text-stone-200'
          }`}
        >
          {app.title}
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onTogglePinned()
        }}
        title={app.pinned ? 'Unpin from Favourites' : 'Pin to Favourites'}
        className={`icon-btn !h-5 !w-5 transition-opacity ${
          app.pinned ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Icon name={app.pinned ? 'push_pin' : 'push_pin'} size={11} />
      </button>
    </div>
  )
}

interface TreeItem {
  node: FbNode
  children: TreeItem[]
  depth: number
}

function buildTree(nodes: FbNode[]): TreeItem[] {
  const byParent = new Map<string | null, FbNode[]>()
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  }
  const build = (parentId: string | null, depth: number): TreeItem[] =>
    (byParent.get(parentId) ?? []).map((node) => ({
      node,
      depth,
      children: build(node.id, depth + 1)
    }))
  return build(null, 0)
}

function flatten(items: TreeItem[], expanded: Record<string, boolean>): TreeItem[] {
  const out: TreeItem[] = []
  const walk = (list: TreeItem[]): void => {
    for (const item of list) {
      out.push(item)
      if (expanded[item.node.id]) walk(item.children)
    }
  }
  walk(items)
  return out
}

interface Props {
  onCollapse?: () => void
}

export default function Sidebar({ onCollapse }: Props = {}): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const expanded = useNodeStore((s) => s.expanded)
  const toggleExpand = useNodeStore((s) => s.toggleExpand)
  const setActive = useNodeStore((s) => s.setActive)
  const remove = useNodeStore((s) => s.remove)
  const update = useNodeStore((s) => s.update)
  const moveNode = useNodeStore((s) => s.move)
  const createWidget = useWidgetStore((s) => s.create)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)
  const view = useViewStore((s) => s.view)
  const goHome = useViewStore((s) => s.goHome)
  const goAllTasks = useViewStore((s) => s.goAllTasks)
  const goCalendar = useViewStore((s) => s.goCalendar)
  const goProject = useViewStore((s) => s.goProject)
  const goTask = useViewStore((s) => s.goTask)
  const goConnectedApp = useViewStore((s) => s.goConnectedApp)
  const goVault = useViewStore((s) => s.goVault)

  const connectedApps = useConnectedAppsStore((s) => s.apps)
  const appsLoaded = useConnectedAppsStore((s) => s.loaded)
  const refreshApps = useConnectedAppsStore((s) => s.refresh)
  const togglePinned = useConnectedAppsStore((s) => s.togglePinned)
  const launchLocal = useConnectedAppsStore((s) => s.launchLocal)
  const [addAppOpen, setAddAppOpen] = useState(false)
  // Whether the "More apps" accordion is expanded. Defaults to collapsed so the
  // strip stays compact; the user expands it to reach the long-tail apps.
  const [moreAppsOpen, setMoreAppsOpen] = useState(false)
  const { favourites: favouriteApps, more: moreApps } = useMemo(
    () => splitFavourites(connectedApps),
    [connectedApps]
  )

  useEffect(() => {
    if (!appsLoaded) void refreshApps()
  }, [appsLoaded, refreshApps])

  const [dialog, setDialog] = useState<
    | { mode: 'create'; parentId: string | null; kind: NodeKind }
    | { mode: 'edit'; node: FbNode }
    | null
  >(null)
  const [aiSetupTask, setAiSetupTask] = useState<FbNode | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  // Drag-and-drop state — which row is hovered, and where the drop would land
  const draggingIdRef = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    position: 'before' | 'after' | 'inside'
  } | null>(null)

  function rowDropPosition(
    e: React.DragEvent,
    rowEl: HTMLElement,
    targetNode: FbNode
  ): 'before' | 'after' | 'inside' {
    const rect = rowEl.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const h = rect.height
    if (targetNode.kind === 'folder') {
      // Folders: top 28% = before, middle 44% = inside, bottom 28% = after
      if (offsetY < h * 0.28) return 'before'
      if (offsetY > h * 0.72) return 'after'
      return 'inside'
    }
    // Tasks: just before / after by halves — can't drop INTO a task
    return offsetY < h * 0.5 ? 'before' : 'after'
  }

  function handleRowDragStart(e: React.DragEvent, node: FbNode): void {
    draggingIdRef.current = node.id
    e.dataTransfer.effectAllowed = 'copyMove'
    // For sidebar reorder/reparent:
    e.dataTransfer.setData('text/fb-node', node.id)
    // For dropping onto the canvas to spawn a task-link widget:
    if (node.kind === 'task') {
      e.dataTransfer.setData('text/fb-task-link', node.id)
    }
  }

  function handleRowDragOver(e: React.DragEvent, node: FbNode): void {
    const draggingId = draggingIdRef.current
    if (!draggingId || draggingId === node.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const position = rowDropPosition(e, e.currentTarget as HTMLElement, node)
    setDropTarget((prev) =>
      prev && prev.id === node.id && prev.position === position
        ? prev
        : { id: node.id, position }
    )
  }

  function handleRowDragLeave(e: React.DragEvent, node: FbNode): void {
    // Only clear if leaving the actual row (not hovering a child within it)
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as HTMLElement).contains(related)) return
    setDropTarget((prev) => (prev?.id === node.id ? null : prev))
  }

  async function handleRowDrop(e: React.DragEvent, node: FbNode): Promise<void> {
    e.preventDefault()
    const draggingId = draggingIdRef.current
    setDropTarget(null)
    draggingIdRef.current = null
    if (!draggingId || draggingId === node.id) return
    const position = rowDropPosition(e, e.currentTarget as HTMLElement, node)

    let newParentId: string | null
    let beforeId: string | null
    if (position === 'inside') {
      // Drop INTO the folder — append to end of its children
      newParentId = node.id
      beforeId = null
    } else {
      newParentId = node.parentId
      if (position === 'before') {
        beforeId = node.id
      } else {
        // 'after' — find the next sibling under node.parentId; null = end
        const siblings = nodes
          .filter((n) => n.parentId === node.parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
        const idx = siblings.findIndex((s) => s.id === node.id)
        const next = idx >= 0 ? siblings[idx + 1] ?? null : null
        beforeId = next?.id ?? null
      }
    }
    await moveNode(draggingId, newParentId, beforeId)
    chimeOut()
  }

  function handleRowDragEnd(): void {
    draggingIdRef.current = null
    setDropTarget(null)
  }

  // Section collapse state — let users hide noise they aren't using yet.
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [appsOpen, setAppsOpen] = useState(true)

  const tree = useMemo(() => buildTree(nodes), [nodes])
  const flat = useMemo(() => flatten(tree, expanded), [tree, expanded])

  function selectTask(id: string): void {
    setActive(id)
    goTask(id)
  }

  function selectProject(id: string): void {
    goProject(id)
  }

  function viewIsActive(targetView: View): boolean {
    if (view.kind !== targetView.kind) return false
    if (view.kind === 'task' && targetView.kind === 'task') {
      return view.taskId === targetView.taskId
    }
    if (view.kind === 'project-dashboard' && targetView.kind === 'project-dashboard') {
      return view.projectId === targetView.projectId
    }
    if (view.kind === 'connected-app' && targetView.kind === 'connected-app') {
      return view.appId === targetView.appId
    }
    return true // home / all-tasks have no inner id
  }

  async function handleAISetupAccept(suggestions: WidgetSuggestion[]): Promise<void> {
    const task = aiSetupTask
    if (!task) return
    let x = 80
    let y = 80
    let rowMaxH = 0
    const ROW_LIMIT = 720
    for (const s of suggestions) {
      const entry = catalogFor(s.kind)
      const w = entry?.defaultWidth ?? 320
      const h = entry?.defaultHeight ?? 240
      if (x !== 80 && x + w > ROW_LIMIT) {
        x = 80
        y += rowMaxH + 24
        rowMaxH = 0
      }
      await createWidget({
        taskId: task.id,
        kind: s.kind,
        title: s.title || '',
        content: s.content || entry?.defaultContent || '',
        x: Math.round(x),
        y: Math.round(y),
        width: w,
        height: h,
        color: s.kind === 'sticky' ? '#fef08a' : null
      })
      x += w + 24
      rowMaxH = Math.max(rowMaxH, h)
    }
    chimeIn()
    bumpLayout()
  }

  return (
    <aside className="h-full flex flex-col fb-glass-chrome border-r border-[color:var(--glass-chrome-border)]">
      {/* Header — collapse toggle + master "New" */}
      <div className="px-3 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-tight text-stone-900 dark:text-stone-100 uppercase">
          FocusBuddy
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDialog({ mode: 'create', parentId: null, kind: 'folder' })}
            title="New top-level project"
            className="btn-primary !px-2 !py-1"
          >
            <Icon name="create_new_folder" size={14} />
            <span>New</span>
          </button>
          {onCollapse && (
            <button onClick={onCollapse} className="icon-btn" title="Hide sidebar">
              <Icon name="keyboard_double_arrow_left" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {/* ── WORKSPACE — universal nav ─────────────────────────────────── */}
        <SectionHeader
          label="Workspace"
          open={workspaceOpen}
          onToggle={() => setWorkspaceOpen((v) => !v)}
        />
        {workspaceOpen && (
          <div className="mb-2">
            <NavRow
              icon="dashboard"
              label="Home"
              active={viewIsActive({ kind: 'home' })}
              onClick={() => {
                setActive(null)
                goHome()
              }}
            />
            <NavRow
              icon="checklist"
              label="All Tasks"
              active={viewIsActive({ kind: 'all-tasks' })}
              onClick={() => {
                setActive(null)
                goAllTasks()
              }}
            />
            <NavRow
              icon="calendar_month"
              label="Calendar"
              active={viewIsActive({ kind: 'calendar' })}
              onClick={() => {
                setActive(null)
                goCalendar()
              }}
            />
            <NavRow
              icon="lock"
              label="Vault"
              active={viewIsActive({ kind: 'vault' })}
              onClick={() => {
                setActive(null)
                goVault()
              }}
            />
          </div>
        )}

        {/* ── PROJECTS — the tree we had before ────────────────────────── */}
        <SectionHeader
          label="Projects"
          open={projectsOpen}
          onToggle={() => setProjectsOpen((v) => !v)}
          action={
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDialog({ mode: 'create', parentId: null, kind: 'folder' })
              }}
              className="icon-btn !h-5 !w-5"
              title="New top-level project"
            >
              <Icon name="add" size={12} />
            </button>
          }
        />
        {projectsOpen && (
          <div className="mb-2">
            {flat.length === 0 && (
              <div className="px-4 py-3 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                No projects yet.{' '}
                <button
                  onClick={() => setDialog({ mode: 'create', parentId: null, kind: 'folder' })}
                  className="underline hover:text-stone-900 dark:hover:text-stone-100"
                >
                  Create one
                </button>{' '}
                to get started.
              </div>
            )}
            {flat.map((item) => {
              const { node, depth } = item
              const hasChildren = item.children.length > 0
              const isOpen = !!expanded[node.id]
              const isFolder = node.kind === 'folder'
              const isActive = isFolder
                ? viewIsActive({ kind: 'project-dashboard', projectId: node.id })
                : viewIsActive({ kind: 'task', taskId: node.id })
              const isRenaming = renamingId === node.id
              const isDragging = draggingIdRef.current === node.id
              const isDropTarget = dropTarget?.id === node.id
              const dropPos = isDropTarget ? dropTarget.position : null
              return (
                <div
                  key={node.id}
                  style={{
                    paddingLeft: `${depth * 14 + 8}px`,
                    borderTop:
                      dropPos === 'before' ? '2px solid rgb(var(--accent))' : '2px solid transparent',
                    borderBottom:
                      dropPos === 'after' ? '2px solid rgb(var(--accent))' : '2px solid transparent',
                    backgroundColor:
                      dropPos === 'inside' ? 'rgb(var(--accent) / 0.12)' : undefined,
                    boxShadow:
                      dropPos === 'inside'
                        ? 'inset 0 0 0 2px rgb(var(--accent) / 0.45)'
                        : undefined,
                    opacity: isDragging ? 0.4 : 1,
                    transition: 'border-color 80ms, background-color 80ms'
                  }}
                  className={`relative group flex items-center pr-1.5 py-0.5 ${
                    isActive && !isDropTarget ? 'bg-stone-100/80 dark:bg-stone-800/60' : ''
                  }`}
                  onDragOver={(e) => handleRowDragOver(e, node)}
                  onDragLeave={(e) => handleRowDragLeave(e, node)}
                  onDrop={(e) => void handleRowDrop(e, node)}
                >
                  {isActive && (
                    <span className="absolute left-0 h-6 w-[3px] rounded-r bg-accent" />
                  )}
                  <button
                    onClick={() => hasChildren && toggleExpand(node.id)}
                    className={`w-5 h-5 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors ${
                      hasChildren ? '' : 'invisible'
                    }`}
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                  >
                    <Icon name={isOpen ? 'expand_more' : 'chevron_right'} size={16} />
                  </button>
                  <div
                    draggable={!isRenaming}
                    onDragStart={(e) => handleRowDragStart(e, node)}
                    onDragEnd={handleRowDragEnd}
                    onClick={() => {
                      if (isRenaming) return
                      if (isFolder) selectProject(node.id)
                      else selectTask(node.id)
                    }}
                    onDoubleClick={() => {
                      setRenamingId(node.id)
                      setRenameText(node.title)
                    }}
                    className={`flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded min-w-0 ${
                      isRenaming ? '' : 'cursor-grab active:cursor-grabbing'
                    } ${
                      !isActive ? 'hover:bg-stone-100 dark:hover:bg-stone-800' : ''
                    }`}
                  >
                    <Icon
                      name={isFolder ? 'folder' : 'task_alt'}
                      size={16}
                      filled={isActive || isFolder}
                      className={
                        isFolder
                          ? 'text-amber-700'
                          : node.status === 'done'
                            ? 'text-emerald-700'
                            : node.status === 'in_progress'
                              ? 'text-blue-700'
                              : 'text-stone-500'
                      }
                    />
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onBlur={() => {
                          if (renameText.trim() && renameText !== node.title) {
                            void update(node.id, { title: renameText.trim() })
                          }
                          setRenamingId(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') {
                            setRenameText(node.title)
                            setRenamingId(null)
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 px-1.5 py-0.5 rounded border border-stone-300 dark:border-stone-600 text-sm focus:outline-none focus:border-stone-700 dark:focus:border-stone-400"
                      />
                    ) : (
                      <>
                        <span
                          className={`text-sm truncate flex-1 ${
                            isActive
                              ? 'text-stone-900 dark:text-stone-100 font-medium'
                              : 'text-stone-800 dark:text-stone-200'
                          } ${node.status === 'done' ? 'line-through text-stone-400 dark:text-stone-500' : ''}`}
                        >
                          {node.title}
                        </span>
                        {!isFolder && node.dueDate != null && node.status !== 'done' && (() => {
                          const daysLeft = Math.ceil((node.dueDate - Date.now()) / 86_400_000)
                          const overdue = daysLeft < 0
                          const soon = !overdue && daysLeft <= 2
                          const label =
                            daysLeft === 0
                              ? 'today'
                              : daysLeft === 1
                                ? 'tomorrow'
                                : overdue
                                  ? `${-daysLeft}d late`
                                  : `${daysLeft}d`
                          return (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                                overdue
                                  ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400'
                                  : soon
                                    ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                                    : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                              }`}
                              title={`Due ${new Date(node.dueDate).toLocaleDateString()}`}
                            >
                              {label}
                            </span>
                          )
                        })()}
                      </>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                    {isFolder && (
                      <>
                        <button
                          onClick={() => setDialog({ mode: 'create', parentId: node.id, kind: 'folder' })}
                          title="Add sub-project"
                          className="icon-btn"
                        >
                          <Icon name="create_new_folder" size={14} />
                        </button>
                        <button
                          onClick={() => setDialog({ mode: 'create', parentId: node.id, kind: 'task' })}
                          title="Add task"
                          className="icon-btn"
                        >
                          <Icon name="add_task" size={14} />
                        </button>
                      </>
                    )}
                    {!isFolder && (
                      <button
                        onClick={() => setDialog({ mode: 'create', parentId: node.id, kind: 'task' })}
                        title="Add subtask"
                        className="icon-btn"
                      >
                        <Icon name="add" size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setDialog({ mode: 'edit', node })}
                      title={`Edit ${isFolder ? 'project' : 'task'}`}
                      className="icon-btn"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${node.title}"? Children will be removed too.`)) {
                          void remove(node.id)
                        }
                      }}
                      title="Delete"
                      className="icon-btn hover:!text-red-700"
                    >
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── CONNECTED APPS ────────────────────────────────────────────── */}
        <SectionHeader
          label="Connected Apps"
          open={appsOpen}
          onToggle={() => setAppsOpen((v) => !v)}
          action={
            <button
              onClick={(e) => {
                e.stopPropagation()
                setAddAppOpen(true)
              }}
              className="icon-btn !h-5 !w-5"
              title="Add a connected app"
            >
              <Icon name="add" size={12} />
            </button>
          }
        />
        {appsOpen && (
          <div className="mb-2">
            {connectedApps.length === 0 ? (
              <div className="mx-3 mb-2 rounded-md border border-dashed border-stone-300 dark:border-stone-700 p-3 text-center">
                <Icon
                  name="apps"
                  size={18}
                  className="text-stone-400 dark:text-stone-500 mx-auto mb-1"
                />
                <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug mb-2">
                  Pin Spotify, Gmail, Slack, ChatGPT and others you use across every task.
                  Drag them onto a canvas to work with them inside a task.
                </p>
                <button
                  onClick={() => setAddAppOpen(true)}
                  className="btn-ghost !text-[11px] !px-2 !py-1"
                >
                  <Icon name="add" size={12} />
                  <span>Add app</span>
                </button>
              </div>
            ) : (
              <>
                {favouriteApps.map((app) =>
                  renderConnectedAppRow(app, {
                    active:
                      app.kind === 'web' &&
                      viewIsActive({ kind: 'connected-app', appId: app.id }),
                    onOpen: () =>
                      app.kind === 'local'
                        ? void launchLocal(app.id)
                        : goConnectedApp(app.id),
                    onTogglePinned: () => void togglePinned(app.id)
                  })
                )}
                {moreApps.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMoreAppsOpen((v) => !v)}
                      className="w-full mt-1 px-3 py-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                    >
                      <Icon
                        name={moreAppsOpen ? 'expand_more' : 'chevron_right'}
                        size={12}
                      />
                      <span>More apps ({moreApps.length})</span>
                    </button>
                    {moreAppsOpen &&
                      moreApps.map((app) =>
                        renderConnectedAppRow(app, {
                          active:
                            app.kind === 'web' &&
                            viewIsActive({ kind: 'connected-app', appId: app.id }),
                          onOpen: () =>
                            app.kind === 'local'
                              ? void launchLocal(app.id)
                              : goConnectedApp(app.id),
                          onTogglePinned: () => void togglePinned(app.id)
                        })
                      )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {dialog && dialog.mode === 'create' && (
        <NewNodeDialog
          parentId={dialog.parentId}
          kind={dialog.kind}
          onClose={() => setDialog(null)}
          onRequestAISetup={(task) => setAiSetupTask(task)}
        />
      )}
      {dialog && dialog.mode === 'edit' && (
        <NewNodeDialog
          node={dialog.node}
          onClose={() => setDialog(null)}
          onRequestAISetup={(task) => setAiSetupTask(task)}
        />
      )}
      {aiSetupTask && (
        <AISetupDialog
          task={aiSetupTask}
          onClose={() => setAiSetupTask(null)}
          onAccept={handleAISetupAccept}
        />
      )}
      {addAppOpen && (
        <AddConnectedAppDialog
          onClose={() => setAddAppOpen(false)}
          onAdded={(id) => goConnectedApp(id)}
        />
      )}
    </aside>
  )
}

interface SectionHeaderProps {
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
}

function SectionHeader({ label, open, onToggle, action }: SectionHeaderProps): JSX.Element {
  return (
    <div className="px-2 pt-2 pb-1 flex items-center justify-between sticky top-0 bg-stone-50 dark:bg-stone-900 z-10">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
      >
        <Icon name={open ? 'expand_more' : 'chevron_right'} size={12} />
        <span>{label}</span>
      </button>
      {action}
    </div>
  )
}

interface NavRowProps {
  icon: string
  label: string
  active: boolean
  onClick: () => void
  badge?: string
}

function NavRow({ icon, label, active, onClick, badge }: NavRowProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        active
          ? 'bg-stone-100/80 dark:bg-stone-800/60 text-stone-900 dark:text-stone-100'
          : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
      }`}
    >
      {active && <span className="absolute left-0 h-5 w-[3px] rounded-r bg-accent" />}
      <Icon
        name={icon}
        size={16}
        filled={active}
        className={active ? 'text-accent' : 'text-stone-500 dark:text-stone-400'}
      />
      <span className={`text-sm flex-1 ${active ? 'font-medium' : ''}`}>{label}</span>
      {badge && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
          {badge}
        </span>
      )}
    </button>
  )
}
