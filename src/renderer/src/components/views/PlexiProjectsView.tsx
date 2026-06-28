import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { DashboardHeader, StatusPill, PLEXI_CARD } from '../plexi'
import { useViewStore } from '../../stores/view'
import { useQuickCreate } from '../../stores/quickCreate'
import type { ProjectPlan, ProjectSummary, PlanTask } from '@shared/projects'

// PlexiProjects: roll the tasks you already work in up into a scheduled plan. A
// portfolio lists every project (a folder with tasks) with its progress and end
// date; opening one shows a Gantt with a critical path, dependency arrows, a
// today line and drift markers, all computed from real task dates and estimates
// by the engine in shared/gantt.ts. Nothing is invented: a project with no dated
// tasks still shows a real, if trivial, one-day-per-task schedule.

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_W = 26 // px per day
const ROW_H = 32 // px per task row
const HEADER_H = 32
const NAME_W = 224

function toDateInput(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromDateInput(s: string): number | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).getTime()
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function PlexiProjectsView(): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPortfolio = useCallback(() => {
    setError(null)
    window.api.projects
      .list()
      .then(setProjects)
      .catch((e) => setError(`Could not load projects: ${e instanceof Error ? e.message : String(e)}`))
  }, [])

  useEffect(() => {
    loadPortfolio()
  }, [loadPortfolio])

  // Global quick-create (Cmd+K "New project"): create + open straight away.
  const quickPending = useQuickCreate((s) => s.pending)
  useEffect(() => {
    if (quickPending === 'projects' && useQuickCreate.getState().consume('projects')) void newProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickPending])

  // Create a new project (a folder) and open it straight away so the user can add
  // its first task, even before it shows in the portfolio (which lists folders that
  // already have tasks).
  async function newProject(): Promise<void> {
    setError(null)
    try {
      const node = await window.api.nodes.create({ parentId: null, kind: 'folder', title: 'New project' })
      setOpenId(node.id)
    } catch (e) {
      setError(`Could not create the project: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (openId) {
    return <ProjectGantt projectId={openId} onBack={() => { setOpenId(null); loadPortfolio() }} />
  }

  return (
    <div className="h-full w-full overflow-auto bg-[var(--surface-base)] text-[var(--ink-100)]" data-testid="plexiprojects-view">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <DashboardHeader title="Projects" subtitle="Plans, milestones and a timeline built from the tasks you already work in" />
          <button
            onClick={() => void newProject()}
            data-testid="projects-new"
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium hover:bg-[rgb(var(--accent-hover))]"
          >
            <Icon name="add" size={16} /> New project
          </button>
        </div>

        {error && <p className="mb-3 text-rose-500 text-[12px]" data-testid="projects-error">{error}</p>}

        {projects === null ? (
          <div className="flex items-center gap-2 px-3 py-10 text-[13px] text-[var(--ink-70)]">
            <Icon name="progress_activity" size={16} className="text-[rgb(var(--accent))] animate-spin" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="px-3 py-16 text-center" data-testid="projects-empty">
            <Icon name="account_tree" size={30} className="text-[var(--ink-30)]" />
            <p className="mt-3 text-[14px] text-[var(--ink-70)] max-w-md mx-auto leading-relaxed">
              No projects yet. A project is any folder that contains tasks. Create a folder, add tasks under it, and it
              shows up here with a timeline.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="projects-portfolio">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={() => setOpenId(p.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }): JSX.Element {
  return (
    <button
      onClick={onOpen}
      data-testid={`project-card-${project.id}`}
      className={`${PLEXI_CARD} p-4 text-left hover:border-[rgb(var(--accent)/0.40)] transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-[var(--ink-100)] truncate">{project.title}</h3>
        <div className="flex items-center gap-1 shrink-0">
          {project.hasCycle && <StatusPill tone="rose" label="Cycle" dot={false} />}
          {project.hasDrift && <StatusPill tone="amber" label="Drift" dot={false} />}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11.5px] text-[var(--ink-70)]">
          <span className="fb-tabular">{project.doneCount}/{project.taskCount} done</span>
          <span className="fb-tabular">{project.percentComplete}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[rgb(var(--accent))]"
            style={{ width: `${project.percentComplete}%`, minWidth: project.percentComplete > 0 ? '0.375rem' : '0' }}
          />
        </div>
      </div>
      {project.endMs && (
        <p className="mt-2.5 text-[11.5px] text-[var(--ink-50)] fb-tabular">Finishes {fmtDate(project.endMs)}</p>
      )}
    </button>
  )
}

