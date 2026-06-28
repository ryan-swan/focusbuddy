import { randomUUID } from 'crypto'
import { getDb } from './database'
import {
  computeSchedule,
  detectDrift,
  rescheduleOnDrift,
  DAY_MS,
  type GanttInput,
  type DepLink
} from '@shared/gantt'
import { makeDayToMs, workingDaysBetween, DEFAULT_CALENDAR } from '@shared/workingCalendar'
import type {
  ProjectPlan,
  PlanTask,
  PlanDep,
  ProjectSummary,
  PlanTaskPatch,
  AddDepResult,
  DepType
} from '@shared/projects'

// The PlexiProjects plan store. A project is an existing folder node; its plan is
// the task nodes beneath it plus the finish-to-start dependencies between them.
// This module reads those, runs the critical-path engine (gantt.ts) and returns a
// fully scheduled ProjectPlan. It also persists planning edits (dates, milestone,
// dependencies) and can auto-reschedule the plan from what actually happened.
// Nothing here invents data: a project with no dated tasks still returns a real,
// if trivial, schedule anchored at today.

interface TaskRow {
  id: string
  title: string
  status: string
  is_milestone: number | null
  plan_start: number | null
  due_date: number | null
  estimate_minutes: number | null
  started_at: number | null
  completed_at: number | null
  assignee: string | null
  progress_pct: number | null
}

