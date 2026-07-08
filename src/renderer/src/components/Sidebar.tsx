import { useEffect, useMemo, useState } from 'react'
import type { ConnectedApp, FbNode, NodeKind, WidgetSuggestion } from '@shared/types'
import { useNodeStore } from '../stores/nodes'
import { promptUpgrade } from '../stores/upgradePrompt'
import { useWidgetStore } from '../stores/widgets'
import { useConnectedAppsStore } from '../stores/connectedApps'
import SyncIndicator from './SyncIndicator'
import { useViewStore, type View } from '../stores/view'
import { catalogFor, WIDGET_CATALOG, DRAG_MIME } from '../lib/widgetCatalog'
import SegmentSwitcher from './segment/SegmentSwitcher'
import OrgSwitcher from './OrgSwitcher'
import { useViewKindEnabled } from '../lib/viewCapability'

// What you can drag onto the desk from the sidebar when a desk is open: the common
// widgets AND the office things (a doc, sheet, slides or a drawing), so you can pull
// both straight onto the canvas. The full widget set still lives in the on-canvas
// palette.
const DESK_WIDGET_KINDS = new Set([
  'doc',
  'sheet',
  'slides',
  'scratchpad',
  'sticky',
  'note',
  'timer',
  'task-link',
  'calculator',
  'image',
  'page',
  'file'
])
import { chimeIn } from '../lib/audioBeep'
import { splitFavourites } from '../lib/connectedAppSort'
import NewNodeDialog from './NewNodeDialog'
import AISetupDialog from './AISetupDialog'
import AddConnectedAppDialog from './AddConnectedAppDialog'
import { useSharesStore } from '../stores/shares'
import Icon from './Icon'
import { FLOATING_MENU_ASIDE, FLOATING_MENU_STYLE, MenuMinimizeButton } from './chrome/floatingMenu'

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

interface Props {
  onCollapse?: () => void
}