function ProjectGantt({ projectId, onBack }: { projectId: string; onBack: () => void }): JSX.Element {
  const [plan, setPlan] = useState<ProjectPlan | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    window.api.projects
      .plan(projectId)
      .then(setPlan)
      .catch((e) => setError(`Could not load the plan: ${e instanceof Error ? e.message : String(e)}`))
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  async function reschedule(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const next = await window.api.projects.reschedule(projectId)
      setPlan(next)
    } catch (e) {
      setError(`Could not reschedule: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // Add a task to this project (a child of the project folder), then reload so it
  // appears on the timeline.
  async function addTask(): Promise<void> {
    const title = newTitle.trim()
    if (!title) return
    setError(null)
    try {
      const node = await window.api.nodes.create({ parentId: projectId, kind: 'task', title })
      setNewTitle('')
      setAdding(false)
      load()
      setSelectedId(node.id)
    } catch (e) {
      setError(`Could not add the task: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Commit a drag of a task bar: pin its planned start to the dropped day and, if
  // a finish date was set, shift it by the same number of days to keep the length.
  async function rescheduleTask(t: PlanTask, newStartMs: number): Promise<void> {
    setError(null)
    try {
      const patch: { planStart: number; planDue?: number | null } = { planStart: newStartMs }
      if (t.planDue != null && t.planStart != null) {
        patch.planDue = t.planDue + (newStartMs - t.planStart)
      }
      await window.api.projects.setTaskPlan(t.id, patch)
      load()
    } catch (e) {
      setError(`Could not move the task: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const selected = plan?.tasks.find((t) => t.id === selectedId) ?? null

  // Timeline geometry: anchor day 0 to the later of project end and today, padded.
  const geom = useMemo(() => {
    if (!plan) return null
    const now = Date.now()
    const end = Math.max(plan.projectEndMs, now + 2 * DAY_MS)
    const totalDays = Math.max(7, Math.ceil((end - plan.anchorMs) / DAY_MS) + 2)
    const xOf = (ms: number): number => ((ms - plan.anchorMs) / DAY_MS) * DAY_W
    const rowIndex = new Map(plan.tasks.map((t, i) => [t.id, i]))
    return { totalDays, xOf, rowIndex, now, width: totalDays * DAY_W, height: plan.tasks.length * ROW_H }
  }, [plan])

  const critPathSet = useMemo(() => new Set(plan?.criticalPath ?? []), [plan])
  // A task is "late" if it finished after plan (in plan.drift) or is still open
  // and already past its scheduled finish. The second case is the actionable one,
  // a task slipping right now, which the finished-late drift data cannot show.
  const lateSet = useMemo(() => {
    if (!plan) return new Set<string>()
    const now = Date.now()
    const late = new Set(plan.drift.map((d) => d.id))
    for (const t of plan.tasks) {
      const done = t.status === 'done' || t.completedAt != null
      if (!done && !t.isMilestone && t.scheduledEndMs < now) late.add(t.id)
    }
    return late
  }, [plan])

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-base)] text-[var(--ink-100)]" data-testid="plexiprojects-view">
      <div className="px-6 pt-5 pb-3 border-b border-[var(--edge-soft)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            data-testid="projects-back"
            className="inline-flex items-center gap-1 text-[12.5px] text-[var(--ink-70)] hover:text-[var(--ink-100)]"
          >
            <Icon name="arrow_back" size={16} /> Projects
          </button>
          <span className="text-[var(--ink-30)]">/</span>
          <h1 className="fb-display text-[16px] font-bold tracking-tight text-[var(--ink-100)] truncate">{plan?.title ?? 'Project'}</h1>
          <div className="ml-auto flex items-center gap-2">
            <GanttLegend />
            {adding ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addTask()
                    if (e.key === 'Escape') {
                      setAdding(false)
                      setNewTitle('')
                    }
                  }}
                  placeholder="New task title…"
                  data-testid="projects-new-task-input"
                  className="h-8 w-48 rounded-lg bg-[var(--surface-base)] border border-[var(--edge-soft)] px-2.5 text-[12.5px] text-[var(--ink-100)] focus:outline-none focus:border-[rgb(var(--accent)/0.55)]"
                />
                <button
                  onClick={() => void addTask()}
                  disabled={!newTitle.trim()}
                  data-testid="projects-new-task-confirm"
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium hover:bg-[rgb(var(--accent-hover))] disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAdding(false); setNewTitle('') }}
                  className="p-1 rounded text-[var(--ink-50)] hover:text-[var(--ink-100)]"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                data-testid="projects-add-task"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--edge-soft)] text-[12.5px] text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]"
              >
                <Icon name="add" size={15} /> Add task
              </button>
            )}
            <button
              onClick={() => void reschedule()}
              disabled={busy}
              data-testid="projects-reschedule"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium hover:bg-[rgb(var(--accent-hover))] disabled:opacity-40"
              title="Shift the plan to account for what has actually finished"
            >
              <Icon name="update" size={15} /> {busy ? 'Rescheduling…' : 'Reschedule'}
            </button>
          </div>
        </div>
        {plan && plan.drift.some((d) => d.pushesSuccessors) && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-amber-600 dark:text-amber-400">
            <Icon name="warning" size={14} />
            {plan.drift.filter((d) => d.pushesSuccessors).length} task(s) slipped past plan and push later work. Reschedule to shift the timeline.
          </div>
        )}
        {plan?.hasCycle && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-rose-600 dark:text-rose-400">
            <Icon name="error" size={14} />
            This plan has a circular dependency. Remove a link to restore a valid schedule.
          </div>
        )}
        {error && <p className="mt-2 text-rose-500 text-[12px]" data-testid="gantt-error">{error}</p>}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-auto">
          {!plan ? (
            <div className="flex items-center gap-2 px-6 py-10 text-[13px] text-[var(--ink-70)]">
              <Icon name="progress_activity" size={16} className="text-[rgb(var(--accent))] animate-spin" /> Loading plan…
            </div>
          ) : plan.tasks.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Icon name="account_tree" size={28} className="text-[var(--ink-30)]" />
              <p className="mt-2 text-[13px] text-[var(--ink-70)]">This project has no tasks yet. Add tasks to the folder to build a plan.</p>
            </div>
          ) : geom ? (
            <div className="flex">
              {/* Sticky task-name column */}
              <div className="shrink-0 sticky left-0 z-10 bg-[var(--surface-raised)] border-r border-[var(--edge-firm)]" style={{ width: NAME_W }}>
                <div className="border-b border-[var(--edge-firm)]" style={{ height: HEADER_H }} />
                {plan.tasks.map((t) => (
                  <button
                    key={t.id}
                    data-testid={`gantt-row-${t.id}`}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-3 flex items-center gap-2 border-b border-[var(--edge-soft)] transition-colors ${
                      t.id === selectedId
                        ? 'bg-[rgb(var(--accent)/0.10)] border-l-2 border-l-[rgb(var(--accent))]'
                        : 'hover:bg-[rgb(var(--accent)/0.05)] border-l-2 border-l-transparent'
                    }`}
                    style={{ height: ROW_H }}
                  >
                    {t.isMilestone && <Icon name="flag" size={12} className="text-violet-500 shrink-0" filled />}
                    <span className="text-[13px] text-[var(--ink-100)] truncate flex-1">{t.title || 'Untitled'}</span>
                    {(t.status === 'done' || t.completedAt) && (
                      <Icon name="check_circle" size={13} className="text-emerald-500 shrink-0" filled />
                    )}
                  </button>
                ))}
              </div>

              {/* Timeline */}
              <div className="relative" style={{ width: geom.width }}>
                <DateAxis anchorMs={plan.anchorMs} totalDays={geom.totalDays} />
                <div className="relative" style={{ height: geom.height }}>
                  <GridLines totalDays={geom.totalDays} rows={plan.tasks.length} />
                  <DependencyArrows plan={plan} geom={geom} critPathSet={critPathSet} />
                  <TodayLine x={geom.xOf(geom.now)} height={geom.height} />
                  {plan.tasks.map((t, i) => (
                    <TaskBar
                      key={t.id}
                      task={t}
                      x={geom.xOf(t.scheduledStartMs)}
                      y={i * ROW_H}
                      critical={critPathSet.has(t.id) || t.critical}
                      late={lateSet.has(t.id)}
                      anchorMs={plan.anchorMs}
                      onClick={() => setSelectedId(t.id)}
                      onReschedule={(startMs) => void rescheduleTask(t, startMs)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {selected && plan && (
          <TaskEditor
            task={selected}
            allTasks={plan.tasks}
            onClose={() => setSelectedId(null)}
            onChanged={load}
          />
        )}
      </div>
    </div>
  )
}

function GanttLegend(): JSX.Element {
  const item = (cls: string, label: string): JSX.Element => (
    <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--ink-50)]">
      <span className={`h-2 w-3 rounded-[2px] ${cls}`} /> {label}
    </span>
  )
  return (
    <div className="hidden md:flex items-center gap-2.5 mr-1">
      {item('bg-[rgb(var(--accent)/0.20)] ring-1 ring-[rgb(var(--accent)/0.40)]', 'Task')}
      {item('bg-rose-500/35 ring-1 ring-rose-500', 'Critical')}
      {item('bg-emerald-500/20 ring-1 ring-emerald-500/40', 'Done')}
    </div>
  )
}

function DateAxis({ anchorMs, totalDays }: { anchorMs: number; totalDays: number }): JSX.Element {
  const ticks: JSX.Element[] = []
  for (let d = 0; d < totalDays; d += 7) {
    ticks.push(
      <div
        key={d}
        className="absolute top-0 flex items-center text-[11px] font-medium text-[var(--ink-70)] fb-tabular pl-1"
        style={{ left: d * DAY_W, height: HEADER_H }}
      >
        {fmtDate(anchorMs + d * DAY_MS)}
      </div>
    )
  }
  return (
    <div className="relative bg-[var(--surface-raised)] border-b border-[var(--edge-firm)]" style={{ height: HEADER_H }}>
      {ticks}
    </div>
  )
}

function GridLines({ totalDays, rows }: { totalDays: number; rows: number }): JSX.Element {
  const lines: JSX.Element[] = []
  for (let d = 0; d <= totalDays; d += 7) {
    lines.push(
      <div
        key={`v${d}`}
        className="absolute top-0 bottom-0 border-l border-[var(--edge-soft)]"
        style={{ left: d * DAY_W }}
      />
    )
  }
  for (let r = 0; r < rows; r++) {
    lines.push(
      <div
        key={`h${r}`}
        className="absolute left-0 right-0 border-b border-[var(--edge-soft)]"
        style={{ top: r * ROW_H + ROW_H }}
      />
    )
  }
  return <>{lines}</>
}

function TodayLine({ x, height }: { x: number; height: number }): JSX.Element | null {
  if (x < 0) return null
  return (
    <div className="absolute top-0 pointer-events-none" style={{ left: x, height }}>
      <div className="h-full w-px bg-sky-400 opacity-80" />
      <div className="absolute -top-0.5 -left-1 h-2 w-2 rounded-full bg-sky-400" />
    </div>
  )
}

function TaskBar({
  task,
  x,
  y,
  critical,
  late,
  anchorMs,
  onClick,
  onReschedule
}: {
  task: PlanTask
  x: number
  y: number
  critical: boolean
  late: boolean
  anchorMs: number
  onClick: () => void
  onReschedule: (newStartMs: number) => void
}): JSX.Element {
  const done = task.status === 'done' || task.completedAt != null
  const w = Math.max(task.durationDays * DAY_W, 8)
  const top = y + (ROW_H - 16) / 2

  // Drag a bar horizontally to change its start date. We track a live pixel
  // offset while dragging (so the bar follows the cursor), then on release snap
  // to the nearest day and commit. A drag below the threshold is treated as a
  // click (open the editor) so selecting still works.
  const [dx, setDx] = useState(0)
  const drag = useRef<{ startX: number; moved: boolean } | null>(null)

  const onPointerDown = (e: React.PointerEvent): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drag.current) return
    const delta = e.clientX - drag.current.startX
    if (Math.abs(delta) > 3) drag.current.moved = true
    setDx(delta)
  }
  const onPointerUp = (e: React.PointerEvent): void => {
    const d = drag.current
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d) return
    if (!d.moved) {
      setDx(0)
      onClick()
      return
    }
    const days = Math.max(0, Math.round((x + dx) / DAY_W))
    setDx(0)
    onReschedule(anchorMs + days * DAY_MS)
  }
  const dragProps = { onPointerDown, onPointerMove, onPointerUp }

  if (task.isMilestone) {
    return (
      <div
        data-testid={`gantt-bar-${task.id}`}
        role="button"
        tabIndex={0}
        aria-label={`${task.title || 'Untitled'}, ${fmtDate(task.scheduledStartMs)}`}
        {...dragProps}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault()
            onClick()
          }
        }}
        className="absolute cursor-grab active:cursor-grabbing select-none touch-none"
        style={{ left: x - 7 + dx, top: y + (ROW_H - 12) / 2 }}
        title={`${task.title}, ${fmtDate(task.scheduledStartMs)} (drag to reschedule)`}
      >
        <div className="h-3 w-3 rotate-45 bg-violet-500 ring-2 ring-[var(--surface-raised)]" />
      </div>
    )
  }

  // Completed wins, then critical, then a normal accent bar.
  const cls = done
    ? 'bg-emerald-500/20 ring-1 ring-emerald-500/40'
    : critical
      ? 'bg-rose-500/35 dark:bg-rose-500/30 ring-1 ring-rose-500'
      : 'bg-[rgb(var(--accent)/0.20)] ring-1 ring-[rgb(var(--accent)/0.40)]'

  return (
    <div
      data-testid={`gantt-bar-${task.id}`}
      role="button"
      tabIndex={0}
      aria-label={`${task.title || 'Untitled'}, ${fmtDate(task.scheduledStartMs)} to ${fmtDate(task.scheduledEndMs)}`}
      {...dragProps}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault()
          onClick()
        }
      }}
      className={`absolute rounded-[4px] cursor-grab active:cursor-grabbing select-none touch-none transition-colors flex items-center px-1.5 overflow-hidden ${cls}`}
      style={{ left: x + dx, top, width: w, height: 16 }}
      title={`${task.title}, ${fmtDate(task.scheduledStartMs)} to ${fmtDate(task.scheduledEndMs)}${task.slackDays > 0 ? `, ${task.slackDays}d slack` : ', critical'}${late ? (done ? ', finished late' : ', running late') : ''} (drag to reschedule)`}
    >
      {w > 44 && (
        <span className="text-[10px] truncate text-[var(--ink-90)] flex-1">{task.title}</span>
      )}
      {late && (
        <span className="shrink-0 ml-auto inline-flex" data-testid={`gantt-late-${task.id}`}>
          <Icon name="warning" size={11} className="text-amber-500" filled />
        </span>
      )}
    </div>
  )
}