// All non-trashed, non-archived task descendants of a project folder, at any
// depth, via a recursive walk of parent_id.
function projectTaskRows(projectId: string): TaskRow[] {
  const db = getDb()
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM nodes WHERE parent_id = ?
         UNION ALL
         SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
       )
       SELECT n.id, n.title, n.status, n.is_milestone, n.plan_start, n.due_date,
              n.estimate_minutes, n.started_at, n.completed_at, n.assignee, n.progress_pct
       FROM nodes n JOIN sub ON n.id = sub.id
       WHERE n.kind = 'task' AND n.trashed_at IS NULL AND n.archived = 0`
    )
    .all(projectId) as TaskRow[]
  return rows
}

// Dependencies whose endpoints are both inside the given task-id set, carrying
// their type (FS/SS/FF/SF) and working-day lag.
function projectDeps(taskIds: Set<string>): PlanDep[] {
  if (taskIds.size === 0) return []
  const db = getDb()
  const rows = db.prepare('SELECT id, pred_id, succ_id, dep_type, lag_days FROM fb_task_deps').all() as Array<{
    id: string
    pred_id: string
    succ_id: string
    dep_type: string | null
    lag_days: number | null
  }>
  const VALID: DepType[] = ['FS', 'SS', 'FF', 'SF']
  return rows
    .filter((r) => taskIds.has(r.pred_id) && taskIds.has(r.succ_id))
    .map((r) => ({
      id: r.id,
      predId: r.pred_id,
      succId: r.succ_id,
      type: VALID.includes((r.dep_type ?? 'FS') as DepType) ? ((r.dep_type ?? 'FS') as DepType) : 'FS',
      lag: r.lag_days ?? 0
    }))
}

// The working calendar applied to scheduling. A Monday-to-Friday week by default
// so the timeline skips weekends the way Microsoft Project does.
const PROJECT_CALENDAR = DEFAULT_CALENDAR

// Whole-day duration for a task in WORKING days: from explicit start/due when
// both are set, otherwise from the estimate at an 8 hour working day, otherwise
// one day. A milestone is always zero.
function durationDays(row: TaskRow): number {
  if (row.is_milestone) return 0
  if (row.plan_start != null && row.due_date != null && row.due_date > row.plan_start) {
    return Math.max(1, workingDaysBetween(row.plan_start, row.due_date, PROJECT_CALENDAR))
  }
  if (row.estimate_minutes && row.estimate_minutes > 0) {
    return Math.max(1, Math.ceil(row.estimate_minutes / (60 * 8)))
  }
  return 1
}

// Working-day offset of a timestamp from the anchor (for minStartDay / actuals).
function workingOffset(anchor: number, ms: number): number {
  return ms <= anchor ? 0 : workingDaysBetween(anchor, ms, PROJECT_CALENDAR)
}

// Midnight-floored anchor: the earliest planned start across the tasks, or today
// when nothing is dated, so the schedule has a stable day-0 to offset from.
function planAnchor(rows: TaskRow[], nowMs: number): number {
  const starts = rows.map((r) => r.plan_start).filter((s): s is number => s != null)
  const base = starts.length ? Math.min(...starts) : nowMs
  return Math.floor(base / DAY_MS) * DAY_MS
}

export function getProjectPlan(projectId: string, nowMs = Date.now()): ProjectPlan {
  const db = getDb()
  const projectRow = db.prepare('SELECT id, title FROM nodes WHERE id = ?').get(projectId) as
    | { id: string; title: string }
    | undefined
  const rows = projectTaskRows(projectId)
  const ids = new Set(rows.map((r) => r.id))
  const deps = projectDeps(ids)
  const anchor = planAnchor(rows, nowMs)
  const dayToMs = makeDayToMs(anchor, PROJECT_CALENDAR)

  const predsByTask = new Map<string, string[]>()
  const linksByTask = new Map<string, DepLink[]>()
  for (const d of deps) {
    predsByTask.set(d.succId, [...(predsByTask.get(d.succId) ?? []), d.predId])
    linksByTask.set(d.succId, [...(linksByTask.get(d.succId) ?? []), { id: d.predId, type: d.type, lag: d.lag }])
  }

  const inputs: GanttInput[] = rows.map((r) => ({
    id: r.id,
    durationDays: durationDays(r),
    deps: predsByTask.get(r.id) ?? [],
    links: linksByTask.get(r.id),
    isMilestone: !!r.is_milestone,
    minStartDay: r.plan_start != null ? workingOffset(anchor, r.plan_start) : undefined
  }))

  const schedule = computeSchedule(inputs, anchor, dayToMs)
  const schedById = new Map(schedule.tasks.map((s) => [s.id, s]))

  // Actual finishes (completed_at) as working-day offsets, for drift detection.
  const actualFinish = new Map<string, number>()
  for (const r of rows) {
    if (r.completed_at != null) actualFinish.set(r.id, workingOffset(anchor, r.completed_at))
  }
  const drift = detectDrift(schedule, actualFinish)

  const tasks: PlanTask[] = rows.map((r) => {
    const s = schedById.get(r.id)!
    const done = r.status === 'done' || r.completed_at != null
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      isMilestone: !!r.is_milestone,
      planStart: r.plan_start,
      planDue: r.due_date,
      estimateMinutes: r.estimate_minutes,
      assignee: r.assignee ?? null,
      progressPct: done ? 100 : Math.max(0, Math.min(100, Math.round(r.progress_pct ?? 0))),
      startedAt: r.started_at,
      completedAt: r.completed_at,
      scheduledStartMs: s.startMs,
      scheduledEndMs: s.endMs,
      durationDays: s.durationDays,
      slackDays: s.slackDays,
      critical: s.critical,
      deps: predsByTask.get(r.id) ?? []
    }
  })
  // Stable order: by scheduled start, then title, so the Gantt reads top-down.
  tasks.sort((a, b) => a.scheduledStartMs - b.scheduledStartMs || a.title.localeCompare(b.title))

  return {
    projectId,
    title: projectRow?.title ?? 'Project',
    anchorMs: anchor,
    projectEndMs: schedule.projectEndMs,
    tasks,
    deps,
    criticalPath: schedule.criticalPath,
    hasCycle: schedule.hasCycle,
    drift
  }
}

export function setTaskPlan(taskId: string, patch: PlanTaskPatch): boolean {
  const db = getDb()
  const sets: string[] = []
  const vals: Array<number | string | null> = []
  if ('planStart' in patch) {
    sets.push('plan_start = ?')
    vals.push(patch.planStart ?? null)
  }
  if ('planDue' in patch) {
    sets.push('due_date = ?')
    vals.push(patch.planDue ?? null)
  }
  if ('estimateMinutes' in patch) {
    sets.push('estimate_minutes = ?')
    vals.push(patch.estimateMinutes ?? null)
  }
  if ('isMilestone' in patch) {
    sets.push('is_milestone = ?')
    vals.push(patch.isMilestone ? 1 : 0)
  }
  if ('assignee' in patch) {
    const a = (patch.assignee ?? '').toString().trim()
    sets.push('assignee = ?')
    vals.push(a ? a.slice(0, 200) : null)
  }
  if ('progressPct' in patch) {
    sets.push('progress_pct = ?')
    vals.push(Math.max(0, Math.min(100, Math.round(patch.progressPct ?? 0))))
  }
  if (sets.length === 0) return false
  sets.push('updated_at = ?')
  vals.push(Date.now())
  vals.push(taskId)
  const res = db.prepare(`UPDATE nodes SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return res.changes > 0
}

// Would adding pred -> succ create a cycle? True when succ can already reach pred
// through existing edges (so pred would then depend on itself transitively).
function wouldCycle(predId: string, succId: string): boolean {
  const db = getDb()
  const edges = db.prepare('SELECT pred_id, succ_id FROM fb_task_deps').all() as Array<{
    pred_id: string
    succ_id: string
  }>
  const adj = new Map<string, string[]>()
  for (const e of edges) adj.set(e.pred_id, [...(adj.get(e.pred_id) ?? []), e.succ_id])
  // Can we reach predId starting from succId? If so, pred->succ closes a loop.
  const stack = [succId]
  const seen = new Set<string>()
  while (stack.length) {
    const n = stack.pop()!
    if (n === predId) return true
    if (seen.has(n)) continue
    seen.add(n)
    for (const m of adj.get(n) ?? []) stack.push(m)
  }
  return false
}

