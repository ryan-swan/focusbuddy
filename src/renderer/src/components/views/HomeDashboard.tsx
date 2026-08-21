import { useEffect, useMemo, useState } from 'react'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { personFirstName } from '../../lib/personName'
import { useDocumentsStore } from '../../stores/documents'
import { useNodeStore } from '../../stores/nodes'
import { useAiCommandBar } from '../../stores/aiCommandBar'
import { useAssistantChrome } from '../../stores/assistantChrome'
import { usePinLayer } from '../../stores/pinLayer'
import { useFocusSessionStore } from '../../stores/focusSession'
import { createPortal } from 'react-dom'
import { RailCard } from '../plexi'
import Modal from '../plexi/Modal'
import StandupHome from './StandupHome'
import StartOrAskPlexi from './StartOrAskPlexi'
import Icon from '../Icon'
import {
  HOME_WIDGET_DEFS,
  QUICK_LINK_ROUTES,
  widgetDef,
  type HomeWidgetConfig,
  type HomeWidgetId,
  type HomeWidgetInstance,
  PinnedDeskWidget,
  RoomPortalWidget,
  QuickLinksWidget,
  AppLauncherWidget,
  CreateWidget,
  FocusTimerWidget,
  OverdueRadarWidget,
  OneThingNowWidget,
  WhereWasIWidget,
  StalledDeskWidget
} from './homeWidgets'
import type { ActivityEvent, ActivityKind, DocumentMeta, FbNode, TimeBlock } from '@shared/types'

// Home — the landing dashboard, laid out as a desk the app sets for you.
// The page sits on the same desk-paper substrate as a real canvas, and every
// section is a widget pinned into a slot: same visual language as canvas
// widgets, but locked positions, so arriving home never feels like leaving the
// workspace for a website. Widgets can be re-slotted by dragging their corner
// grip; the arrangement persists locally and can be reset to the stock layout.
//
// Every section reads a real source and shows an honest empty or zero state
// when there is nothing to show. Nothing here is seeded or invented.
//
// Real sources, widget by widget:
//   greeting            useAccountStore().account.handle (+ time-of-day from the clock)
//   hero input          StartOrAskPlexi (spec §4.1) + the AI command bar trigger
//   standup             StandupHome (Assistant 4.5)
//   rooms & desks       window.api.nodes.list() — the real rooms/desks, columns left→right
//   continue            useDocumentsStore().list, sorted by real updatedAt
//   today's agenda      window.api.timeBlocks.list() for the local day
//   pulse               real counts derived from the nodes + the agenda
//   quick actions       navigate to real destinations via the view store
//   recent activity     window.api.trail.recent(null, ...) — the real activity log
//   focus mode          the real 5-minute-promise focus session (useFocusSessionStore)

const DOC_TYPE_ICON: Record<string, { icon: string; tint: string; label: string }> = {
  doc: { icon: 'description', tint: 'text-sky-500', label: 'Document' },
  sheet: { icon: 'table_chart', tint: 'text-emerald-500', label: 'Spreadsheet' },
  slides: { icon: 'slideshow', tint: 'text-orange-500', label: 'Presentation' },
  map: { icon: 'gesture', tint: 'text-violet-500', label: 'Drawing' },
  design: { icon: 'palette', tint: 'text-fuchsia-500', label: 'Design' }
}

const ACTIVITY_ICON: Record<ActivityKind, string> = {
  task_switched: 'swap_horiz',
  widget_added: 'add_circle',
  widget_focused: 'visibility',
  widget_removed: 'remove_circle',
  browser_nav: 'public',
  note_edit: 'edit_note',
  chat_sent: 'forum',
  session_started: 'bolt',
  session_ended: 'check_circle',
  ai_setup_run: 'auto_awesome',
  resume_generated: 'description'
}

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

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Greeting name from the real account. We never invent a name: signed-out users
// get a plain, friendly fallback rather than a fabricated identity.
function greetingName(handle: string | null | undefined, email: string | null): string {
  const h = (handle ?? '').replace(/^@/, '').trim()
  if (h) return h
  if (email) {
    const local = email.split('@')[0]?.trim()
    if (local) return local
  }
  return 'there'
}

function timeOfDay(now: number): string {
  const h = new Date(now).getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function summarizeActivity(e: ActivityEvent): string {
  const p = e.payload as Record<string, unknown>
  const truncate = (v: unknown, n: number): string => {
    const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
    return s.length > n ? s.slice(0, n) + '…' : s
  }
  switch (e.kind) {
    case 'task_switched':
      return `Opened ${truncate(p.toTitle, 40) || 'a desk'}`
    case 'widget_added':
      return `Added ${truncate(p.kind, 20) || 'a tool'}${p.title ? ` "${truncate(p.title, 28)}"` : ''}`
    case 'widget_focused':
      return `Focused ${truncate(p.kind, 20) || 'a tool'}`
    case 'widget_removed':
      return `Removed ${truncate(p.kind, 20) || 'a tool'}`
    case 'browser_nav':
      return `Visited ${truncate(p.title || p.host || p.url, 46) || 'a page'}`
    case 'note_edit':
      return `Edited a note`
    case 'chat_sent':
      return `Asked the assistant a question`
    case 'session_started':
      return `Started a focus session`
    case 'session_ended':
      return `${truncate(p.outcome, 16) || 'Ended'} a focus session`
    case 'ai_setup_run':
      return `Ran AI setup`
    case 'resume_generated':
      return `Generated a recap`
    default:
      return 'Activity'
  }
}

function startOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Locally-dismissed activity items (spec §4.2 "Dismiss — remove low-value items
// from view"). Kept in localStorage so a dismissal sticks across reloads; capped
// so the list can't grow without bound.
const DISMISSED_KEY = 'fb.home.dismissedActivity.v1'
function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}
function saveDismissed(s: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s].slice(-500)))
  } catch {
    /* ignore */
  }
}

// ── The slot system ──────────────────────────────────────────────────────────
// Two columns — a wide main track and a narrow rail — each an ordered list of
// placed widget INSTANCES. An instance is a widget id plus its config (which
// desk is pinned, which room the portal opens, which links are picked), so
// configurable widgets can appear more than once. Customize mode edits this
// arrangement through the gallery drawer; everything persists per device.

interface HomeLayout {
  main: HomeWidgetInstance[]
  rail: HomeWidgetInstance[]
}