function DependencyArrows({
  plan,
  geom,
  critPathSet
}: {
  plan: ProjectPlan
  geom: { xOf: (ms: number) => number; rowIndex: Map<string, number>; width: number; height: number }
  critPathSet: Set<string>
}): JSX.Element {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]))
  const paths: JSX.Element[] = []
  for (const dep of plan.deps) {
    const pred = byId.get(dep.predId)
    const succ = byId.get(dep.succId)
    const pi = geom.rowIndex.get(dep.predId)
    const si = geom.rowIndex.get(dep.succId)
    if (!pred || !succ || pi === undefined || si === undefined) continue
    const x1 = geom.xOf(pred.scheduledEndMs)
    const y1 = pi * ROW_H + ROW_H / 2
    const x2 = geom.xOf(succ.scheduledStartMs)
    const y2 = si * ROW_H + ROW_H / 2
    const dx = Math.max(12, Math.abs(x2 - x1) / 2)
    const onCrit = critPathSet.has(dep.predId) && critPathSet.has(dep.succId)
    paths.push(
      <path
        key={dep.id}
        d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
        fill="none"
        stroke={onCrit ? 'rgb(var(--accent))' : 'var(--edge-firm)'}
        strokeWidth={onCrit ? 1.5 : 1}
        strokeOpacity={onCrit ? 0.7 : 0.5}
        markerEnd="url(#gantt-arrow)"
      />
    )
  }
  return (
    <svg className="absolute top-0 left-0 pointer-events-none" width={geom.width} height={geom.height}>
      <defs>
        <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--edge-firm)" />
        </marker>
      </defs>
      {paths}
    </svg>
  )
}

