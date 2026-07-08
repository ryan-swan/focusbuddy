import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { confirmDialog, promptText } from './plexi/PromptDialog'
import type { ConnectedApp, FbNode, NodeKind, WidgetSuggestion } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { useCanCreateMore } from '../stores/capabilities'
import { promptUpgrade } from '../stores/upgradePrompt'
import { useWidgetStore } from '../stores/widgets'
import { useConnectedAppsStore } from '../stores/connectedApps'
import SyncIndicator from './SyncIndicator'
import { useViewStore, type View } from '../stores/view'
import { chimeOut, chimeIn } from '../lib/audioBeep'
import { catalogFor } from '../lib/widgetCatalog'
import SegmentSwitcher from './segment/SegmentSwitcher'
import OrgSwitcher from './OrgSwitcher'
import { useViewKindEnabled } from '../lib/viewCapability'
import { splitFavourites } from '../lib/connectedAppSort'
import NewNodeDialog from './NewNodeDialog'
import AISetupDialog from './AISetupDialog'
import AddConnectedAppDialog from './AddConnectedAppDialog'
import ShareDialog from './ShareDialog'
import CanvasContextMenu, { type CtxMenuItem } from './CanvasContextMenu'
import { useSharesStore } from '../stores/shares'
import { useAccountStore } from '../stores/account'
import { personDisplayName } from '../lib/personName'
import { acceptShareIntoWorkspace, type ShareSnap } from '../lib/acceptShare'
import { promoteToLiveCanvas } from '../lib/liveCanvasMirror'
import SharedBadge from './SharedBadge'
import SharedRecipientBadges from './SharedRecipientBadges'
import Icon from './Icon'
import { StatusPill } from './plexi'
import { fieldInputClass } from './plexi/forms'