const STOCK_LAYOUT: HomeLayout = {
  main: [
    { key: 'standup', widget: 'standup' },
    { key: 'navigator', widget: 'navigator' },
    { key: 'continue', widget: 'continue' }
  ],
  rail: [
    { key: 'agenda', widget: 'agenda' },
    { key: 'pulse', widget: 'pulse' },
    { key: 'quick', widget: 'quick' },
    { key: 'activity', widget: 'activity' }
  ]
}
const KNOWN_IDS = new Set<string>(HOME_WIDGET_DEFS.map((d) => d.id))
const LAYOUT_KEY_V1 = 'home.layout.v1'
const LAYOUT_KEY = 'home.layout.v2'

function newInstanceKey(widget: HomeWidgetId): string {
  return `${widget}:${Math.random().toString(36).slice(2, 9)}`
}

function loadLayout(): HomeLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HomeLayout>
      const seen = new Set<string>()
      const clean = (list: unknown): HomeWidgetInstance[] =>
        (Array.isArray(list) ? list : []).filter(
          (it): it is HomeWidgetInstance =>
            !!it &&
            typeof it === 'object' &&
            typeof (it as HomeWidgetInstance).key === 'string' &&
            KNOWN_IDS.has((it as HomeWidgetInstance).widget) &&
            !seen.has((it as HomeWidgetInstance).key) &&
            !!seen.add((it as HomeWidgetInstance).key)
        )
      return { main: clean(parsed.main), rail: clean(parsed.rail) }
    }
    // Migrate a v1 layout (plain widget-id arrays) into instances once.
    const v1 = localStorage.getItem(LAYOUT_KEY_V1)
    if (v1) {
      const parsed = JSON.parse(v1) as { main?: unknown; rail?: unknown }
      const lift = (ids: unknown): HomeWidgetInstance[] =>
        (Array.isArray(ids) ? ids : [])
          .filter((id): id is HomeWidgetId => typeof id === 'string' && KNOWN_IDS.has(id))
          .map((id) => ({ key: id, widget: id }))
      const migrated = { main: lift(parsed.main), rail: lift(parsed.rail) }
      if (migrated.main.length + migrated.rail.length > 0) return migrated
    }
    return STOCK_LAYOUT
  } catch {
    return STOCK_LAYOUT
  }
}

function saveLayout(l: HomeLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l))
  } catch {
    /* ignore quota */
  }
}

function layoutIsStock(l: HomeLayout): boolean {
  return (
    l.main.length === STOCK_LAYOUT.main.length &&
    l.rail.length === STOCK_LAYOUT.rail.length &&
    l.main.every((it, i) => it.widget === STOCK_LAYOUT.main[i].widget) &&
    l.rail.every((it, i) => it.widget === STOCK_LAYOUT.rail[i].widget)
  )
}

// Deterministic per-room tint so the navigator reads like the colored room
// tiles in the design reference without inventing stored data.
const ROOM_TINTS = [
  'bg-violet-500/12 text-violet-500',
  'bg-sky-500/12 text-sky-500',
  'bg-emerald-500/12 text-emerald-500',
  'bg-amber-500/12 text-amber-600',
  'bg-rose-500/12 text-rose-500',
  'bg-fuchsia-500/12 text-fuchsia-500',
  'bg-teal-500/12 text-teal-500',
  'bg-indigo-500/12 text-indigo-500'
]
function roomTint(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ROOM_TINTS[Math.abs(h) % ROOM_TINTS.length]
}

const TOP_LEVEL = '__top__'

