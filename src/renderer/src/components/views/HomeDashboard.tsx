import { useEffect, useMemo, useState } from 'react'
import { useViewStore } from '../../stores/view'
import { useAccountStore } from '../../stores/account'
import { useDocumentsStore } from '../../stores/documents'
import { useNodeStore } from '../../stores/nodes'
import { useAiCommandBar } from '../../stores/aiCommandBar'
import { useFocusSessionStore } from '../../stores/focusSession'
import { RailCard, PLEXI_CARD } from '../plexi'
import Icon from '../Icon'
import type { ActivityEvent, ActivityKind, DocumentMeta, FbNode, TimeBlock } from '@shared/types'

// Home — the landing dashboard for the workspace. Every section here reads a
// real source and shows an honest empty or zero state when there is nothing to
// show. Nothing on this page is seeded or invented: no named people, no fake
// counts, no fabricated meetings or productivity percentages. An empty workspace
// shows empty cards, a thin workspace shows only what is genuinely there.
//
// Real sources, section by section:
//   greeting            useAccountStore().account.handle (+ time-of-day from the clock)
//   continue            useDocumentsStore().list, sorted by real updatedAt
//   your desk           window.api.nodes.list() — the real desks/tasks
//   today's agenda      window.api.timeBlocks.list() for the local day
//   recent activity     window.api.trail.recent(null, ...) — the real activity log
//   insights            real counts derived from the nodes + the agenda + the docs
//   quick actions       navigate to real destinations via the view store
//   ask PlexiBrain      opens the real AI command bar (useAiCommandBar)
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