const SidebarCompact = React.createContext(false)

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
  props: ConnectedAppRowProps,
  compact?: boolean
): JSX.Element {
  const { active, onOpen, onTogglePinned } = props
  const isLocal = app.kind === 'local'

  // Compact mode: show icon-only centered button (same dock pattern as NavRow)
  if (compact) {
    const iconEl = app.iconPngBase64 ? (
      <img src={`data:image/png;base64,${app.iconPngBase64}`} alt="" className="h-5 w-5 rounded shrink-0" />
    ) : (
      <span
        className="h-5 w-5 rounded inline-flex items-center justify-center shrink-0"
        style={app.color
          ? { backgroundColor: `${app.color}1a`, color: app.color }
          : { backgroundColor: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }
        }
      >
        <Icon name={app.icon || 'apps'} size={12} />
      </span>
    )
    return (
      <button
        key={app.id}
        onClick={onOpen}
        title={app.title}
        className={[
          'relative w-full h-9 flex items-center justify-center rounded-xl transition-colors',
          active
            ? 'bg-[rgb(var(--accent)/0.10)] text-[rgb(var(--accent))]'
            : 'text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-90)]'
        ].join(' ')}
      >
        {active && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-[rgb(var(--accent))]" />}
        {iconEl}
      </button>
    )
  }

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
        active ? 'bg-[rgb(var(--accent)/0.08)]' : ''
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
          active ? '' : 'hover:bg-[var(--surface-sunken)]'
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
          className={`text-[13px] flex-1 min-w-0 break-words line-clamp-2 leading-tight ${
            active
              ? 'text-[var(--ink-100)] font-medium'
              : 'text-[var(--ink-90)]'
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
          app.pinned ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
      >
        <Icon name={app.pinned ? 'push_pin' : 'push_pin'} size={11} />
      </button>
    </div>
  )
}

// Tree helpers (buildTree / flatten) live in lib/nodeTree so the dashboard
// FoldersCard and any future hierarchical surface can use the same
// implementation. Local re-export to keep call sites here unchanged.
import { buildTree, flatten, type TreeItem } from '../lib/nodeTree'

interface Props {
  onCollapse?: () => void
  onExpand?: () => void
  compact?: boolean
}

export default function Sidebar({ onCollapse, onExpand, compact }: Props = {}): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const nodesLoaded = useNodeStore((s) => s.loaded)
  const nodesError = useNodeStore((s) => s.error)
  const refreshNodes = useNodeStore((s) => s.refresh)
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
  const goProjects = useViewStore((s) => s.goProjects)
  const goFiles = useViewStore((s) => s.goFiles)
  const goProject = useViewStore((s) => s.goProject)
  const goTask = useViewStore((s) => s.goTask)
  const goLiveCanvas = useViewStore((s) => s.goLiveCanvas)
  const goConnectedApp = useViewStore((s) => s.goConnectedApp)
  const goVault = useViewStore((s) => s.goVault)
  const goRoom = useViewStore((s) => s.goRoom)
  const goRooms = useViewStore((s) => s.goRooms)

  // Hide desk-nav entries that lead to a now-gated surface, using the same
  // view-kind -> capability map MainPane's CapabilityGate enforces, so nav and
  // surface agree and a user never clicks into a locked wall.
  const viewEnabled = useViewKindEnabled()

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

  // Section collapse state for the remaining sections.
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [appsOpen, setAppsOpen] = useState(true)

  // Archived nodes are hidden from the day-to-day tree but still live in
  // the database — the dashboard's archived view is where they surface.
  // Filter at this level so every downstream use (tree, flat list,
  // keyboard nav, drop targets) shares the same "what's visible" model.
  const visibleNodes = useMemo(() => nodes.filter((n) => !n.archived), [nodes])

  // Right-click context menu state for sidebar rows. Single state since
  // only one menu can be open at a time. `node` is the row that was
  // right-clicked; the menu items reference it directly.
  const [rowCtxMenu, setRowCtxMenu] = useState<
    | { x: number; y: number; node: FbNode }
    | null
  >(null)
  // Share dialog state — opened from the row context menu.
  const [shareTarget, setShareTarget] = useState<{
    kind: 'folder' | 'task'
    entityId: string
    label: string
  } | null>(null)

  // Shared-with-me inbox — loaded once on mount, refreshed when items are
  // accepted via the paste-link flow.
  const sharedInbox = useSharesStore((s) => s.inbox)
  const refreshShares = useSharesStore((s) => s.refresh)
  const sharesLoaded = useSharesStore((s) => s.loaded)
  const removeFromInbox = useSharesStore((s) => s.removeFromInbox)
  const outgoingShares = useSharesStore((s) => s.outgoing)
  const recipientsByEntity = useSharesStore((s) => s.recipientsByEntity)
  const account = useAccountStore((s) => s.account)
  const sessionToken = useAccountStore((s) => s.sessionToken)
  const [sharedOpen, setSharedOpen] = useState(true)

  // Entity ids the owner has shared OUT (active, non-revoked links) — drives a
  // "shared with others" avatar on the owner's own folders/tasks so it's clear
  // at a glance which items are shared. The avatar uses the owner's handle.
  const sharedOutIds = useMemo(
    () => new Set(outgoingShares.filter((s) => !s.revoked).map((s) => s.entityId)),
    [outgoingShares]
  )
  const ownerHandle = personDisplayName(
    account,
    (account?.email ? account.email.split('@')[0] : '') || 'You'
  )
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  // Reconstruct a shared copy-item into the recipient's own workspace and open
  // it. This is the action that actually delivers a shared folder/task — the
  // inbox row alone is just a notification.
  async function acceptIntoWorkspace(item: {
    id: string
    snapshot: unknown
    kind: string
  }): Promise<void> {
    if (acceptingId) return
    setAcceptingId(item.id)
    try {
      const res = await acceptShareIntoWorkspace(item.snapshot as ShareSnap)
      await refreshShares()
      await removeFromInbox(item.id)
      if (res.rootKind === 'folder') goProject(res.rootNodeId)
      else goTask(res.rootNodeId)
    } catch (err) {
      alert(`Could not add this to your workspace: ${(err as Error).message}`)
    } finally {
      setAcceptingId(null)
    }
  }
  useEffect(() => {
    if (!sharesLoaded) void refreshShares()
  }, [sharesLoaded, refreshShares])

  // Hook for the CommandCenter pill: "New" button dispatches a global
  // event so any sidebar mount can respond by opening the new-node
  // dialog. This avoids prop-drilling the dialog setter from App down
  // into the sidebar; either works, but the event keeps App.tsx lean.
  useEffect(() => {
    function onCmd(): void {
      setDialog({ mode: 'create', parentId: null, kind: 'folder' })
    }
    window.addEventListener('fb:command-new-task', onCmd)
    return () => window.removeEventListener('fb:command-new-task', onCmd)
  }, [])

  // Desk limit — a top-level folder IS a desk. Gate the visible "New
  // project" triggers so a free user at the limit gets the upgrade prompt
  // instead of an empty create dialog. (The nodes store also hard-blocks
  // creation on every path as a backstop.)
  const topLevelDeskCount = nodes.filter(
    (n) => n.parentId === null && n.kind === 'folder'
  ).length
  const canCreateDesk = useCanCreateMore('multiple_desks', topLevelDeskCount)
  function requestCreateDesk(): void {
    if (!canCreateDesk) {
      promptUpgrade(
        "You've reached your desk limit on the Free plan. Upgrade for unlimited desks.",
        'pro'
      )
      return
    }
    setDialog({ mode: 'create', parentId: null, kind: 'folder' })
  }

  const tree = useMemo(() => buildTree(visibleNodes), [visibleNodes])
  const flat = useMemo(() => flatten(tree, expanded), [tree, expanded])

  // Roving-tabindex keyboard navigation per the WAI-ARIA Tree pattern.
  // focusedNodeId is the single "tabbable" row; arrow keys move it without
  // requiring a click. Keeps the sidebar fully usable for anyone who can't
  // reliably hit a small chevron with a mouse (arthritis, tremor, motor-
  // accessibility-needs in general).
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Programmatically focus the row when focusedNodeId changes (via arrow
  // keys). Native click already focuses the row through tabIndex=0.
  useEffect(() => {
    if (!focusedNodeId) return
    rowRefs.current.get(focusedNodeId)?.focus()
  }, [focusedNodeId])

  // The flat array reflects the current visible list. Memoised so the key
  // handler can find a row's index in O(n) without re-allocating on every
  // keystroke.
  const flatIdById = useMemo(() => {
    const m = new Map<string, number>()
    flat.forEach((item, i) => m.set(item.node.id, i))
    return m
  }, [flat])

  function selectTask(id: string): void {
    setActive(id)
    goTask(id)
  }

  function selectProject(id: string, node?: FbNode): void {
    // Top-level folders are Rooms — clicking one opens the Room View (desk gallery).
    // Nested folders behave as before (project-dashboard canvas).
    if (node && node.parentId === null) {
      goRoom(id)
    } else {
      goProject(id)
    }
  }

  function archiveNode(id: string): void {
    void update(id, { archived: true })
    // Move focus away from a soon-to-be-hidden row so the keyboard nav
    // doesn't end up pointing at nothing.
    if (focusedNodeId === id) setFocusedNodeId(null)
  }

  // Keyboard handler attached to each tree row. Implements the WAI-ARIA
  // Tree pattern semantics: ↑/↓ to move focus, → to expand or descend,
  // ← to collapse or jump to parent, Enter/Space to activate, Esc to
  // unfocus, Home/End to jump to first/last visible row.
  //
  // This is the single most important keyboard-accessibility hook in the
  // app — making the sidebar fully usable without a mouse means anyone
  // with reduced fine-motor control can drive the whole workspace from
  // arrow keys + a confirm-key alone.
  function handleNodeKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>,
    item: TreeItem
  ): void {
    const node = item.node
    const isFolder = node.kind === 'folder'
    const hasChildren = item.children.length > 0
    const isExpanded = !!expanded[node.id]
    const idx = flatIdById.get(node.id) ?? 0
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = flat[Math.min(idx + 1, flat.length - 1)]
        if (next) setFocusedNodeId(next.node.id)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = flat[Math.max(idx - 1, 0)]
        if (prev) setFocusedNodeId(prev.node.id)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        // Two-step right-arrow per the ARIA pattern: collapsed folder
        // expands on first press; subsequent press dives into the first
        // child. Non-folder rows just no-op (consistent with screen-
        // reader expectations).
        if (isFolder && hasChildren) {
          if (!isExpanded) {
            toggleExpand(node.id)
          } else {
            setFocusedNodeId(flat[idx + 1]?.node.id ?? node.id)
          }
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        // Mirror of right-arrow: expanded folder collapses; collapsed
        // (or any non-folder) jumps focus to its parent row.
        if (isFolder && isExpanded) {
          toggleExpand(node.id)
        } else if (node.parentId) {
          setFocusedNodeId(node.parentId)
        }
        break
      }
      case 'Enter':
      case ' ': {
        e.preventDefault()
        if (isFolder) {
          if (hasChildren) toggleExpand(node.id)
          selectProject(node.id, node)
        } else {
          selectTask(node.id)
        }
        break
      }
      case 'Escape': {
        e.preventDefault()
        setFocusedNodeId(null)
        ;(e.currentTarget as HTMLElement).blur()
        break
      }
      case 'Home': {
        e.preventDefault()
        if (flat.length > 0) setFocusedNodeId(flat[0].node.id)
        break
      }
      case 'End': {
        e.preventDefault()
        if (flat.length > 0) setFocusedNodeId(flat[flat.length - 1].node.id)
        break
      }
      case 'Delete':
      case 'Backspace': {
        // Cmd/Ctrl+Delete archives; plain Delete is reserved for input
        // contexts (rename) so we don't trash a node on accidental keypress.
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          archiveNode(node.id)
        }
        break
      }
    }
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
    <SidebarCompact.Provider value={!!compact}>
    <aside className="m-2 flex flex-col overflow-hidden rounded-[18px] bg-[var(--surface-raised)]/96 backdrop-blur-2xl text-[var(--ink-100)] shadow-[0_2px_20px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.05)]" style={{ height: 'calc(100% - 16px)' }} data-testid="sidebar">
      {compact ? (
        /* Compact dock header — expand button at top (mirrors collapse button in full mode) */
        <>
          <div className="h-11 flex items-center justify-center shrink-0">
            {onExpand && (
              <button
                onClick={onExpand}
                title="Expand navigation panel"
                className="h-6 w-6 inline-flex items-center justify-center rounded-full text-[var(--ink-40)] hover:text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <Icon name="keyboard_double_arrow_right" size={13} />
              </button>
            )}
          </div>
          <div className="h-px bg-[var(--edge-soft)] mx-2 shrink-0" />
        </>
      ) : (
        <>
          {/* Header — wordmark + collapse button. Collapse button is always top-right
              so it mirrors the expand button in compact mode (also top). */}
          <div className="flex items-center gap-2 px-3 h-11 shrink-0">
            <span className="text-[12px] font-bold tracking-[0.18em] text-[var(--ink-50)] uppercase select-none">
              Plexi
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              {onCollapse && (
                <button
                  onClick={onCollapse}
                  title="Collapse panel (dock view)"
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[var(--ink-40)] hover:text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Icon name="keyboard_double_arrow_left" size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="h-px bg-[var(--edge-soft)] mx-3 shrink-0" />
        </>
      )}

      <div className={`flex-1 py-1 px-0.5 ${compact ? 'overflow-hidden' : 'overflow-auto'}`}>
        {!compact && (
          <>
            {/* The organisation switcher sits at the very top of the menu, next to
                the wordmark above. Switching org swaps the whole workspace. */}
            <OrgSwitcher />
            {/* One consistent area switcher at the top, the same one the Office /
                People / Brain menus show, so the nice contextual menu and its
                switcher live on every view, not only inside the segments. */}
            <SegmentSwitcher />
          </>
        )}

        {/* Desk nav — top items */}
        <div className="px-2 pt-2 pb-1 flex flex-col gap-0.5">
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
            icon="account_tree"
            label="Plans"
            active={viewIsActive({ kind: 'projects' })}
            onClick={() => {
              setActive(null)
              goProjects()
            }}
          />
          <NavRow
            icon="checklist"
            label="Tasks"
            active={viewIsActive({ kind: 'all-tasks' })}
            onClick={() => {
              setActive(null)
              goAllTasks()
            }}
          />
          {viewEnabled('calendar') && (
            <NavRow
              icon="calendar_month"
              label="Calendar"
              active={viewIsActive({ kind: 'calendar' })}
              onClick={() => {
                setActive(null)
                goCalendar()
              }}
            />
          )}
          {viewEnabled('files') && (
            <NavRow
              icon="folder"
              label="Files"
              active={viewIsActive({ kind: 'files' })}
              onClick={() => {
                setActive(null)
                goFiles()
              }}
            />
          )}
          {viewEnabled('vault') && (
            <NavRow
              icon="lock"
              label="Vault"
              active={viewIsActive({ kind: 'vault' })}
              onClick={() => {
                setActive(null)
                goVault()
              }}
            />
          )}
        </div>

        {/* Hairline separator */}
        <div className="h-px bg-[var(--edge-soft)] mx-3 my-1" />

        {/* Bottom nav items */}
        <div className="px-2 pb-1 flex flex-col gap-0.5">

        {/* ── SHARED WITH ME ─ */}
        <NavRow
          icon="folder_shared"
          label="Shared"
          onClick={compact
            ? () => { onExpand?.() }
            : () => setSharedOpen((v) => !v)
          }
          onChevron={compact ? undefined : () => setSharedOpen((v) => !v)}
          chevronOpen={sharedOpen}
        />
        </div>
        <AnimatePresence initial={false}>
          {sharedOpen && !compact && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mb-2 px-2">
                <div className="mb-1 px-2">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      const url = await promptText({
                        title: 'Paste a share link',
                        placeholder: 'https://focusbuddy-viewer.vercel.app/share/…',
                        confirmLabel: 'Add share'
                      })
                      if (!url) return
                      const m = url.match(/\/share\/([a-z0-9]+)/i)
                      if (!m) {
                        alert('That doesn\'t look like a PlexiDesk share link.')
                        return
                      }
                      try {
                        await useSharesStore.getState().acceptByToken(m[1])
                      } catch (err) {
                        alert(`Could not accept share: ${(err as Error).message}`)
                      }
                    }}
                    className="icon-btn !h-5 !w-5"
                    title="Paste a share link"
                  >
                    <Icon name="content_paste" size={12} />
                  </button>
                </div>
                {sharedInbox.length === 0 ? (
                  <div className="text-[11px] text-[var(--ink-70)] leading-relaxed px-2 py-2">
                    Items others share with you land here. Get a link from a
                    collaborator, then click the{' '}
                    <Icon
                      name="content_paste"
                      size={10}
                      className="inline mb-0.5"
                    />{' '}
                    button above to paste it.
                  </div>
                ) : (
                  <div role="list">
                    {sharedInbox.map((item) => {
                      const snap = item.snapshot as { title?: string; kind?: string } | null
                      const title = (snap && snap.title) || `Shared ${item.kind}`
                      return (
                        <div
                          key={item.id}
                          role="listitem"
                          className="group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[var(--surface-sunken)]"
                          title={`Shared by ${item.fromHandle}`}
                        >
                          <Icon
                            name={
                              item.kind === 'folder'
                                ? 'folder_shared'
                                : item.kind === 'task'
                                  ? 'assignment_ind'
                                  : 'widgets'
                            }
                            size={14}
                            className="text-accent shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-[var(--ink-90)] truncate">
                              {title}
                            </div>
                            <div className="text-[9px] text-[var(--ink-50)] truncate font-mono">
                              {item.fromHandle} ·{' '}
                              {item.scope === 'copy' ? 'can copy' : 'view only'}
                            </div>
                          </div>
                          {item.scope === 'copy' && (
                            <button
                              onClick={() => void acceptIntoWorkspace(item)}
                              disabled={acceptingId === item.id}
                              className="icon-btn !h-5 !w-5 text-accent disabled:opacity-50"
                              title="Add to my workspace"
                            >
                              <Icon
                                name={acceptingId === item.id ? 'hourglass_empty' : 'add_to_photos'}
                                size={12}
                              />
                            </button>
                          )}
                          <button
                            onClick={() => void removeFromInbox(item.id)}
                            className="icon-btn !h-5 !w-5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                            title="Remove from Shared with me"
                          >
                            <Icon name="close" size={11} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── DESKS / ROOMS ──────────────────────────────── */}
        <div className="px-2 pb-1 flex flex-col gap-0.5">
        <NavRow
          icon="workspaces"
          label="Rooms"
          active={view.kind === 'room' || view.kind === 'rooms'}
          onClick={compact
            ? () => { onExpand?.(); setProjectsOpen(true) }
            : () => { setActive(null); goRooms() }
          }
          onChevron={compact ? undefined : () => setProjectsOpen((v) => !v)}
          chevronOpen={projectsOpen}
          action={
            <button
              onClick={(e) => {
                e.stopPropagation()
                requestCreateDesk()
              }}
              className="icon-btn !h-5 !w-5"
              title="New top-level project"
            >
              <Icon name="add" size={12} />
            </button>
          }
        />
        </div>
        <AnimatePresence initial={false}>
        {projectsOpen && !compact && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
          <div className="mb-2" role="tree" aria-label="Projects and tasks">
            {flat.length === 0 && nodesError && (
              <div className="px-4 py-3 text-xs text-amber-600 dark:text-amber-400 leading-relaxed" data-testid="sidebar-nodes-error">
                Your workspaces could not be loaded just now. Your data is safe on this
                device.{' '}
                <button
                  onClick={() => void refreshNodes()}
                  className="underline hover:text-[var(--ink-100)]"
                >
                  Try again
                </button>
              </div>
            )}
            {flat.length === 0 && !nodesError && nodesLoaded && (
              <div className="px-4 py-3 text-xs text-[var(--ink-70)] leading-relaxed">
                No projects yet.{' '}
                <button
                  onClick={requestCreateDesk}
                  className="underline hover:text-[var(--ink-100)]"
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
                ? (node.parentId === null
                    ? (view.kind === 'room' && view.roomId === node.id)
                    : viewIsActive({ kind: 'project-dashboard', projectId: node.id }))
                : viewIsActive({ kind: 'task', taskId: node.id })
              const isRenaming = renamingId === node.id
              const isDragging = draggingIdRef.current === node.id
              const isDropTarget = dropTarget?.id === node.id
              const dropPos = isDropTarget ? dropTarget.position : null
              // Roving-tabindex: only the focused row is in the tab order.
              // Every other row is reachable via arrow keys once focus is
              // inside the tree, but not via Tab from outside (which would
              // be n-keystrokes to skip past).
              const isFocused = focusedNodeId === node.id
              return (
                <div
                  key={node.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(node.id, el)
                    else rowRefs.current.delete(node.id)
                  }}
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-expanded={isFolder ? isOpen : undefined}
                  aria-selected={isActive}
                  tabIndex={
                    // First row in the tree gets tabIndex 0 by default so
                    // the user has an entry point; otherwise only the
                    // explicitly focused row is tabbable.
                    isFocused ||
                    (focusedNodeId === null && flat[0]?.node.id === node.id)
                      ? 0
                      : -1
                  }
                  onFocus={() => setFocusedNodeId(node.id)}
                  onKeyDown={(e) => handleNodeKeyDown(e, item)}
                  style={{
                    paddingLeft: `${depth * 10 + 6}px`,
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
                  className={`relative group flex items-center pr-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:bg-accent/[0.06] ${
                    isActive && !isDropTarget ? 'bg-[rgb(var(--accent)/0.08)]' : ''
                  }`}
                  onDragOver={(e) => handleRowDragOver(e, node)}
                  onDragLeave={(e) => handleRowDragLeave(e, node)}
                  onDrop={(e) => void handleRowDrop(e, node)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setRowCtxMenu({ x: e.clientX, y: e.clientY, node })
                  }}
                >
                  {isActive && (
                    <span className="absolute left-0 h-6 w-[3px] rounded-r bg-accent" />
                  )}
                  <button
                    onClick={() => hasChildren && toggleExpand(node.id)}
                    className={`w-4 h-4 flex items-center justify-center text-[var(--ink-40)] hover:text-[var(--ink-80)] transition-colors shrink-0 ${
                      hasChildren ? '' : 'invisible'
                    }`}
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                  >
                    <Icon name={isOpen ? 'expand_more' : 'chevron_right'} size={13} />
                  </button>
                  <div
                    draggable={!isRenaming}
                    onDragStart={(e) => handleRowDragStart(e, node)}
                    onDragEnd={handleRowDragEnd}
                    onClick={() => {
                      if (isRenaming) return
                      if (isFolder) {
                        // Folder rows now toggle expand AND navigate. The
                        // caret-only path was tiny and hard to hit reliably;
                        // putting both actions on the row makes the whole
                        // folder a single fluid click target.
                        if (hasChildren) toggleExpand(node.id)
                        selectProject(node.id, node)
                      } else {
                        selectTask(node.id)
                      }
                    }}
                    onDoubleClick={() => {
                      setRenamingId(node.id)
                      setRenameText(node.title)
                    }}
                    className={`flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded min-w-0 ${
                      isRenaming ? '' : 'cursor-grab active:cursor-grabbing'
                    } ${
                      !isActive ? 'hover:bg-[var(--surface-sunken)]' : ''
                    }`}
                  >
                    <Icon
                      name={
                        isFolder
                          ? (node.parentId === null ? 'grid_view' : 'workspaces')
                          : node.status === 'done'
                            ? 'check_circle'
                            : 'sticky_note_2'
                      }
                      size={14}
                      filled={isActive}
                      className={
                        isFolder
                          ? (isActive ? 'text-[rgb(var(--accent))]' : 'text-[var(--ink-50)]')
                          : node.status === 'done'
                            ? 'text-emerald-600'
                            : node.status === 'in_progress'
                              ? 'text-blue-600'
                              : 'text-[var(--ink-40)]'
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
                        className={`${fieldInputClass()} flex-1 !px-1.5 !py-0.5`}
                      />
                    ) : (
                      <>
                        <span
                          className={`text-[12.5px] truncate flex-1 leading-tight ${
                            isActive
                              ? 'text-[var(--ink-100)] font-semibold'
                              : 'text-[var(--ink-80)]'
                          } ${node.status === 'done' ? 'line-through text-[var(--ink-40)]' : ''}`}
                        >
                          {node.title}
                        </span>
                        {node.sharedFromHandle ? (
                          <SharedBadge handle={node.sharedFromHandle} />
                        ) : recipientsByEntity[node.id]?.length ? (
                          <SharedRecipientBadges recipients={recipientsByEntity[node.id]} />
                        ) : (
                          sharedOutIds.has(node.id) && (
                            <SharedBadge
                              handle={ownerHandle}
                              label="Shared with others"
                              testid="shared-out-badge"
                            />
                          )
                        )}
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
                          // Same StatusPill tone mapping as AllTasksView: rose
                          // (busy) overdue, amber (away) soon, neutral otherwise.
                          return (
                            <span
                              className="shrink-0"
                              title={`Due ${new Date(node.dueDate).toLocaleDateString()}`}
                            >
                              <StatusPill
                                tone={overdue ? 'busy' : soon ? 'away' : 'offline'}
                                label={label}
                              />
                            </span>
                          )
                        })()}
                      </>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center transition-opacity">
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
                      onClick={() => archiveNode(node.id)}
                      title={`Archive ${isFolder ? 'folder' : 'task'} (Cmd+Delete) — recoverable from Home → Archived`}
                      className="icon-btn"
                    >
                      <Icon name="inventory_2" size={14} />
                    </button>
                    <button
                      onClick={() => {
                        // This is the genuinely irreversible delete (Archive
                        // above is the recoverable one), so it gets the styled
                        // danger confirm rather than the bare native box.
                        void confirmDialog({
                          title: `Delete "${node.title}" permanently?`,
                          body: isFolder
                            ? 'This folder and everything inside it are removed for good. Use Archive instead if you might want it back.'
                            : 'This task is removed for good. Use Archive instead if you might want it back.',
                          confirmLabel: 'Delete permanently',
                          danger: true
                        }).then((ok) => {
                          if (ok) void remove(node.id)
                        })
                      }}
                      title="Delete permanently"
                      className="icon-btn hover:!text-rose-600"
                    >
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* ── CONNECTED APPS ────────────────────────────────────────────── */}
        <div className="px-2 pb-1 flex flex-col gap-0.5">
        <NavRow
          icon="apps"
          label="Connected Apps"
          onClick={() => setAppsOpen((v) => !v)}
          onChevron={() => setAppsOpen((v) => !v)}
          chevronOpen={appsOpen}
        />
        </div>
        <AnimatePresence initial={false}>
        {appsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
          <div className="mb-2">
            {connectedApps.length === 0 ? (
              <div className="mx-3 mb-2 rounded-md border border-dashed border-[var(--edge-soft)] p-3 text-center">
                <Icon
                  name="apps"
                  size={18}
                  className="text-[var(--ink-40)] mx-auto mb-1"
                />
                <p className="text-[11px] text-[var(--ink-40)] leading-snug mb-2">
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
                  }, compact)
                )}
                {moreApps.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMoreAppsOpen((v) => !v)}
                      className={compact
                        ? 'w-full h-9 flex items-center justify-center text-[var(--ink-40)] hover:text-[var(--ink-70)] transition-colors'
                        : 'w-full mt-1 px-3 py-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--ink-50)] hover:text-[var(--ink-90)]'
                      }
                      title={compact ? `More apps (${moreApps.length})` : undefined}
                    >
                      <Icon
                        name={moreAppsOpen ? 'expand_less' : 'more_horiz'}
                        size={compact ? 16 : 12}
                      />
                      {!compact && <span>More apps ({moreApps.length})</span>}
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
                        }, compact)
                      )}
                  </>
                )}
              </>
            )}
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Pro card — hidden in compact mode */}
      {!compact && (
        <div className="px-3 pt-2">
          <div className="rounded-xl border border-[rgb(var(--accent)/0.3)] bg-[rgb(var(--accent)/0.06)] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon name="auto_awesome" size={14} className="text-[rgb(var(--accent))]" />
              <span className="text-[12px] font-semibold">PlexiDesk Pro</span>
            </div>
            <button
              onClick={() => promptUpgrade('PlexiDesk Pro')}
              className="w-full h-7 rounded-lg bg-[rgb(var(--accent))] text-white text-[11.5px] font-medium hover:bg-[rgb(var(--accent-hover))]"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      )}

      {/* Footer — sync indicator (collapse button moved to header for consistency) */}
      {!compact && (
        <div className="mt-auto px-3 pb-3 pt-2 border-t border-[var(--edge-soft)]/60 flex items-center">
          <SyncIndicator />
        </div>
      )}

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
      {rowCtxMenu && (
        <CanvasContextMenu
          x={rowCtxMenu.x}
          y={rowCtxMenu.y}
          items={[
            {
              label: 'Share…',
              icon: 'share',
              onClick: () => {
                setShareTarget({
                  kind: rowCtxMenu.node.kind === 'folder' ? 'folder' : 'task',
                  entityId: rowCtxMenu.node.id,
                  label: rowCtxMenu.node.title || '(untitled)'
                })
              }
            },
            // Live collaboration is a per-desk (task) capability — a whole board
            // checked out under the same lock/takeover model as live documents.
            // Folders get their own live-collaboration surface in a later pass.
            ...(rowCtxMenu.node.kind === 'task'
              ? [
                  {
                    label: 'Collaborate live',
                    icon: 'group',
                    onClick: () => {
                      const node = rowCtxMenu.node
                      void (async () => {
                        if (!sessionToken) {
                          promptUpgrade(
                            'Sign in to collaborate live on a desk with others.',
                            'pro'
                          )
                          return
                        }
                        const liveId = await promoteToLiveCanvas(node, sessionToken)
                        if (liveId) goLiveCanvas(liveId)
                      })()
                    }
                  }
                ]
              : []),
            { separator: true },
            {
              label: 'Rename',
              icon: 'edit',
              onClick: () => {
                setRenamingId(rowCtxMenu.node.id)
                setRenameText(rowCtxMenu.node.title)
              }
            },
            {
              label: 'Archive',
              icon: 'inventory_2',
              onClick: () => archiveNode(rowCtxMenu.node.id)
            }
          ] as CtxMenuItem[]}
          onClose={() => setRowCtxMenu(null)}
        />
      )}
      {shareTarget && (
        <ShareDialog
          kind={shareTarget.kind}
          entityId={shareTarget.entityId}
          label={shareTarget.label}
          onClose={() => setShareTarget(null)}
        />
      )}
    </aside>
    </SidebarCompact.Provider>
  )
}

function NavRow({ icon, label, active, onClick, onChevron, chevronOpen, action }: {
  icon: string; label: string; active?: boolean; onClick: () => void;
  onChevron?: () => void; chevronOpen?: boolean; action?: React.ReactNode
}): JSX.Element {
  const isCompact = useContext(SidebarCompact)
  if (isCompact) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={[
          'relative w-full h-10 flex items-center justify-center rounded-xl transition-colors select-none',
          active
            ? 'bg-[rgb(var(--accent)/0.10)] text-[rgb(var(--accent))]'
            : 'text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-90)]'
        ].join(' ')}
      >
        {active && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-[rgb(var(--accent))]" />}
        <Icon name={icon} size={17} className="shrink-0" />
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={[
        'relative w-full flex items-center gap-2.5 h-9 px-3 rounded-xl text-[13px] font-medium transition-colors select-none',
        active
          ? 'bg-[rgb(var(--accent)/0.10)] text-[rgb(var(--accent))]'
          : 'text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-90)]'
      ].join(' ')}
    >
      {active && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-[rgb(var(--accent))]" />}
      <Icon name={icon} size={15} className="shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {onChevron && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onChevron() }}
          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <Icon name="expand_more" size={13} className={`transition-transform duration-200 ${chevronOpen ? '' : '-rotate-90'}`} />
        </span>
      )}
      {action && !onChevron && action}
    </button>
  )
}
