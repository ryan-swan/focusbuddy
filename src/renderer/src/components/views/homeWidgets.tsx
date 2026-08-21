import { useMemo } from 'react'
import { useViewStore } from '../../stores/view'
import { useNodeStore } from '../../stores/nodes'
import { useDocumentsStore } from '../../stores/documents'
import { useConnectedAppsStore } from '../../stores/connectedApps'
import { useFocusSessionStore } from '../../stores/focusSession'
import { splitFavourites } from '../../lib/connectedAppSort'
import { RailCard } from '../plexi'
import Icon from '../Icon'
import AppLogo from '../AppLogo'
import type { ActivityEvent, FbNode } from '@shared/types'

// The home widget catalog — registry metadata for the gallery, plus the widget
// components that are not part of the original dashboard set. Every widget
// reads real stores directly and shows an honest empty state; nothing is
// seeded or invented. The original seven (standup, navigator, continue,
// agenda, pulse, quick, activity) render inside HomeDashboard, which owns
// their imperatively-loaded data.

export type HomeWidgetId =
  | 'standup'
  | 'navigator'
  | 'continue'
  | 'agenda'
  | 'pulse'
  | 'quick'
  | 'activity'
  | 'pinned-desk'
  | 'room-portal'
  | 'quick-links'
  | 'app-launcher'
  | 'create'
  | 'overdue'
  | 'focus-timer'
  | 'one-thing'
  | 'where-was-i'
  | 'stalled'

export interface HomeWidgetConfig {
  deskId?: string
  roomId?: string
  routes?: string[]
}

export interface HomeWidgetInstance {
  key: string
  widget: HomeWidgetId
  config?: HomeWidgetConfig
}

export interface HomeWidgetDef {
  id: HomeWidgetId
  name: string
  blurb: string
  icon: string
  tint: string
  category: 'Navigation' | 'Live' | 'Actions' | 'Smart'
  // Multi-instance widgets (a pinned desk per desk, a portal per room). All
  // others are singletons: the gallery shows them as Added once placed.
  multi?: boolean
  // Which picker must run before this widget can be placed.
  config?: 'desk' | 'room' | 'links'
  defaultCol: 'main' | 'rail'
}

export const HOME_WIDGET_DEFS: HomeWidgetDef[] = [
  // Live
  { id: 'standup', name: 'Standup', blurb: 'Your look-back and look-forward narrative for the day', icon: 'auto_awesome', tint: 'bg-accent/10 text-accent', category: 'Live', defaultCol: 'main' },
  { id: 'agenda', name: "Today's agenda", blurb: 'The time blocks on your calendar today', icon: 'calendar_today', tint: 'bg-sky-500/10 text-sky-500', category: 'Live', defaultCol: 'rail' },
  { id: 'pulse', name: 'Pulse', blurb: 'Open, due, and overdue counts at a glance', icon: 'monitoring', tint: 'bg-violet-500/10 text-violet-500', category: 'Live', defaultCol: 'rail' },
  { id: 'continue', name: 'Continue', blurb: 'The documents you touched most recently', icon: 'history', tint: 'bg-accent/10 text-accent', category: 'Live', defaultCol: 'main' },
  { id: 'activity', name: 'Recent activity', blurb: 'The workspace activity trail from the last week', icon: 'bolt', tint: 'bg-accent/10 text-accent', category: 'Live', defaultCol: 'rail' },
  { id: 'overdue', name: 'Overdue radar', blurb: 'Only the tasks past their due date. Empty is the goal', icon: 'priority_high', tint: 'bg-rose-500/10 text-rose-500', category: 'Live', defaultCol: 'rail' },
  // Navigation
  { id: 'navigator', name: 'Rooms and desks', blurb: 'Browse rooms on the left, their desks open to the right', icon: 'meeting_room', tint: 'bg-sky-500/10 text-sky-500', category: 'Navigation', defaultCol: 'main' },
  { id: 'pinned-desk', name: 'Pinned desk', blurb: 'One desk you care about, one click away', icon: 'push_pin', tint: 'bg-violet-500/10 text-violet-500', category: 'Navigation', multi: true, config: 'desk', defaultCol: 'rail' },
  { id: 'room-portal', name: 'Room portal', blurb: 'A single room and the desks inside it', icon: 'door_open', tint: 'bg-teal-500/10 text-teal-500', category: 'Navigation', multi: true, config: 'room', defaultCol: 'main' },
  { id: 'quick-links', name: 'Quick links', blurb: 'Your own row of shortcuts to the places you use most', icon: 'link', tint: 'bg-indigo-500/10 text-indigo-500', category: 'Navigation', config: 'links', defaultCol: 'rail' },
  { id: 'app-launcher', name: 'App launcher', blurb: 'Your favourite connected apps with their real logos', icon: 'apps', tint: 'bg-emerald-500/10 text-emerald-500', category: 'Navigation', defaultCol: 'rail' },
  // Actions
  { id: 'quick', name: 'Quick actions', blurb: 'Create, plan, collaborate, automate', icon: 'bolt', tint: 'bg-emerald-500/10 text-emerald-500', category: 'Actions', defaultCol: 'rail' },
  { id: 'create', name: 'Create new', blurb: 'Start a document, spreadsheet, deck, or desk in one tap', icon: 'add_circle', tint: 'bg-accent/10 text-accent', category: 'Actions', defaultCol: 'rail' },
  { id: 'focus-timer', name: 'Focus timer', blurb: 'Start and stop the five minute promise from home', icon: 'timer', tint: 'bg-violet-500/10 text-violet-500', category: 'Actions', defaultCol: 'rail' },
  // Smart
  { id: 'one-thing', name: 'One thing now', blurb: 'The single most pressing task. No list, just the one', icon: 'target', tint: 'bg-amber-500/10 text-amber-600', category: 'Smart', defaultCol: 'main' },
  { id: 'where-was-i', name: 'Where was I', blurb: 'Your last working context, with one button: Resume', icon: 'undo', tint: 'bg-sky-500/10 text-sky-500', category: 'Smart', defaultCol: 'main' },
  { id: 'stalled', name: 'Stalled desk', blurb: 'The in-progress desk that has waited longest for you', icon: 'hourglass_bottom', tint: 'bg-orange-500/10 text-orange-500', category: 'Smart', defaultCol: 'rail' }
]