export function addDependency(predId: string, succId: string, type: DepType = 'FS', lag = 0): AddDepResult {
  const db = getDb()
  if (predId === succId) return { ok: false, reason: 'self' }
  const exists = (id: string): boolean =>
    !!db.prepare('SELECT id FROM nodes WHERE id = ? AND trashed_at IS NULL').get(id)
  if (!exists(predId) || !exists(succId)) return { ok: false, reason: 'missing' }
  const dup = db
    .prepare('SELECT id FROM fb_task_deps WHERE pred_id = ? AND succ_id = ?')
    .get(predId, succId)
  if (dup) return { ok: false, reason: 'duplicate' }
  if (wouldCycle(predId, succId)) return { ok: false, reason: 'cycle' }
  const safeType: DepType = (['FS', 'SS', 'FF', 'SF'] as DepType[]).includes(type) ? type : 'FS'
  const safeLag = Number.isFinite(lag) ? Math.trunc(lag) : 0
  const id = randomUUID()
  db.prepare('INSERT INTO fb_task_deps (id, pred_id, succ_id, dep_type, lag_days, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    predId,
    succId,
    safeType,
    safeLag,
    Date.now()
  )
  return { ok: true, dep: { id, predId, succId, type: safeType, lag: safeLag } }
}

// Update an existing dependency's type and/or lag.
export function setDependency(predId: string, succId: string, type: DepType, lag: number): boolean {
  const db = getDb()
  const safeType: DepType = (['FS', 'SS', 'FF', 'SF'] as DepType[]).includes(type) ? type : 'FS'
  const safeLag = Number.isFinite(lag) ? Math.trunc(lag) : 0
  const res = db
    .prepare('UPDATE fb_task_deps SET dep_type = ?, lag_days = ? WHERE pred_id = ? AND succ_id = ?')
    .run(safeType, safeLag, predId, succId)
  return res.changes > 0
}

export function removeDependency(predId: string, succId: string): boolean {
  const db = getDb()
  const res = db.prepare('DELETE FROM fb_task_deps WHERE pred_id = ? AND succ_id = ?').run(predId, succId)
  return res.changes > 0
}

// Auto-reschedule: recompute the plan honouring actual finishes, then persist the
// shifted planned start/due dates back onto the tasks so the saved plan matches
// reality. Returns the freshly read plan. Milestones and untouched tasks keep
// their dates unless a slip pushes them.
export function rescheduleProject(projectId: string, nowMs = Date.now()): ProjectPlan {
  const db = getDb()
  const rows = projectTaskRows(projectId)
  const ids = new Set(rows.map((r) => r.id))
  const deps = projectDeps(ids)
  const anchor = planAnchor(rows, nowMs)
  const dayToMs = makeDayToMs(anchor, PROJECT_CALENDAR)
  const predsByTask = new Map<string, string[]>()
  const linksByTask = new Map<string, DepLink[]>()
  for (const d of deps) {
    predsByTask.set(d.succId, [...(predsByTask.get(d.succId) ?? []), d.predId])
    linksByTask.set(d.succId, [...(linksByTask.get(d.succId) ?? []), { id: d.predId, type: d.type, lag: d.lag }])
  }

  const inputs: GanttInput[] = rows.map((r) => ({
    id: r.id,
    durationDays: durationDays(r),
    deps: predsByTask.get(r.id) ?? [],
    links: linksByTask.get(r.id),
    isMilestone: !!r.is_milestone,
    minStartDay: r.plan_start != null ? workingOffset(anchor, r.plan_start) : undefined
  }))
  const actualFinish = new Map<string, number>()
  for (const r of rows) {
    if (r.completed_at != null) actualFinish.set(r.id, workingOffset(anchor, r.completed_at))
  }

  const rescheduled = rescheduleOnDrift(inputs, anchor, actualFinish, dayToMs)
  const upd = db.prepare('UPDATE nodes SET plan_start = ?, due_date = ?, updated_at = ? WHERE id = ?')
  const now = Date.now()
  const writeAll = db.transaction((tasks: typeof rescheduled.tasks) => {
    for (const s of tasks) {
      // Persist the new planned window. A milestone keeps a single instant.
      const params: Array<number | string> = [s.startMs, s.isMilestone ? s.startMs : s.endMs, now, s.id]
      upd.run(...params)
    }
  })
  writeAll(rescheduled.tasks)
  return getProjectPlan(projectId, nowMs)
}

// Every folder node that contains at least one task, with a rollup for the
// portfolio view. percentComplete is real, computed from task status.
export function listProjectSummaries(nowMs = Date.now()): ProjectSummary[] {
  const db = getDb()
  const folders = db
    .prepare(`SELECT id, title FROM nodes WHERE kind = 'folder' AND trashed_at IS NULL AND archived = 0`)
    .all() as Array<{ id: string; title: string }>
  const out: ProjectSummary[] = []
  for (const f of folders) {
    const rows = projectTaskRows(f.id)
    if (rows.length === 0) continue
    const doneCount = rows.filter((r) => r.status === 'done' || r.completed_at != null).length
    const plan = getProjectPlan(f.id, nowMs)
    out.push({
      id: f.id,
      title: f.title,
      taskCount: rows.length,
      doneCount,
      percentComplete: Math.round((doneCount / rows.length) * 100),
      endMs: plan.tasks.length ? plan.projectEndMs : null,
      hasDrift: plan.drift.some((d) => d.pushesSuccessors),
      hasCycle: plan.hasCycle
    })
  }
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}