// Honest activity summary, mirroring the per-task trail card's vocabulary. Reads
// only the real payload; never asserts a person or action that is not recorded.
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

  const focusActive = useFocusSessionStore((s) => s.active)
  const startFocus = useFocusSessionStore((s) => s.start)
  const finishFocus = useFocusSessionStore((s) => s.finish)

  // Today's real time blocks and the real workspace-wide activity feed are loaded
  // imperatively. null means "still loading"; [] means "loaded, genuinely empty".
  const [agenda, setAgenda] = useState<TimeBlock[] | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null)
  // A clock that ticks each minute so the greeting + relative times stay current.
  const [now, setNow] = useState(() => Date.now())

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

  const name = greetingName(account?.handle, account?.email ?? null)

  // Continue where you left off — the real documents you last touched.
  const recentDocs = useMemo<DocumentMeta[]>(
    () =>
      docs
        .filter((d) => !d.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4),
    [docs]
  )

  // Your desks — the real top-level desks (folders) plus standalone task desks,
  // newest first. We do not invent widget counts; a desk shows its real edited
  // time, not a fabricated "12 widgets".
  const desks = useMemo<FbNode[]>(
    () =>
      nodes
        .filter((n) => !n.archived && (n.kind === 'folder' || (n.kind === 'task' && n.parentId === null)))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
    [nodes]
  )

  // Today's agenda — only the events that fall on the local day, in time order.
  const todayEvents = useMemo<TimeBlock[]>(() => {
    if (!agenda) return []
    return [...agenda].sort((a, b) => a.startMs - b.startMs).slice(0, 6)
  }, [agenda])

  // PlexiBrain insights — real counts only. Tasks due today / overdue come from
  // the real nodes; events today from the real agenda; open desks from the nodes.
  // Anything not instrumented (productivity %, focus-time %) is deliberately absent.
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

  const recentActivity = useMemo(() => (activity ?? []).slice(0, 6), [activity])

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

  const onCreate = async (): Promise<void> => {
    // Create a real blank document and open it — the same path the documents hub
    // uses for its New button.
    const doc = await createBlankDoc('doc')
    v.goDocument(doc.id)
  }

  const onNewDesk = async (): Promise<void> => {
    try {
      const node = await createNode({ parentId: null, kind: 'task', title: 'New desk' })
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

  return (
    <div
      className="h-full w-full overflow-auto bg-[var(--surface-base)] text-[var(--ink-100)]"
      data-testid="home-dashboard"
    >
      <div className="max-w-6xl mx-auto px-6 py-7">
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
          <button
            onClick={() => void toggleFocus()}
            data-testid="home-focus-toggle"
            className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-[13px] font-medium border transition-colors ${
              focusActive
                ? 'border-violet-500/40 bg-violet-500/15 text-violet-500'
                : 'border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]'
            }`}
          >
            <Icon name={focusActive ? 'stop_circle' : 'bolt'} size={16} />
            {focusActive ? 'End focus mode' : 'Focus mode'}
          </button>
        </header>

        {/* Ask PlexiBrain command bar trigger */}
        <button
          onClick={() => openAiBar(true)}
          data-testid="home-ask-brain"
          className={`${PLEXI_CARD} w-full flex items-center gap-3 px-4 py-3 mb-6 text-left hover:border-[rgb(var(--accent))]/40 transition-colors`}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
            <Icon name="auto_awesome" size={17} />
          </span>
          <span className="flex-1 text-[13.5px] text-[var(--ink-50)]">
            Ask PlexiBrain or type a command
          </span>
          <span className="shrink-0 text-[11px] text-[var(--ink-40)] border border-[var(--edge-soft)] rounded px-1.5 py-0.5 fb-tabular">
            ⌘⇧K
          </span>
        </button>

        {/* Quick actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
          <QuickAction
            testid="home-quick-create"
            icon="add"
            tone="accent"
            title="Create"
            blurb="Start a new document"
            onClick={() => void onCreate()}
          />
          <QuickAction
            testid="home-quick-plan"
            icon="checklist"
            tone="sky"
            title="Plan"
            blurb="Open your plans and tasks"
            onClick={() => v.goPlexiDesk('plans')}
          />
          <QuickAction
            testid="home-quick-collaborate"
            icon="group"
            tone="emerald"
            title="Collaborate"
            blurb="See your shared work"
            onClick={() => v.goCollaborations()}
          />
          <QuickAction
            testid="home-quick-automate"
            icon="bolt"
            tone="violet"
            title="Automate"
            blurb="Build a PlexiBrain flow"
            onClick={() => v.goPlexiBrain('flows')}
          />
        </div>

        {/* PlexiBrain insights — real counts only */}
        <div className="mb-7" data-testid="home-insights">
          <SectionLabel text="PlexiBrain insights" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.map((s) => (
              <div key={s.id} className={`${PLEXI_CARD} p-3.5`}>
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
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
                  <Icon name={s.icon} size={17} />
                </span>
                <div className="mt-2 fb-display fb-tabular text-[24px] leading-none text-[var(--ink-100)]">
                  {s.value}
                </div>
                <div className="mt-1 text-[12px] text-[var(--ink-50)]">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-40)]">
            Counts come straight from your tasks and calendar. Productivity and focus-time
            scores are not tracked yet, so they are not shown.
          </p>
        </div>

        {/* Two-column body: main column + right rail */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="space-y-5">
            {/* Continue where you left off */}
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
                        className="flex items-center gap-3 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-3 py-2.5 text-left hover:border-[rgb(var(--accent))]/40 transition-colors"
                      >
                        <Icon name={ti.icon} size={20} className={`${ti.tint} shrink-0`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-[var(--ink-100)]">
                            {d.title || 'Untitled'}
                          </span>
                          <span className="block text-[11.5px] text-[var(--ink-50)]">
                            {ti.label}, edited {relTime(d.updatedAt)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </RailCard>

            {/* Your desk */}
            <RailCard
              title="Your desk"
              icon="desk"
              tone="violet"
              action={{ label: 'Open workspace', onClick: () => v.goPlexiDesk() }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="home-desks">
                {desks.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openDesk(n)}
                    data-testid={`home-desk-${n.id}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-3 py-2.5 text-left hover:border-[rgb(var(--accent))]/40 transition-colors"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
                      <Icon name={n.kind === 'folder' ? 'folder' : 'desk'} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-[var(--ink-100)]">
                        {n.title || 'Untitled desk'}
                      </span>
                      <span className="block text-[11.5px] text-[var(--ink-50)]">
                        Edited {relTime(n.updatedAt)}
                      </span>
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => void onNewDesk()}
                  data-testid="home-desk-new"
                  className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--edge-soft)] px-3 py-2.5 text-left text-[var(--ink-60)] hover:border-[rgb(var(--accent))]/50 hover:text-[rgb(var(--accent))] transition-colors"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-sunken)] shrink-0">
                    <Icon name="add" size={18} />
                  </span>
                  <span className="text-[13px] font-medium">New desk</span>
                </button>
              </div>
            </RailCard>
          </div>

          {/* Right rail: agenda + activity */}
          <div className="space-y-5">
            <RailCard
              title="Today's agenda"
              icon="calendar_today"
              tone="sky"
              action={{ label: 'Calendar', onClick: () => v.goCalendar() }}
            >
              {agenda === null ? (
                <EmptyState text="Loading your day…" />
              ) : todayEvents.length === 0 ? (
                <p
                  className="py-4 text-center text-[12px] text-[var(--ink-50)]"
                  data-testid="home-agenda-empty"
                >
                  Nothing scheduled today.
                </p>
              ) : (
                <ul className="space-y-1.5" data-testid="home-agenda">
                  {todayEvents.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2.5 px-1 py-1"
                      data-testid={`home-agenda-item-${b.id}`}
                    >
                      <span className="shrink-0 text-[11px] text-[var(--ink-50)] fb-tabular w-14">
                        {clockTime(b.startMs)}
                      </span>
                      <span className="flex-1 truncate text-[12.5px] text-[var(--ink-100)]">
                        {b.title || 'Time block'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </RailCard>

            <RailCard title="Recent activity" icon="bolt" tone="accent">
              {activity === null ? (
                <EmptyState text="Loading recent activity…" />
              ) : recentActivity.length === 0 ? (
                <p
                  className="py-4 text-center text-[12px] text-[var(--ink-50)]"
                  data-testid="home-activity-empty"
                >
                  No recent activity yet. As you open desks and run sessions, it shows up here.
                </p>
              ) : (
                <ul className="space-y-0.5" data-testid="home-activity">
                  {recentActivity.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-2.5 px-1 py-1.5"
                      data-testid={`home-activity-item-${e.id}`}
                    >
                      <Icon
                        name={ACTIVITY_ICON[e.kind] ?? 'circle'}
                        size={14}
                        className="text-[var(--ink-40)] shrink-0"
                      />
                      <span className="flex-1 truncate text-[12px] text-[var(--ink-90)]">
                        {summarizeActivity(e)}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-50)] fb-tabular">
                        {relTime(e.ts)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </RailCard>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ text }: { text: string }): JSX.Element {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--ink-50)]">
        {text}
      </h2>
      <div className="flex-1 h-px bg-[var(--edge-soft)]" />
    </div>
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
      className={`${PLEXI_CARD} flex flex-col gap-2.5 p-4 text-left hover:border-[rgb(var(--accent))]/40 transition-colors`}
    >
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${chip}`}>
        <Icon name={icon} size={18} />
      </span>
      <span>
        <span className="block text-[14px] font-semibold text-[var(--ink-100)]">{title}</span>
        <span className="block text-[12px] text-[var(--ink-50)]">{blurb}</span>
      </span>
    </button>
  )
}