export function widgetDef(id: HomeWidgetId): HomeWidgetDef {
  return HOME_WIDGET_DEFS.find((d) => d.id === id) ?? HOME_WIDGET_DEFS[0]
}

// The route catalog Quick Links composes from. Each id is stable and stored in
// the widget's config; icons and tones mirror the sidebar so the shortcuts
// read as the same destinations.
export interface QuickLinkRoute {
  id: string
  label: string
  icon: string
  tone: string
}
export const QUICK_LINK_ROUTES: QuickLinkRoute[] = [
  { id: 'rooms', label: 'Rooms', icon: 'meeting_room', tone: 'text-sky-500' },
  { id: 'desks', label: 'Desks', icon: 'desk', tone: 'text-teal-500' },
  { id: 'shared', label: 'Shared', icon: 'folder_shared', tone: 'text-fuchsia-500' },
  { id: 'plans', label: 'Plans', icon: 'account_tree', tone: 'text-violet-500' },
  { id: 'tasks', label: 'Tasks', icon: 'checklist', tone: 'text-emerald-500' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar_month', tone: 'text-amber-500' },
  { id: 'documents', label: 'Documents', icon: 'description', tone: 'text-sky-500' },
  { id: 'files', label: 'Files', icon: 'folder', tone: 'text-orange-500' },
  { id: 'vault', label: 'Vault', icon: 'plexii:vault', tone: 'text-rose-500' }
]

function relTime(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const hrs = Math.round(m / 60)
  if (hrs < 24) return `${hrs}h ago`
  const d = Math.round(hrs / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <p className="py-4 text-center text-[12px] text-[var(--ink-50)]">{text}</p>
}

function useOpenDesk(): (n: FbNode) => void {
  const v = useViewStore()
  const setActive = useNodeStore((s) => s.setActive)
  return (n) => {
    if (n.kind === 'folder') {
      setActive(null)
      v.goPlexiDesk()
      return
    }
    setActive(n.id)
    v.goTask(n.id)
  }
}

// ── Navigation ───────────────────────────────────────────────────────────────

export function PinnedDeskWidget({ deskId }: { deskId?: string }): JSX.Element {
  const node = useNodeStore((s) => s.nodes.find((n) => n.id === deskId) ?? null)
  const openDesk = useOpenDesk()
  return (
    <RailCard title="Pinned desk" icon="push_pin" tone="violet">
      {!node || node.archived ? (
        <EmptyState text="This desk is gone. Remove the widget or pin another." />
      ) : (
        <button
          onClick={() => openDesk(node)}
          data-testid={`home-pinned-desk-${node.id}`}
          className="flex w-full items-center gap-3 fb-tile fb-press px-3 py-2.5 text-left"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
            <Icon name={node.kind === 'folder' ? 'folder' : 'desk'} size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate fb-t-body font-medium text-[var(--ink-100)]">
              {node.title || 'Untitled desk'}
            </span>
            <span className="block fb-t-caption">Edited {relTime(node.updatedAt)}</span>
          </span>
          <Icon name="chevron_right" size={16} className="text-[var(--ink-40)] shrink-0" />
        </button>
      )}
    </RailCard>
  )
}

export function RoomPortalWidget({ roomId }: { roomId?: string }): JSX.Element {
  const room = useNodeStore((s) => s.nodes.find((n) => n.id === roomId) ?? null)
  const nodes = useNodeStore((s) => s.nodes)
  const openDesk = useOpenDesk()
  const desks = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === 'task' && !n.archived && n.parentId === roomId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6),
    [nodes, roomId]
  )
  return (
    <RailCard
      title={room && !room.archived ? room.title || 'Untitled room' : 'Room portal'}
      icon="door_open"
      tone="sky"
    >
      {!room || room.archived ? (
        <EmptyState text="This room is gone. Remove the widget or open another." />
      ) : desks.length === 0 ? (
        <EmptyState text="No desks in this room yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid={`home-room-portal-${room.id}`}>
          {desks.map((n) => (
            <button
              key={n.id}
              onClick={() => openDesk(n)}
              className="flex items-center gap-2.5 fb-tile fb-press px-2.5 py-2 text-left"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500 shrink-0">
                <Icon name="desk" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate fb-t-body text-[var(--ink-100)]">{n.title || 'Untitled desk'}</span>
                <span className="block fb-t-caption">Edited {relTime(n.updatedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </RailCard>
  )
}

export function QuickLinksWidget({ routes }: { routes?: string[] }): JSX.Element {
  const v = useViewStore()
  const picked = (routes ?? []).map((id) => QUICK_LINK_ROUTES.find((r) => r.id === id)).filter(Boolean) as QuickLinkRoute[]
  const go = (id: string): void => {
    switch (id) {
      case 'rooms': v.goRooms(); break
      case 'desks': v.goDesks(); break
      case 'shared': v.goShared(); break
      case 'plans': v.goProjects(); break
      case 'tasks': v.goAllTasks(); break
      case 'calendar': v.goCalendar(); break
      case 'documents': v.goDocuments(); break
      case 'files': v.goFiles(); break
      case 'vault': v.goVault(); break
    }
  }
  return (
    <RailCard title="Quick links" icon="link" tone="accent">
      {picked.length === 0 ? (
        <EmptyState text="No links picked yet. Edit this widget in Customize." />
      ) : (
        <div className="grid grid-cols-3 gap-2" data-testid="home-quick-links">
          {picked.map((r) => (
            <button
              key={r.id}
              onClick={() => go(r.id)}
              data-testid={`home-quick-link-${r.id}`}
              className="flex flex-col items-center gap-1.5 fb-tile fb-press px-2 py-2.5"
            >
              <Icon name={r.icon} size={18} className={r.tone} />
              <span className="text-[10.5px] text-[var(--ink-80)] truncate max-w-full">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </RailCard>
  )
}

export function AppLauncherWidget(): JSX.Element {
  const apps = useConnectedAppsStore((s) => s.apps)
  const launchLocal = useConnectedAppsStore((s) => s.launchLocal)
  const v = useViewStore()
  const { favourites } = useMemo(() => splitFavourites(apps), [apps])
  const shown = favourites.length > 0 ? favourites.slice(0, 8) : apps.slice(0, 8)
  return (
    <RailCard title="App launcher" icon="apps" tone="emerald">
      {shown.length === 0 ? (
        <EmptyState text="No connected apps yet. Add some from the sidebar." />
      ) : (
        <div className="grid grid-cols-4 gap-2" data-testid="home-app-launcher">
          {shown.map((a) => (
            <button
              key={a.id}
              onClick={() => (a.kind === 'local' ? void launchLocal(a.id) : v.goConnectedApp(a.id))}
              title={a.title}
              data-testid={`home-app-launch-${a.id}`}
              className="flex flex-col items-center gap-1.5 fb-tile fb-press px-1.5 py-2.5"
            >
              <AppLogo app={a} size={24} glyphSize={14} />
              <span className="text-[10px] text-[var(--ink-70)] truncate max-w-full">{a.title}</span>
            </button>
          ))}
        </div>
      )}
    </RailCard>
  )
}

// ── Actions ──────────────────────────────────────────────────────────────────

export function CreateWidget(): JSX.Element {
  const v = useViewStore()
  const createBlankDoc = useDocumentsStore((s) => s.createBlank)
  const createNode = useNodeStore((s) => s.create)
  const setActive = useNodeStore((s) => s.setActive)

  const newDoc = async (docType: 'doc' | 'sheet' | 'slides'): Promise<void> => {
    const doc = await createBlankDoc(docType)
    v.goDocument(doc.id)
  }
  const newDesk = async (): Promise<void> => {
    try {
      const node = await createNode({ parentId: null, kind: 'task', title: 'New desk' })
      setActive(node.id)
      v.goTask(node.id)
    } catch {
      /* the desk-limit prompt already told the user what happened */
    }
  }
  const items = [
    { id: 'doc', label: 'Document', icon: 'description', tone: 'text-sky-500', onClick: () => void newDoc('doc') },
    { id: 'sheet', label: 'Spreadsheet', icon: 'table_chart', tone: 'text-emerald-500', onClick: () => void newDoc('sheet') },
    { id: 'slides', label: 'Deck', icon: 'slideshow', tone: 'text-orange-500', onClick: () => void newDoc('slides') },
    { id: 'desk', label: 'Desk', icon: 'desk', tone: 'text-violet-500', onClick: () => void newDesk() }
  ]
  return (
    <RailCard title="Create new" icon="add_circle" tone="accent">
      <div className="grid grid-cols-2 gap-2" data-testid="home-create">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={it.onClick}
            data-testid={`home-create-${it.id}`}
            className="flex items-center gap-2 fb-tile fb-press px-2.5 py-2 text-left"
          >
            <Icon name={it.icon} size={17} className={`${it.tone} shrink-0`} />
            <span className="text-[12px] font-medium text-[var(--ink-90)] truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </RailCard>
  )
}

export function FocusTimerWidget(): JSX.Element {
  const active = useFocusSessionStore((s) => s.active)
  const remainingSec = useFocusSessionStore((s) => s.remainingSec)
  const start = useFocusSessionStore((s) => s.start)
  const finish = useFocusSessionStore((s) => s.finish)
  const mm = Math.max(0, Math.floor(remainingSec / 60))
  const ss = Math.max(0, remainingSec % 60)
  return (
    <RailCard title="Focus timer" icon="timer" tone="violet">
      <div className="flex items-center gap-3" data-testid="home-focus-timer">
        {active ? (
          <>
            <span className="fb-display fb-tabular text-[26px] leading-none text-violet-500">
              {mm}:{String(ss).padStart(2, '0')}
            </span>
            <span className="flex-1 fb-t-caption">Focus session running. Hold the line.</span>
            <button
              onClick={() => void finish('done')}
              data-testid="home-focus-timer-stop"
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium bg-violet-500/15 text-violet-500 hover:bg-violet-500/25 transition-colors"
            >
              <Icon name="stop_circle" size={15} />
              End
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-[12px] text-[var(--ink-70)]">
              Five minutes. Just start, that is the whole trick.
            </span>
            <button
              onClick={() => void start(null, 5 * 60, '5min')}
              data-testid="home-focus-timer-start"
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))] transition-colors"
            >
              <Icon name="bolt" size={15} />
              Start 5 min
            </button>
          </>
        )}
      </div>
    </RailCard>
  )
}

// ── Smart ────────────────────────────────────────────────────────────────────

export function OverdueRadarWidget(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const openDesk = useOpenDesk()
  const overdue = useMemo(() => {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    return nodes
      .filter(
        (n) => n.kind === 'task' && n.status !== 'done' && !n.archived && n.dueDate != null && n.dueDate < dayStart.getTime()
      )
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
      .slice(0, 5)
  }, [nodes])
  return (
    <RailCard title="Overdue radar" icon="priority_high" tone="rose">
      {overdue.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-[var(--ink-50)]" data-testid="home-overdue-empty">
          Nothing overdue. Clear skies.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="home-overdue">
          {overdue.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => openDesk(n)}
                className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="flex-1 truncate fb-t-body text-[var(--ink-100)]">{n.title || 'Untitled task'}</span>
                <span className="shrink-0 text-[10.5px] text-rose-500 fb-tabular">
                  due {new Date(n.dueDate ?? 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  )
}

export function OneThingNowWidget(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const openDesk = useOpenDesk()
  // The single most pressing task: urgency x importance, due-date pressure as
  // the tiebreak. Deliberately not a list — one thing, then the next.
  const pick = useMemo(() => {
    const open = nodes.filter((n) => n.kind === 'task' && n.status !== 'done' && !n.archived)
    if (open.length === 0) return null
    return [...open].sort((a, b) => {
      const sa = (a.priority ?? 3) + (a.importance ?? 3)
      const sb = (b.priority ?? 3) + (b.importance ?? 3)
      if (sb !== sa) return sb - sa
      const da = a.dueDate ?? Infinity
      const db = b.dueDate ?? Infinity
      if (da !== db) return da - db
      return b.updatedAt - a.updatedAt
    })[0]
  }, [nodes])
  const room = useNodeStore((s) => (pick?.parentId ? s.nodes.find((n) => n.id === pick.parentId) ?? null : null))
  return (
    <RailCard title="One thing now" icon="target" tone="amber">
      {!pick ? (
        <EmptyState text="No open tasks. Enjoy it." />
      ) : (
        <div className="flex items-center gap-3" data-testid="home-one-thing">
          <div className="min-w-0 flex-1">
            <div className="fb-t-title text-[var(--ink-100)] truncate">{pick.title || 'Untitled task'}</div>
            <div className="mt-0.5 fb-t-caption truncate">
              {[room?.title, pick.dueDate ? `due ${new Date(pick.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : null]
                .filter(Boolean)
                .join(' · ') || 'Picked by urgency and importance'}
            </div>
          </div>
          <button
            onClick={() => openDesk(pick)}
            data-testid="home-one-thing-open"
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[12.5px] font-medium bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))] transition-colors"
          >
            Start
            <Icon name="arrow_forward" size={15} />
          </button>
        </div>
      )}
    </RailCard>
  )
}

export function WhereWasIWidget({ activity }: { activity: ActivityEvent[] | null }): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const v = useViewStore()
  // Reconstruct the last real working context from the activity trail: the most
  // recent event tied to a desk, plus the last page visited for flavour.
  const last = useMemo(() => {
    if (!activity) return null
    const e = activity.find((a) => a.taskId != null)
    if (!e) return null
    const node = nodes.find((n) => n.id === e.taskId) ?? null
    if (!node || node.archived) return null
    const page = activity.find((a) => a.kind === 'browser_nav')
    const p = (page?.payload ?? {}) as Record<string, unknown>
    const pageTitle = typeof p.title === 'string' && p.title ? p.title : typeof p.host === 'string' ? p.host : null
    return { node, ts: e.ts, pageTitle }
  }, [activity, nodes])
  return (
    <RailCard title="Where was I" icon="undo" tone="sky">
      {!last ? (
        <EmptyState text="No trail yet. Work a little and this widget will remember for you." />
      ) : (
        <div className="flex items-center gap-3" data-testid="home-where-was-i">
          <div className="min-w-0 flex-1">
            <div className="fb-t-body font-medium text-[var(--ink-100)] truncate">
              {last.node.title || 'Untitled desk'}
            </div>
            <div className="mt-0.5 fb-t-caption truncate">
              {relTime(last.ts)}
              {last.pageTitle ? ` · last page: ${last.pageTitle}` : ''}
            </div>
          </div>
          <button
            onClick={() => {
              setActive(last.node.id)
              v.goTask(last.node.id)
            }}
            data-testid="home-where-was-i-resume"
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 fb-t-body font-medium fb-btn-surface fb-press text-[var(--ink-90)]"
          >
            <Icon name="play_arrow" size={16} className="text-accent" />
            Resume
          </button>
        </div>
      )}
    </RailCard>
  )
}

export function StalledDeskWidget(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const openDesk = useOpenDesk()
  const stalled = useMemo(() => {
    const cutoff = Date.now() - 3 * 86_400_000
    return (
      nodes
        .filter((n) => n.kind === 'task' && n.status === 'in_progress' && !n.archived && n.updatedAt < cutoff)
        .sort((a, b) => a.updatedAt - b.updatedAt)[0] ?? null
    )
  }, [nodes])
  return (
    <RailCard title="Stalled desk" icon="hourglass_bottom" tone="amber">
      {!stalled ? (
        <p className="py-4 text-center text-[12px] text-[var(--ink-50)]" data-testid="home-stalled-empty">
          Nothing stalled. Everything in progress has been touched this week.
        </p>
      ) : (
        <button
          onClick={() => openDesk(stalled)}
          data-testid="home-stalled-open"
          className="flex w-full items-center gap-3 fb-tile fb-press px-3 py-2.5 text-left"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
            <Icon name="hourglass_bottom" size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate fb-t-body font-medium text-[var(--ink-100)]">
              {stalled.title || 'Untitled desk'}
            </span>
            <span className="block fb-t-caption">
              in progress, untouched since {relTime(stalled.updatedAt)}
            </span>
          </span>
          <Icon name="chevron_right" size={16} className="text-[var(--ink-40)] shrink-0" />
        </button>
      )}
    </RailCard>
  )
}