export default function HomeDashboard(): JSX.Element {
  const v = useViewStore()
  const account = useAccountStore((s) => s.account)

  const docs = useDocumentsStore((s) => s.list)
  const refreshDocs = useDocumentsStore((s) => s.refresh)
  const createBlankDoc = useDocumentsStore((s) => s.createBlank)

  const nodes = useNodeStore((s) => s.nodes)
  const refreshNodes = useNodeStore((s) => s.refresh)
  const createNode = useNodeStore((s) => s.create)
  const setActive = useNodeStore((s) => s.setActive)

  const openAiBar = useAiCommandBar((s) => s.setOpen)
  const pin = usePinLayer((s) => s.pin)

  const focusActive = useFocusSessionStore((s) => s.active)
  const startFocus = useFocusSessionStore((s) => s.start)
  const finishFocus = useFocusSessionStore((s) => s.finish)

  // Today's real time blocks and the real workspace-wide activity feed are loaded
  // imperatively. null means "still loading"; [] means "loaded, genuinely empty".
  const [agenda, setAgenda] = useState<TimeBlock[] | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())
  // A clock that ticks each minute so the greeting + relative times stay current.
  const [now, setNow] = useState(() => Date.now())

  // Slot arrangement + customize/drag state. dragKey moves a placed instance;
  // galleryDrag carries a new widget being dragged out of the gallery drawer.
  const [layout, setLayout] = useState<HomeLayout>(() => loadLayout())
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [galleryDrag, setGalleryDrag] = useState<HomeWidgetId | null>(null)
  const [dropHint, setDropHint] = useState<{ col: 'main' | 'rail'; index: number } | null>(null)
  const [customize, setCustomize] = useState(false)
  // A placed widget selected for swapping (click it, then click a gallery card).
  const [swapKey, setSwapKey] = useState<string | null>(null)
  // A config picker in flight: the widget def needing config, plus what happens
  // with the result — place at a position, swap an instance, or edit in place.
  const [picker, setPicker] = useState<{
    widget: HomeWidgetId
    kind: 'desk' | 'room' | 'links'
    initial?: HomeWidgetConfig
    apply: (config: HomeWidgetConfig) => void
  } | null>(null)

  // Which room the navigator has open. TOP_LEVEL is the pseudo-room holding
  // standalone desks that live outside any room.
  const [navRoom, setNavRoom] = useState<string>(TOP_LEVEL)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    void refreshDocs()
    void refreshNodes()
    const dayStart = startOfDay(Date.now())
    const dayEnd = dayStart + 86_400_000
    window.api.timeBlocks
      .list(dayStart, dayEnd)
      .then(setAgenda)
      .catch(() => setAgenda([]))
    // Workspace-wide activity over the last 7 days. A null taskId asks the real
    // activity log for every recorded event, newest first.
    window.api.trail
      .recent(null, Date.now() - 7 * 86_400_000, 60)
      .then(setActivity)
      .catch(() => setActivity([]))
  }, [refreshDocs, refreshNodes])

  const name = personFirstName(account, greetingName(account?.handle, account?.email ?? null))

  // Continue where you left off — the real documents you last touched.
  const recentDocs = useMemo<DocumentMeta[]>(
    () =>
      docs
        .filter((d) => !d.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4),
    [docs]
  )

  // The navigator's left column: real rooms, most recently touched first.
  const rooms = useMemo<FbNode[]>(
    () =>
      nodes
        .filter((n) => n.kind === 'folder' && !n.archived && n.parentId === null)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [nodes]
  )

  // Desk counts per room, and the desks of whichever room is open. Counts and
  // rows come straight from the real nodes — nothing invented.
  const deskCountByRoom = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of nodes) {
      if (n.kind === 'task' && !n.archived) {
        const key = n.parentId ?? TOP_LEVEL
        m.set(key, (m.get(key) ?? 0) + 1)
      }
    }
    return m
  }, [nodes])

  const navDesks = useMemo<FbNode[]>(
    () =>
      nodes
        .filter(
          (n) =>
            n.kind === 'task' &&
            !n.archived &&
            (navRoom === TOP_LEVEL ? n.parentId === null : n.parentId === navRoom)
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8),
    [nodes, navRoom]
  )

  // If the open room disappears (archived elsewhere), fall back to Top level.
  useEffect(() => {
    if (navRoom !== TOP_LEVEL && !rooms.some((r) => r.id === navRoom)) setNavRoom(TOP_LEVEL)
  }, [rooms, navRoom])

  // Today's agenda — only the events that fall on the local day, in time order.
  const todayEvents = useMemo<TimeBlock[]>(() => {
    if (!agenda) return []
    return [...agenda].sort((a, b) => a.startMs - b.startMs).slice(0, 6)
  }, [agenda])

  // Pulse — real counts only. Tasks due today / overdue come from the real
  // nodes; events today from the real agenda. Anything not instrumented
  // (productivity %, focus-time %) is deliberately absent.
  const insights = useMemo(() => {
    const dayStart = startOfDay(now)
    const dayEnd = dayStart + 86_400_000
    const openTasks = nodes.filter((n) => n.kind === 'task' && n.status !== 'done' && !n.archived)
    const dueToday = openTasks.filter((n) => n.dueDate != null && n.dueDate >= dayStart && n.dueDate < dayEnd).length
    const overdue = openTasks.filter((n) => n.dueDate != null && n.dueDate < dayStart).length
    const eventsToday = (agenda ?? []).length
    return [
      { id: 'open-tasks', icon: 'check_circle', label: openTasks.length === 1 ? 'open task' : 'open tasks', value: openTasks.length, tone: 'accent' as const },
      { id: 'due-today', icon: 'event', label: 'due today', value: dueToday, tone: dueToday > 0 ? ('amber' as const) : ('stone' as const) },
      { id: 'overdue', icon: 'priority_high', label: overdue === 1 ? 'overdue task' : 'overdue tasks', value: overdue, tone: overdue > 0 ? ('rose' as const) : ('stone' as const) },
      { id: 'events-today', icon: 'calendar_today', label: eventsToday === 1 ? 'event today' : 'events today', value: eventsToday, tone: 'sky' as const }
    ]
  }, [nodes, agenda, now])

  const recentActivity = useMemo(
    () => (activity ?? []).filter((e) => !dismissed.has(e.id)).slice(0, 6),
    [activity, dismissed]
  )

  const openDesk = (n: FbNode): void => {
    if (n.kind === 'folder') {
      // A folder desk has no canvas of its own; open it in the segment workspace.
      setActive(null)
      v.goPlexiDesk()
      return
    }
    setActive(n.id)
    v.goTask(n.id)
  }

  // Activity feed per-item actions (spec §4.2). Only the actions that genuinely
  // apply to a logged event are offered: Open its source desk, Ask Plexi about it
  // (open the context-aware assistant on that desk), and Dismiss it. The
  // content-only actions (Convert to task, Add to desk, Assign, Save) belong to the
  // richer §4.2 content feed, and Pin arrives with the universal pin layer.
  const openActivity = (e: ActivityEvent): void => {
    if (!e.taskId) return
    setActive(e.taskId)
    v.goTask(e.taskId)
  }
  const askAboutActivity = (e: ActivityEvent): void => {
    if (e.taskId) {
      setActive(e.taskId)
      v.goTask(e.taskId)
    }
    const chrome = useAssistantChrome.getState()
    chrome.setMode('sidebar')
    chrome.openPanel()
  }
  const dismissActivity = (id: string): void => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }
  const pinActivity = (e: ActivityEvent): void => {
    pin({
      kind: 'activity',
      refId: e.id,
      title: summarizeActivity(e),
      source: 'Home activity',
      deskId: e.taskId ?? undefined
    })
  }

  const onCreate = async (): Promise<void> => {
    // Create a real blank document and open it — the same path the documents hub
    // uses for its New button.
    const doc = await createBlankDoc('doc')
    v.goDocument(doc.id)
  }

  const onNewDesk = async (): Promise<void> => {
    try {
      const node = await createNode({
        parentId: navRoom === TOP_LEVEL ? null : navRoom,
        kind: 'task',
        title: 'New desk'
      })
      setActive(node.id)
      v.goTask(node.id)
    } catch {
      // create() throws DESK_LIMIT_REACHED on the free tier after prompting an
      // upgrade. Swallow it here: the prompt already told the user what happened.
    }
  }

  const toggleFocus = async (): Promise<void> => {
    if (focusActive) {
      await finishFocus('done')
    } else {
      // A global 5-minute promise, not bound to a specific task.
      await startFocus(null, 5 * 60, '5min')
    }
  }

  // ── Slot editing: move, place, swap, remove, reset ─────────────────────────
  const commitLayout = (next: HomeLayout): void => {
    setLayout(next)
    saveLayout(next)
  }

  const insertInstance = (inst: HomeWidgetInstance, col: 'main' | 'rail', index: number): void => {
    const next: HomeLayout = {
      main: layout.main.filter((it) => it.key !== inst.key),
      rail: layout.rail.filter((it) => it.key !== inst.key)
    }
    const list = next[col]
    list.splice(Math.min(index, list.length), 0, inst)
    commitLayout(next)
  }

  const findInstance = (key: string): HomeWidgetInstance | null =>
    layout.main.find((it) => it.key === key) ?? layout.rail.find((it) => it.key === key) ?? null

  const applyDrop = (): void => {
    if (dropHint && dragKey) {
      const inst = findInstance(dragKey)
      if (inst) insertInstance(inst, dropHint.col, dropHint.index)
    } else if (dropHint && galleryDrag) {
      placeWidget(galleryDrag, dropHint)
    }
    setDragKey(null)
    setGalleryDrag(null)
    setDropHint(null)
  }

  // Place a new widget from the gallery, running its config picker first when
  // it needs one. Singletons that are already placed are a no-op.
  const placeWidget = (id: HomeWidgetId, at?: { col: 'main' | 'rail'; index: number }): void => {
    const def = widgetDef(id)
    if (!def.multi && isPlaced(id)) return
    const target = at ?? { col: def.defaultCol, index: layout[def.defaultCol].length }
    const finish = (config?: HomeWidgetConfig): void =>
      insertInstance({ key: newInstanceKey(id), widget: id, config }, target.col, target.index)
    if (def.config) {
      setPicker({ widget: id, kind: def.config, apply: (config) => finish(config) })
    } else {
      finish()
    }
  }

  // Swap a placed instance for a different widget, keeping its slot.
  const swapWidget = (key: string, id: HomeWidgetId): void => {
    const def = widgetDef(id)
    if (!def.multi && isPlaced(id)) return
    const replaceWith = (config?: HomeWidgetConfig): void => {
      const next: HomeLayout = {
        main: layout.main.map((it) => (it.key === key ? { key: newInstanceKey(id), widget: id, config } : it)),
        rail: layout.rail.map((it) => (it.key === key ? { key: newInstanceKey(id), widget: id, config } : it))
      }
      commitLayout(next)
      setSwapKey(null)
    }
    if (def.config) {
      setPicker({ widget: id, kind: def.config, apply: (config) => replaceWith(config) })
    } else {
      replaceWith()
    }
  }

  const removeInstance = (key: string): void => {
    commitLayout({
      main: layout.main.filter((it) => it.key !== key),
      rail: layout.rail.filter((it) => it.key !== key)
    })
    if (swapKey === key) setSwapKey(null)
  }

  const editInstance = (key: string): void => {
    const inst = findInstance(key)
    if (!inst) return
    const def = widgetDef(inst.widget)
    if (!def.config) return
    setPicker({
      widget: inst.widget,
      kind: def.config,
      initial: inst.config,
      apply: (config) => {
        commitLayout({
          main: layout.main.map((it) => (it.key === key ? { ...it, config } : it)),
          rail: layout.rail.map((it) => (it.key === key ? { ...it, config } : it))
        })
      }
    })
  }

  const isPlaced = (id: HomeWidgetId): boolean =>
    layout.main.some((it) => it.widget === id) || layout.rail.some((it) => it.widget === id)

  const resetLayout = (): void => {
    commitLayout(STOCK_LAYOUT)
    setSwapKey(null)
  }

  // Escape backs out of customize mode one layer at a time: swap selection
  // first, then the mode itself.
  useEffect(() => {
    if (!customize) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (swapKey) setSwapKey(null)
      else setCustomize(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [customize, swapKey])

  // One widget = one pinned card. The renderer owns the chrome (and the corner
  // grip); the original dashboard widgets render inline because they share this
  // component's imperatively-loaded data, the catalog widgets come from
  // homeWidgets.tsx and read their stores directly.
  const renderWidget = (inst: HomeWidgetInstance): JSX.Element | null => {
    switch (inst.widget) {
      case 'pinned-desk':
        return <PinnedDeskWidget deskId={inst.config?.deskId} />
      case 'room-portal':
        return <RoomPortalWidget roomId={inst.config?.roomId} />
      case 'quick-links':
        return <QuickLinksWidget routes={inst.config?.routes} />
      case 'app-launcher':
        return <AppLauncherWidget />
      case 'create':
        return <CreateWidget />
      case 'focus-timer':
        return <FocusTimerWidget />
      case 'overdue':
        return <OverdueRadarWidget />
      case 'one-thing':
        return <OneThingNowWidget />
      case 'where-was-i':
        return <WhereWasIWidget activity={activity} />
      case 'stalled':
        return <StalledDeskWidget />
      case 'standup':
        // StandupHome carries its own card chrome + margin; neutralize the margin
        // so the slot gap is the single source of vertical rhythm.
        return <div className="[&>*]:!mb-0">{<StandupHome />}</div>

      case 'navigator':
        return (
          <RailCard
            title="Rooms and desks"
            icon="meeting_room"
            tone="sky"
            action={{ label: 'All rooms', onClick: () => v.goRooms() }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(150px,200px)_1fr] gap-3" data-testid="home-navigator">
              {/* Rooms column */}
              <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible sm:border-r sm:border-[var(--edge-soft)] sm:pr-3">
                <button
                  onClick={() => setNavRoom(TOP_LEVEL)}
                  data-testid="home-nav-room-top"
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left shrink-0 transition-colors ${
                    navRoom === TOP_LEVEL ? 'bg-[rgb(var(--accent)/0.10)]' : 'hover:bg-[var(--surface-sunken)]'
                  }`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-stone-500/10 text-[var(--ink-60)] shrink-0">
                    <Icon name="home" size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-[12.5px] ${navRoom === TOP_LEVEL ? 'text-[var(--ink-100)] font-medium' : 'text-[var(--ink-90)]'}`}>
                      Top level
                    </span>
                    <span className="block fb-t-caption text-[var(--ink-45)]">
                      {deskCountByRoom.get(TOP_LEVEL) ?? 0} {(deskCountByRoom.get(TOP_LEVEL) ?? 0) === 1 ? 'desk' : 'desks'}
                    </span>
                  </span>
                </button>
                {rooms.map((r) => {
                  const count = deskCountByRoom.get(r.id) ?? 0
                  const active = navRoom === r.id
                  return (
                    <button
                      key={r.id}
                      onClick={() => setNavRoom(r.id)}
                      data-testid={`home-nav-room-${r.id}`}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left shrink-0 transition-colors ${
                        active ? 'bg-[rgb(var(--accent)/0.10)]' : 'hover:bg-[var(--surface-sunken)]'
                      }`}
                    >
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${roomTint(r.id)}`}>
                        <Icon name="folder" size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate text-[12.5px] ${active ? 'text-[var(--ink-100)] font-medium' : 'text-[var(--ink-90)]'}`}>
                          {r.title || 'Untitled room'}
                        </span>
                        <span className="block fb-t-caption text-[var(--ink-45)]">
                          {count} {count === 1 ? 'desk' : 'desks'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Desks column — the room you clicked opens out to the right. */}
              <div className="min-w-0" data-testid="home-desks">
                {navDesks.length === 0 ? (
                  <p className="py-6 text-center text-[12px] text-[var(--ink-50)]">
                    No desks in here yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {navDesks.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => openDesk(n)}
                        data-testid={`home-desk-${n.id}`}
                        className="flex items-center gap-2.5 fb-tile fb-press px-2.5 py-2 text-left"
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
                          <Icon name="desk" size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate fb-t-body text-[var(--ink-100)]">
                            {n.title || 'Untitled desk'}
                          </span>
                          <span className="block fb-t-caption">
                            Edited {relTime(n.updatedAt)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => void onNewDesk()}
                  data-testid="home-desk-new"
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[var(--edge-firm)] px-2.5 py-2 fb-t-label text-[var(--ink-60)] hover:text-[rgb(var(--accent))] fb-press transition-colors"
                >
                  <Icon name="add" size={15} />
                  New desk{navRoom !== TOP_LEVEL ? ' in this room' : ''}
                </button>
              </div>
            </div>
          </RailCard>
        )

      case 'continue':
        return (
          <RailCard
            title="Continue where you left off"
            icon="history"
            tone="accent"
            action={{ label: 'All documents', onClick: () => v.goDocuments() }}
          >
            {recentDocs.length === 0 ? (
              <EmptyState text="Nothing to pick up yet. Create a document and it will wait for you here." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="home-continue">
                {recentDocs.map((d) => {
                  const ti = DOC_TYPE_ICON[d.docType] ?? {
                    icon: 'draft',
                    tint: 'text-[var(--ink-40)]',
                    label: 'File'
                  }
                  return (
                    <button
                      key={d.id}
                      onClick={() => v.goDocument(d.id)}
                      data-testid={`home-continue-item-${d.id}`}
                      className="flex items-center gap-3 fb-tile fb-press px-3 py-2.5 text-left"
                    >
                      <Icon name={ti.icon} size={20} className={`${ti.tint} shrink-0`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate fb-t-body text-[var(--ink-100)]">
                          {d.title || 'Untitled'}
                        </span>
                        <span className="block fb-t-caption">
                          {ti.label}, edited {relTime(d.updatedAt)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </RailCard>
        )

      case 'agenda':
        return (
          <RailCard
            title="Today's agenda"
            icon="calendar_today"
            tone="sky"
            action={{ label: 'Calendar', onClick: () => v.goCalendar() }}
          >
            {agenda === null ? (
              <EmptyState text="Loading your day…" />
            ) : todayEvents.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[var(--ink-50)]" data-testid="home-agenda-empty">
                Nothing scheduled today.
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="home-agenda">
                {todayEvents.map((b) => (
                  <li key={b.id} className="flex items-center gap-2.5 px-1 py-1" data-testid={`home-agenda-item-${b.id}`}>
                    <span className="shrink-0 fb-t-caption fb-tabular w-14">
                      {clockTime(b.startMs)}
                    </span>
                    <span className="flex-1 truncate fb-t-body text-[var(--ink-100)]">
                      {b.title || 'Time block'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </RailCard>
        )

      case 'pulse':
        return (
          <RailCard title="Pulse" icon="monitoring" tone="violet">
            <div
              className="grid grid-cols-2 gap-2"
              data-testid="home-insights"
              title="Counts come straight from your tasks and calendar. Productivity and focus-time scores are not tracked yet, so they are not shown."
            >
              {insights.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 fb-tile px-2.5 py-2"
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${
                      s.tone === 'accent'
                        ? 'bg-accent/10 text-accent'
                        : s.tone === 'amber'
                          ? 'bg-amber-500/10 text-amber-500'
                          : s.tone === 'rose'
                            ? 'bg-rose-500/10 text-rose-500'
                            : s.tone === 'sky'
                              ? 'bg-sky-500/10 text-sky-500'
                              : 'bg-stone-500/10 text-[var(--ink-50)]'
                    }`}
                  >
                    <Icon name={s.icon} size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="block fb-display fb-tabular text-[16px] leading-none text-[var(--ink-100)]">
                      {s.value}
                    </span>
                    <span className="block truncate fb-t-caption">{s.label}</span>
                  </span>
                </div>
              ))}
            </div>
          </RailCard>
        )

      case 'quick':
        return (
          <RailCard title="Quick actions" icon="bolt" tone="emerald">
            <div className="grid grid-cols-2 gap-2">
              <QuickAction testid="home-quick-create" icon="add" tone="accent" title="Create" blurb="New document" onClick={() => void onCreate()} />
              <QuickAction testid="home-quick-plan" icon="checklist" tone="sky" title="Plan" blurb="Plans and tasks" onClick={() => v.goPlexiDesk('plans')} />
              <QuickAction testid="home-quick-collaborate" icon="group" tone="emerald" title="Collaborate" blurb="Shared work" onClick={() => v.goCollaborations()} />
              <QuickAction testid="home-quick-automate" icon="bolt" tone="violet" title="Automate" blurb="PlexiBrain flow" onClick={() => v.goPlexiBrain('flows')} />
            </div>
          </RailCard>
        )

      case 'activity':
        return (
          <RailCard title="Recent activity" icon="bolt" tone="accent">
            {activity === null ? (
              <EmptyState text="Loading recent activity…" />
            ) : recentActivity.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[var(--ink-50)]" data-testid="home-activity-empty">
                No recent activity yet. As you open desks and run sessions, it shows up here.
              </p>
            ) : (
              <ul className="space-y-0.5" data-testid="home-activity">
                {recentActivity.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-center gap-2.5 px-1 py-1.5 rounded-lg hover:bg-[var(--surface-sunken)]"
                    data-testid={`home-activity-item-${e.id}`}
                  >
                    <Icon name={ACTIVITY_ICON[e.kind] ?? 'circle'} size={14} className="text-[var(--ink-40)] shrink-0" />
                    <span className="flex-1 truncate text-[12px] text-[var(--ink-90)]">
                      {summarizeActivity(e)}
                    </span>
                    {/* Timestamp normally; a compact action row on hover/focus. */}
                    <span className="shrink-0 fb-t-caption fb-tabular group-hover:hidden">
                      {relTime(e.ts)}
                    </span>
                    <span className="shrink-0 hidden group-hover:flex items-center gap-0.5">
                      {e.taskId && (
                        <button
                          onClick={() => openActivity(e)}
                          title="Open its desk"
                          data-testid={`home-activity-open-${e.id}`}
                          className="icon-btn h-6 w-6 text-[var(--ink-50)] hover:text-[rgb(var(--accent))]"
                        >
                          <Icon name="open_in_new" size={13} />
                        </button>
                      )}
                      {e.taskId && (
                        <button
                          onClick={() => askAboutActivity(e)}
                          title="Ask Plexi about this"
                          data-testid={`home-activity-ask-${e.id}`}
                          className="icon-btn h-6 w-6 text-[var(--ink-50)] hover:text-[rgb(var(--accent))]"
                        >
                          <Icon name="auto_awesome" size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => pinActivity(e)}
                        title="Pin to your global pins"
                        data-testid={`home-activity-pin-${e.id}`}
                        className="icon-btn h-6 w-6 text-[var(--ink-50)] hover:text-[rgb(var(--accent))]"
                      >
                        <Icon name="push_pin" size={13} />
                      </button>
                      <button
                        onClick={() => dismissActivity(e.id)}
                        title="Dismiss"
                        data-testid={`home-activity-dismiss-${e.id}`}
                        className="icon-btn h-6 w-6 text-[var(--ink-40)] hover:text-rose-500"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </RailCard>
        )

      default:
        return null
    }
  }

  const dragging = dragKey !== null || galleryDrag !== null

  const renderColumn = (col: 'main' | 'rail'): JSX.Element => (
    <div className="space-y-5 min-w-0">
      {layout[col].map((inst, i) => {
        const def = widgetDef(inst.widget)
        const selected = swapKey === inst.key
        return (
          <div
            key={inst.key}
            className="relative group/slot"
            onDragOver={(e) => {
              if (!dragging || dragKey === inst.key) return
              e.preventDefault()
              setDropHint({ col, index: i })
            }}
            onDrop={(e) => {
              e.preventDefault()
              applyDrop()
            }}
          >
            {/* Insertion hint while a widget is dragged over this slot */}
            {dragging && dropHint?.col === col && dropHint.index === i && dragKey !== inst.key && (
              <div className="absolute -top-3 left-2 right-2 h-[3px] rounded-full bg-[rgb(var(--accent))]" />
            )}
            <div
              onClick={customize ? () => setSwapKey(selected ? null : inst.key) : undefined}
              className={`transition-all rounded-2xl ${dragKey === inst.key ? 'opacity-40' : ''} ${
                customize || dragging
                  ? `${customize ? 'cursor-pointer' : ''} scale-[0.985] ${
                      selected
                        ? 'ring-2 ring-[rgb(var(--accent))] shadow-[0_0_24px_rgb(var(--accent)/0.35)]'
                        : 'ring-2 ring-[rgb(var(--accent)/0.35)] shadow-[0_0_16px_rgb(var(--accent)/0.15)]'
                    }`
                  : ''
              }`}
            >
              {/* In customize mode the widget is a target, not a control. */}
              <div className={customize ? 'pointer-events-none' : ''}>{renderWidget(inst)}</div>
            </div>
            {/* Customize chrome: remove, and edit for configurable widgets. */}
            {customize && (
              <div className="absolute -top-2 -right-2 flex items-center gap-1">
                {def.config && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      editInstance(inst.key)
                    }}
                    title={`Edit ${def.name}`}
                    data-testid={`home-slot-edit-${inst.key}`}
                    className="h-6 w-6 rounded-full inline-flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)] shadow"
                  >
                    <Icon name="edit" size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeInstance(inst.key)
                  }}
                  title={`Remove ${def.name}`}
                  data-testid={`home-slot-remove-${inst.key}`}
                  className="h-6 w-6 rounded-full inline-flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-rose-500 shadow"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}
            {/* Corner grip — grab it to lift the widget into another slot. */}
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                // A drag payload keeps WebKit happy; the state carries the key.
                e.dataTransfer.setData('text/plain', inst.key)
                setDragKey(inst.key)
              }}
              onDragEnd={() => {
                setDragKey(null)
                setDropHint(null)
              }}
              title="Drag to rearrange your home"
              className={`absolute bottom-1.5 right-1.5 h-6 w-6 rounded-md inline-flex items-center justify-center cursor-grab active:cursor-grabbing text-[var(--ink-30)] hover:text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-opacity ${
                customize ? 'opacity-100' : 'opacity-0 group-hover/slot:opacity-100'
              }`}
              data-testid={`home-slot-grip-${inst.key}`}
            >
              <Icon name="drag_indicator" size={14} />
            </span>
          </div>
        )
      })}
      {/* Column tail — a live drop zone while dragging, and a visible invitation
          in customize mode. */}
      <div
        className={`rounded-xl border border-dashed transition-all flex items-center justify-center ${
          dragging
            ? dropHint?.col === col && dropHint.index === layout[col].length
              ? 'h-14 border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.06)]'
              : 'h-14 border-[var(--edge-firm)]'
            : customize
              ? 'h-14 border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.03)]'
              : 'h-10 border-transparent'
        }`}
        onDragOver={(e) => {
          if (!dragging) return
          e.preventDefault()
          setDropHint({ col, index: layout[col].length })
        }}
        onDrop={(e) => {
          e.preventDefault()
          applyDrop()
        }}
      >
        {(customize || dragging) && (
          <span className="text-[11px] text-[var(--ink-40)] pointer-events-none">
            {dragging ? 'Drop here' : 'Free slot, drag a widget in'}
          </span>
        )}
      </div>
    </div>
  )

  return (
    // Plain themed surface, deliberately NOT desk-paper: the dashboard is
    // product chrome, not a desk canvas. desk-paper here inherited the user's
    // custom desk background (light even in dark mode) and the time-of-day
    // gradient, which pinned to the scroll container and drew a seam.
    <div
      className="h-full w-full overflow-auto bg-[var(--surface-base)] text-[var(--ink-100)]"
      data-testid="home-dashboard"
    >
      <div className={`max-w-6xl mx-auto px-6 py-7 transition-[padding] ${customize ? 'lg:pr-[340px]' : ''}`}>
        {/* Greeting + focus-mode toggle */}
        <header className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="min-w-0">
            <h1
              className="fb-display-hero text-[24px] leading-tight text-[var(--ink-100)]"
              data-testid="home-greeting"
            >
              {timeOfDay(now)}, {name}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--ink-50)]">
              Here is your workspace and what is happening across it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {customize && !layoutIsStock(layout) && (
              <button
                onClick={resetLayout}
                data-testid="home-layout-reset"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] text-[var(--ink-50)] hover:text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <Icon name="restart_alt" size={15} />
                Reset layout
              </button>
            )}
            <button
              onClick={() => {
                setCustomize((c) => !c)
                setSwapKey(null)
              }}
              data-testid="home-customize-toggle"
              className={`inline-flex items-center gap-2 h-9 px-3.5 fb-t-body font-medium fb-press ${
                customize
                  ? 'rounded-[10px] bg-[rgb(var(--accent))] text-white shadow-[0_1px_2px_rgb(var(--accent)/0.25),0_4px_12px_-2px_rgb(var(--accent)/0.30)]'
                  : 'fb-btn-surface text-[var(--ink-80)]'
              }`}
            >
              <Icon name={customize ? 'check' : 'dashboard_customize'} size={16} />
              {customize ? 'Done' : 'Customize'}
            </button>
            <button
              onClick={() => openAiBar(true)}
              data-testid="home-ask-brain"
              title="Ask PlexiBrain or type a command"
              className="inline-flex items-center gap-2 h-9 px-3.5 fb-t-body font-medium fb-btn-surface fb-press text-[var(--ink-80)]"
            >
              <Icon name="auto_awesome" size={16} className="text-accent" />
              Ask PlexiBrain
              <span className="fb-t-caption text-[var(--ink-40)] bg-[var(--surface-sunken)] rounded-[6px] px-1.5 py-px fb-tabular">
                ⌘⇧K
              </span>
            </button>
            <button
              onClick={() => void toggleFocus()}
              data-testid="home-focus-toggle"
              className={`inline-flex items-center gap-2 h-9 px-3.5 fb-t-body font-medium fb-press ${
                focusActive
                  ? 'rounded-[10px] bg-violet-500/15 text-violet-500 shadow-[0_0_0_1px_rgb(139_92_246/0.35)]'
                  : 'fb-btn-surface text-[var(--ink-80)]'
              }`}
            >
              <Icon name={focusActive ? 'stop_circle' : 'bolt'} size={16} />
              {focusActive ? 'End focus mode' : 'Focus mode'}
            </button>
          </div>
        </header>

        {/* Hero — describe a goal, get a real desk with AI-proposed widgets and
            the assistant beside it (spec §4.1). Fixed position: this is the one
            piece of home that is not a re-slottable widget. */}
        <StartOrAskPlexi />

        {/* The pinned-widget canvas: wide main track + narrow rail. Each widget
            can be lifted by its corner grip and dropped into another slot. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
          {renderColumn('main')}
          {renderColumn('rail')}
        </div>
      </div>

      {customize && (
        <WidgetGalleryDrawer
          isPlaced={isPlaced}
          swapTarget={swapKey ? findInstance(swapKey) : null}
          onPick={(id) => {
            if (swapKey) swapWidget(swapKey, id)
            else placeWidget(id)
          }}
          onDragStartWidget={(id) => setGalleryDrag(id)}
          onDragEndWidget={() => {
            setGalleryDrag(null)
            setDropHint(null)
          }}
          onClearSwap={() => setSwapKey(null)}
          onClose={() => {
            setCustomize(false)
            setSwapKey(null)
          }}
        />
      )}

      {picker && (
        <WidgetConfigPicker
          widget={picker.widget}
          kind={picker.kind}
          initial={picker.initial}
          onCancel={() => setPicker(null)}
          onConfirm={(config) => {
            picker.apply(config)
            setPicker(null)
          }}
        />
      )}
    </div>
  )
}

// ── Customize mode: the gallery drawer ───────────────────────────────────────
// Slides up from the bottom while customizing. Browse by category or search,
// drag a card up onto a glowing slot, or click to place it at the end of its
// stock column. With a placed widget selected, clicking a card swaps it in.
function WidgetGalleryDrawer({
  isPlaced,
  swapTarget,
  onPick,
  onDragStartWidget,
  onDragEndWidget,
  onClearSwap,
  onClose
}: {
  isPlaced: (id: HomeWidgetId) => boolean
  swapTarget: HomeWidgetInstance | null
  onPick: (id: HomeWidgetId) => void
  onDragStartWidget: (id: HomeWidgetId) => void
  onDragEndWidget: () => void
  onClearSwap: () => void
  onClose: () => void
}): JSX.Element {
  const CATEGORIES = ['All', 'Navigation', 'Live', 'Smart', 'Actions'] as const
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All')
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const visible = HOME_WIDGET_DEFS.filter((d) => {
    if (category !== 'All' && d.category !== category) return false
    if (q && !`${d.name} ${d.blurb}`.toLowerCase().includes(q)) return false
    return true
  })

  return createPortal(
    <div
      className="fixed right-0 top-0 bottom-0 z-[60] w-[328px] flex flex-col border-l border-[var(--edge-firm)] bg-[var(--surface-raised)] shadow-[-12px_0_40px_rgba(0,0,0,0.22)]"
      data-testid="home-widget-gallery"
    >
      {/* Panel header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--edge-soft)] shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13.5px] font-semibold text-[var(--ink-100)] flex-1 truncate">
            {swapTarget ? `Swap ${widgetDef(swapTarget.widget).name}` : 'Widget gallery'}
          </span>
          <button
            onClick={onClose}
            data-testid="home-widget-gallery-done"
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-medium bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))]"
          >
            <Icon name="check" size={14} />
            Done
          </button>
        </div>
        {swapTarget ? (
          <div className="fb-t-caption">
            Pick its replacement below, or{' '}
            <button
              onClick={onClearSwap}
              className="text-[rgb(var(--accent))] underline-offset-2 hover:underline"
            >
              cancel the swap
            </button>
            .
          </div>
        ) : (
          <div className="fb-t-caption">
            Drag a card onto the canvas, or click to add. Click a placed widget to swap it.
          </div>
        )}
        <div className="relative mt-2.5">
          <Icon
            name="search"
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-40)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search widgets"
            className="h-8 w-full rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] pl-7 pr-2 text-[12px] text-[var(--ink-100)] placeholder:text-[var(--ink-40)] focus:outline-none focus:border-[rgb(var(--accent))]"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                category === c
                  ? 'bg-[rgb(var(--accent))] text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--ink-60)] hover:text-[var(--ink-100)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Vertical card list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {visible.map((d) => {
          const placed = !d.multi && isPlaced(d.id)
          const blocked = placed && !swapTarget
          return (
            <button
              key={d.id}
              draggable={!blocked}
              onDragStart={(e) => {
                if (blocked) return
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData('text/plain', d.id)
                onDragStartWidget(d.id)
              }}
              onDragEnd={onDragEndWidget}
              onClick={() => !blocked && onPick(d.id)}
              disabled={blocked}
              data-testid={`home-gallery-${d.id}`}
              title={d.blurb}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                blocked
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 cursor-default'
                  : 'border-transparent fb-tile fb-press cursor-grab active:cursor-grabbing'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${d.tint}`}>
                  <Icon name={d.icon} size={15} />
                </span>
                <span className="fb-t-label font-semibold text-[var(--ink-100)] truncate">{d.name}</span>
                {placed && (
                  <Icon name="check_circle" size={13} filled className="ml-auto text-emerald-600 dark:text-emerald-500 shrink-0" />
                )}
              </div>
              <div className="fb-t-caption leading-snug">
                {placed && !swapTarget ? 'Already on your home' : d.blurb}
              </div>
            </button>
          )
        })}
        {visible.length === 0 && (
          <p className="py-6 text-center text-[12px] text-[var(--ink-50)]">No widgets match.</p>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Customize mode: config pickers ───────────────────────────────────────────
// Small choosers for the widgets that need a subject: which desk to pin, which
// room to open, which links to show.
function WidgetConfigPicker({
  widget,
  kind,
  initial,
  onCancel,
  onConfirm
}: {
  widget: HomeWidgetId
  kind: 'desk' | 'room' | 'links'
  initial?: HomeWidgetConfig
  onCancel: () => void
  onConfirm: (config: HomeWidgetConfig) => void
}): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const [query, setQuery] = useState('')
  const [routes, setRoutes] = useState<Set<string>>(
    () => new Set(initial?.routes ?? ['calendar', 'documents', 'vault'])
  )

  const def = widgetDef(widget)
  const q = query.trim().toLowerCase()
  const candidates =
    kind === 'links'
      ? []
      : nodes
          .filter((n) => !n.archived && (kind === 'desk' ? n.kind === 'task' : n.kind === 'folder'))
          .filter((n) => !q || (n.title || '').toLowerCase().includes(q))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 30)

  return (
    <Modal
      onClose={onCancel}
      label={`Set up ${def.name}`}
      z={260}
      className="fb-glass-pillow rounded-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[70vh] outline-none"
      testId="home-widget-config"
    >
      <div className="px-4 py-3 border-b border-[var(--edge-soft)] flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${def.tint}`}>
          <Icon name={def.icon} size={15} />
        </span>
        <span className="text-[13.5px] font-semibold text-[var(--ink-100)]">
          {kind === 'desk' ? 'Pin which desk?' : kind === 'room' ? 'Open which room?' : 'Pick your links'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {kind === 'links' ? (
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_LINK_ROUTES.map((r) => {
              const on = routes.has(r.id)
              return (
                <button
                  key={r.id}
                  onClick={() =>
                    setRoutes((prev) => {
                      const next = new Set(prev)
                      if (next.has(r.id)) next.delete(r.id)
                      else next.add(r.id)
                      return next
                    })
                  }
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    on
                      ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.06)]'
                      : 'border-[var(--edge-soft)] hover:border-[var(--edge-firm)]'
                  }`}
                >
                  <Icon name={r.icon} size={15} className={r.tone} />
                  <span className="flex-1 text-[12.5px] text-[var(--ink-90)]">{r.label}</span>
                  {on && <Icon name="check" size={13} className="text-accent" />}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={kind === 'desk' ? 'Search desks…' : 'Search rooms…'}
              className="w-full mb-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-3 py-2 fb-t-body text-[var(--ink-100)] placeholder:text-[var(--ink-40)] focus:outline-none focus:border-[rgb(var(--accent))]"
            />
            {candidates.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[var(--ink-50)]">
                {kind === 'desk' ? 'No desks match.' : 'No rooms match.'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {candidates.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onConfirm(kind === 'desk' ? { deskId: n.id } : { roomId: n.id })}
                    data-testid={`home-widget-config-item-${n.id}`}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <Icon
                      name={kind === 'desk' ? 'desk' : 'folder'}
                      size={15}
                      className="text-[var(--ink-50)] shrink-0"
                    />
                    <span className="flex-1 truncate fb-t-body text-[var(--ink-100)]">
                      {n.title || (kind === 'desk' ? 'Untitled desk' : 'Untitled room')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-[var(--edge-soft)] bg-[var(--surface-sunken)] flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        {kind === 'links' && (
          <button
            onClick={() => onConfirm({ routes: QUICK_LINK_ROUTES.filter((r) => routes.has(r.id)).map((r) => r.id) })}
            disabled={routes.size === 0}
            className="btn-primary"
            data-testid="home-widget-config-save"
          >
            <Icon name="check" size={14} />
            <span>Save links</span>
          </button>
        )}
      </div>
    </Modal>
  )
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <p className="py-4 text-center text-[12px] text-[var(--ink-50)]">{text}</p>
}

function QuickAction({
  testid,
  icon,
  tone,
  title,
  blurb,
  onClick
}: {
  testid: string
  icon: string
  tone: 'accent' | 'sky' | 'emerald' | 'violet'
  title: string
  blurb: string
  onClick: () => void
}): JSX.Element {
  const chip =
    tone === 'accent'
      ? 'bg-accent/10 text-accent'
      : tone === 'sky'
        ? 'bg-sky-500/10 text-sky-500'
        : tone === 'emerald'
          ? 'bg-emerald-500/10 text-emerald-500'
          : 'bg-violet-500/10 text-violet-500'
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className="flex items-center gap-2.5 fb-tile fb-press px-2.5 py-2 text-left"
    >
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${chip}`}>
        <Icon name={icon} size={15} />
      </span>
      <span className="min-w-0">
        <span className="block fb-t-label font-semibold text-[var(--ink-100)] truncate">{title}</span>
        <span className="block fb-t-caption truncate">{blurb}</span>
      </span>
    </button>
  )
}