export default function Sidebar({ onCollapse }: Props = {}): JSX.Element {
  const setActive = useNodeStore((s) => s.setActive)
  const createWidget = useWidgetStore((s) => s.create)
  const bumpLayout = useWidgetStore((s) => s.bumpLayoutVersion)
  const view = useViewStore((s) => s.view)
  const goHome = useViewStore((s) => s.goHome)
  const goAllTasks = useViewStore((s) => s.goAllTasks)
  const goCalendar = useViewStore((s) => s.goCalendar)
  const goProjects = useViewStore((s) => s.goProjects)
  const goRooms = useViewStore((s) => s.goRooms)
  const goDesks = useViewStore((s) => s.goDesks)
  const goShared = useViewStore((s) => s.goShared)
  const goFiles = useViewStore((s) => s.goFiles)
  const goConnectedApp = useViewStore((s) => s.goConnectedApp)
  const goVault = useViewStore((s) => s.goVault)

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

  // Section collapse state for the remaining sections.
  const [roomsNavOpen, setRoomsNavOpen] = useState(true)
  const [appsOpen, setAppsOpen] = useState(true)

  // Shared-with-me inbox — loaded once on mount, drives the "Shared" nav badge.
  const sharedInbox = useSharesStore((s) => s.inbox)
  const refreshShares = useSharesStore((s) => s.refresh)
  const sharesLoaded = useSharesStore((s) => s.loaded)

  useEffect(() => {
    if (!sharesLoaded) void refreshShares()
  }, [sharesLoaded, refreshShares])

  // Hook for the CommandCenter pill: "New" button dispatches a global
  // event so any sidebar mount can respond by opening the new-node
  // dialog. This avoids prop-drilling the dialog setter from App down
  // into the sidebar; either works, but the event keeps App.tsx lean.
  useEffect(() => {
    function onCmd(): void {
      setDialog({ mode: 'create', parentId: null, kind: 'task' })
    }
    window.addEventListener('fb:command-new-task', onCmd)
    return () => window.removeEventListener('fb:command-new-task', onCmd)
  }, [])

  // The header "New" now creates a Desk (a canvas). The create dialog lets the
  // user file it into any Room via its searchable Room picker, or leave it at the
  // top level. Rooms are created from the All rooms page (the store still caps
  // top-level Rooms on the free tier as a backstop). Desks are not capped.
  function requestCreateDesk(): void {
    setDialog({ mode: 'create', parentId: null, kind: 'task' })
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
    <aside className={FLOATING_MENU_ASIDE} style={FLOATING_MENU_STYLE} data-testid="desk-sidebar">
      {/* Header — same silhouette as the PlexiOffice menu: the wordmark on the
          left, then the desk's own actions (New desk, hide) on the right. */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--edge-soft)]">
        <span className="text-[15px] font-bold tracking-[0.14em] text-[var(--ink-100)]">PLEXIDESK</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={requestCreateDesk}
            title="New room"
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[rgb(var(--accent))] text-white text-[12px] font-medium hover:bg-[rgb(var(--accent-hover))]"
          >
            <Icon name="add" size={14} />
            <span>New</span>
          </button>
          {onCollapse && (
            <MenuMinimizeButton onClick={onCollapse} title="Minimise the menu to free the desk" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {/* The organisation switcher sits at the very top of the menu, next to
            the wordmark above. Switching org swaps the whole workspace. */}
        <OrgSwitcher />
        {/* One consistent area switcher at the top, the same one the Office /
            People / Brain menus show, so the nice contextual menu and its
            switcher live on every view, not only inside the segments. */}
        <SegmentSwitcher />

        {/* Desk nav — one clean, single list in the same style as the Office /
            People / Brain menus, not a stack of labelled sections. */}
        <div className="px-2 pt-1 pb-2">
          <NavRow
            icon="dashboard"
            label="Home"
            tint="bg-indigo-500"
            active={viewIsActive({ kind: 'home' })}
            onClick={() => {
              setActive(null)
              goHome()
            }}
          />
          {/* Rooms — the workspace organiser. Clicking opens All Rooms; the
              chevron expands to the two index pages (All Rooms, All Desks). */}
          <div className="flex items-center">
            <div className="flex-1 min-w-0">
              <NavRow
                icon="meeting_room"
                label="Rooms"
                tint="bg-sky-500"
                active={viewIsActive({ kind: 'rooms' }) || viewIsActive({ kind: 'desks' })}
                onClick={() => {
                  setActive(null)
                  goRooms()
                }}
              />
            </div>
            <button
              onClick={() => setRoomsNavOpen((v) => !v)}
              title={roomsNavOpen ? 'Collapse' : 'Expand'}
              className="icon-btn !h-6 !w-6 shrink-0 -ml-1"
            >
              <Icon name={roomsNavOpen ? 'expand_more' : 'chevron_right'} size={16} />
            </button>
          </div>
          {roomsNavOpen && (
            <div className="ml-4 pl-2 border-l border-[var(--edge-soft)]">
              <NavRow
                icon="grid_view"
                label="All rooms"
                tint="bg-sky-400"
                active={viewIsActive({ kind: 'rooms' })}
                onClick={() => {
                  setActive(null)
                  goRooms()
                }}
              />
              <NavRow
                icon="desk"
                label="All desks"
                tint="bg-teal-500"
                active={viewIsActive({ kind: 'desks' })}
                onClick={() => {
                  setActive(null)
                  goDesks()
                }}
              />
              <NavRow
                icon="folder_shared"
                label="Shared"
                tint="bg-fuchsia-500"
                active={viewIsActive({ kind: 'shared' })}
                badge={sharedInbox.length ? String(sharedInbox.length) : undefined}
                onClick={() => {
                  setActive(null)
                  goShared()
                }}
              />
            </div>
          )}
          <NavRow
            icon="account_tree"
            label="Plans"
            tint="bg-violet-500"
            active={viewIsActive({ kind: 'projects' })}
            onClick={() => {
              setActive(null)
              goProjects()
            }}
          />
          <NavRow
            icon="checklist"
            label="Tasks"
            tint="bg-emerald-500"
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
              tint="bg-amber-500"
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
              tint="bg-orange-500"
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
              tint="bg-rose-500"
              active={viewIsActive({ kind: 'vault' })}
              onClick={() => {
                setActive(null)
                goVault()
              }}
            />
          )}
        </div>

        {/* ── ADD TO DESK — while a desk is open (a task or a folder-desk, both
            canvases now); drag a widget or an office thing (doc / sheet / slides /
            draw) straight onto the canvas ── */}
        {(view.kind === 'task' || view.kind === 'project-dashboard') && (
          <div className="mb-1" data-testid="sidebar-widgets">
            <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-40)] font-semibold">
              <Icon name="widgets" size={13} />
              <span>Add to desk</span>
              <span className="ml-auto normal-case tracking-normal text-[var(--ink-40)]">drag onto desk</span>
            </div>
            <div className="grid grid-cols-4 gap-1 px-2">
              {WIDGET_CATALOG.filter((e) => DESK_WIDGET_KINDS.has(e.kind)).map((entry) => (
                <button
                  key={entry.kind}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, entry.kind)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  data-testid={`sidebar-widget-${entry.kind}`}
                  title={`Drag ${entry.label} onto the desk`}
                  className="flex flex-col items-center gap-1 py-2 rounded-lg text-[9.5px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] cursor-grab active:cursor-grabbing"
                >
                  <Icon name={entry.icon} size={16} className="text-accent" />
                  <span className="truncate max-w-full leading-none">{entry.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documents, Inbox, Messages, Mail and PlexiSign live in the PlexiOffice
            area; Files and Vault are in the Desk nav above. */}


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
                  })
                )}
                {moreApps.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMoreAppsOpen((v) => !v)}
                      className="w-full mt-1 px-3 py-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--ink-50)] hover:text-[var(--ink-90)]"
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

      {/* Pro card — the same upgrade block that sits at the foot of the
          PlexiOffice menu, so every area's menu ends the same way. */}
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

      {/* Footer — sync indicator. Stays pinned to the bottom of the
          sidebar regardless of scroll position above. */}
      <SyncIndicator />

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
  // The same quiet uppercase section label the PlexiOffice menu uses for its
  // "Apps" / "Communicate" groups, with a chevron so the group still folds.
  return (
    <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-40)] hover:text-[var(--ink-70)] transition-colors"
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
  tint: string
  active: boolean
  onClick: () => void
  badge?: string
  testid?: string
}

function NavRow({ icon, label, tint, active, onClick, badge, testid }: NavRowProps): JSX.Element {
  // Same row as the PlexiOffice menu's app rows: a coloured rounded square with a
  // white icon, then the label, and a soft accent fill when the row is active.
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] mb-0.5 text-left transition-colors ${
        active
          ? 'bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))] font-medium'
          : 'text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-white shrink-0 ${tint}`}>
        <Icon name={icon} size={14} />
      </span>
      <span className="flex-1 min-w-0 break-words leading-tight">{label}</span>
      {badge && (
        <span className="ml-auto text-[10px] fb-tabular text-[var(--ink-50)]">{badge}</span>
      )}
    </button>
  )
}