function TaskEditor({
  task,
  allTasks,
  onClose,
  onChanged
}: {
  task: PlanTask
  allTasks: PlanTask[]
  onClose: () => void
  onChanged: () => void
}): JSX.Element {
  const goTask = useViewStore((s) => s.goTask)
  const [depPick, setDepPick] = useState('')
  const [succPick, setSuccPick] = useState('')
  const [depError, setDepError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState(task.title)

  // Keep the title field in sync when a different task is selected.
  useEffect(() => setTitle(task.title), [task.id, task.title])

  async function saveTitle(): Promise<void> {
    const next = title.trim()
    if (!next || next === task.title) return
    setError(null)
    try {
      await window.api.nodes.update(task.id, { title: next })
      onChanged()
    } catch (e) {
      setError(`Could not rename the task: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function removeTask(): Promise<void> {
    setError(null)
    try {
      await window.api.nodes.delete(task.id)
      onClose()
      onChanged()
    } catch (e) {
      setError(`Could not delete the task: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function patch(p: Parameters<typeof window.api.projects.setTaskPlan>[1]): Promise<void> {
    setError(null)
    try {
      await window.api.projects.setTaskPlan(task.id, p)
      onChanged()
    } catch (e) {
      setError(`Could not save the change: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function addDep(predId: string): Promise<void> {
    setDepError(null)
    try {
      const r = await window.api.projects.addDep(predId, task.id)
      if (!r.ok) {
        setDepError(
          r.reason === 'cycle'
            ? 'That would create a circular dependency.'
            : r.reason === 'duplicate'
              ? 'That dependency already exists.'
              : 'Could not add that dependency.'
        )
        return
      }
      setDepPick('')
      onChanged()
    } catch (e) {
      setDepError(`Could not add that dependency: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function removeDep(predId: string): Promise<void> {
    setError(null)
    try {
      await window.api.projects.removeDep(predId, task.id)
      onChanged()
    } catch (e) {
      setError(`Could not remove that dependency: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Successors are the mirror of dependencies: a task that depends on this one.
  // Adding one makes this task its predecessor.
  async function addSucc(succId: string): Promise<void> {
    setDepError(null)
    try {
      const r = await window.api.projects.addDep(task.id, succId)
      if (!r.ok) {
        setDepError(
          r.reason === 'cycle'
            ? 'That would create a circular dependency.'
            : r.reason === 'duplicate'
              ? 'That link already exists.'
              : 'Could not add that successor.'
        )
        return
      }
      setSuccPick('')
      onChanged()
    } catch (e) {
      setDepError(`Could not add that successor: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function removeSucc(succId: string): Promise<void> {
    setError(null)
    try {
      await window.api.projects.removeDep(task.id, succId)
      onChanged()
    } catch (e) {
      setError(`Could not remove that successor: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const candidates = allTasks.filter((t) => t.id !== task.id && !task.deps.includes(t.id))
  const successors = allTasks.filter((t) => t.deps.includes(task.id))
  const succCandidates = allTasks.filter((t) => t.id !== task.id && !t.deps.includes(task.id))
  const titleOf = (id: string): string => allTasks.find((t) => t.id === id)?.title || 'Task'

  return (
    <div className="w-[300px] shrink-0 border-l border-[var(--edge-soft)] bg-[var(--surface-raised)] overflow-auto" data-testid="task-editor">
      <div className="px-4 py-3 border-b border-[var(--edge-soft)]">
        <div className="flex items-center gap-1.5">
          <input
            value={title}
            data-testid="task-title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void saveTitle()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            placeholder="Task title"
            className="flex-1 min-w-0 rounded-md bg-transparent border border-transparent hover:border-[var(--edge-soft)] focus:border-[rgb(var(--accent)/0.55)] px-1.5 py-1 text-[13px] font-semibold text-[var(--ink-100)] focus:outline-none focus:bg-[var(--surface-base)]"
          />
          <button onClick={onClose} className="shrink-0 p-1 rounded text-[var(--ink-50)] hover:text-[var(--ink-100)]" title="Close">
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => goTask(task.id)}
            data-testid="task-open"
            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ink-70)] hover:text-[rgb(var(--accent))]"
            title="Open this task, its notes and attachments"
          >
            <Icon name="open_in_new" size={13} /> Open task &amp; files
          </button>
          <button
            onClick={() => void removeTask()}
            data-testid="task-delete"
            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ink-70)] hover:text-rose-500 ml-auto"
            title="Move this task to trash"
          >
            <Icon name="delete" size={13} /> Delete
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <label className="block">
          <span className="text-[11px] text-[var(--ink-70)]">Planned start</span>
          <input
            type="date"
            value={toDateInput(task.planStart)}
            data-testid="task-plan-start"
            onChange={(e) => void patch({ planStart: fromDateInput(e.target.value) })}
            className="mt-1 w-full rounded-md bg-[var(--surface-base)] border border-[var(--edge-soft)] px-2 py-1.5 text-[12px] text-[var(--ink-100)] focus:outline-none focus:border-[rgb(var(--accent)/0.55)]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--ink-70)]">Planned finish</span>
          <input
            type="date"
            value={toDateInput(task.planDue)}
            data-testid="task-plan-due"
            onChange={(e) => void patch({ planDue: fromDateInput(e.target.value) })}
            className="mt-1 w-full rounded-md bg-[var(--surface-base)] border border-[var(--edge-soft)] px-2 py-1.5 text-[12px] text-[var(--ink-100)] focus:outline-none focus:border-[rgb(var(--accent)/0.55)]"
          />
        </label>

        {!task.isMilestone && (
          <label className="block">
            <span className="text-[11px] text-[var(--ink-70)]">Length in working days (used when no finish date)</span>
            <input
              type="number"
              min={1}
              value={task.estimateMinutes ? Math.max(1, Math.round(task.estimateMinutes / (60 * 8))) : ''}
              placeholder="e.g. 3"
              data-testid="task-estimate-days"
              onChange={(e) => {
                const raw = e.target.value
                if (raw.trim() === '') {
                  void patch({ estimateMinutes: null })
                  return
                }
                const days = Math.min(3650, Math.round(Number(raw)))
                if (Number.isInteger(days) && days > 0) {
                  void patch({ estimateMinutes: days * 8 * 60 })
                }
              }}
              className="mt-1 w-full rounded-md bg-[var(--surface-base)] border border-[var(--edge-soft)] px-2 py-1.5 text-[12px] text-[var(--ink-100)] focus:outline-none focus:border-[rgb(var(--accent)/0.55)]"
            />
          </label>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={task.isMilestone}
            data-testid="task-milestone"
            onChange={(e) => void patch({ isMilestone: e.target.checked })}
            className="accent-[rgb(var(--accent))]"
          />
          <span className="text-[12px] text-[var(--ink-90)]">Milestone (zero-duration marker)</span>
        </label>

        <div>
          <span className="text-[11px] text-[var(--ink-70)]">Depends on (finish first)</span>
          <div className="mt-1.5 space-y-1">
            {task.deps.length === 0 && <p className="text-[11.5px] text-[var(--ink-50)]">No dependencies.</p>}
            {task.deps.map((d) => (
              <div key={d} className="flex items-center gap-1.5 text-[12px] text-[var(--ink-90)] bg-[var(--surface-sunken)] rounded px-2 py-1">
                <Icon name="arrow_forward" size={12} className="text-[var(--ink-50)]" />
                <span className="truncate flex-1">{titleOf(d)}</span>
                <button onClick={() => void removeDep(d)} className="text-[var(--ink-50)] hover:text-rose-500">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
          {candidates.length > 0 && (
            <select
              value={depPick}
              data-testid="task-add-dep"
              onChange={(e) => {
                setDepPick(e.target.value)
                if (e.target.value) void addDep(e.target.value)
              }}
              className="mt-1.5 w-full rounded-md bg-[var(--surface-base)] border border-[var(--edge-soft)] px-2 py-1.5 text-[12px] text-[var(--ink-100)] focus:outline-none"
            >
              <option value="">Add a predecessor…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || 'Untitled'}
                </option>
              ))}
            </select>
          )}
          {depError && <p className="mt-1 text-[11px] text-rose-500">{depError}</p>}
        </div>

        <div>
          <span className="text-[11px] text-[var(--ink-70)]">Blocks (must finish before)</span>
          <div className="mt-1.5 space-y-1">
            {successors.length === 0 && <p className="text-[11.5px] text-[var(--ink-50)]">Nothing waits on this.</p>}
            {successors.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5 text-[12px] text-[var(--ink-90)] bg-[var(--surface-sunken)] rounded px-2 py-1">
                <Icon name="arrow_back" size={12} className="text-[var(--ink-50)]" />
                <span className="truncate flex-1">{s.title || 'Untitled'}</span>
                <button onClick={() => void removeSucc(s.id)} className="text-[var(--ink-50)] hover:text-rose-500">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
          {succCandidates.length > 0 && (
            <select
              value={succPick}
              data-testid="task-add-succ"
              onChange={(e) => {
                setSuccPick(e.target.value)
                if (e.target.value) void addSucc(e.target.value)
              }}
              className="mt-1.5 w-full rounded-md bg-[var(--surface-base)] border border-[var(--edge-soft)] px-2 py-1.5 text-[12px] text-[var(--ink-100)] focus:outline-none"
            >
              <option value="">Add a successor…</option>
              {succCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || 'Untitled'}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="text-rose-500 text-[12px]" data-testid="task-editor-error">{error}</p>}

        <div className="pt-1 text-[11px] text-[var(--ink-50)] space-y-0.5">
          <p className="fb-tabular">Scheduled {fmtDate(task.scheduledStartMs)} to {fmtDate(task.scheduledEndMs)}</p>
          <p className="fb-tabular">{task.critical ? 'On the critical path' : `${task.slackDays} day(s) of slack`}</p>
        </div>
      </div>
    </div>
  )
}
