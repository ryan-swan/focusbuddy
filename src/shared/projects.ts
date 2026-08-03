// Shared PlexiProjects data shapes, used by the main-process plan store, the
// preload bridge and the renderer Gantt. The scheduling math lives in gantt.ts;
// these are the data-transfer types that carry a computed plan to the UI.

export type DepType = 'FS' | 'SS' | 'FF' | 'SF'

export interface PlanTask {
  id: string
  title: string
  status: string
  isMilestone: boolean
  // User-set planning fields (ms epoch), or null when not set.
  planStart: number | null
  planDue: number | null
  estimateMinutes: number | null
  // Person responsible (free text: a name or email), or null when unassigned.
  assignee: string | null
  // Manual progress 0-100. A completed task always reads 100.
  progressPct: number
  // Actuals from the node lifecycle.
  startedAt: number | null
  completedAt: number | null
  // Schedule-derived (filled by the engine), always present.
  scheduledStartMs: number
  scheduledEndMs: number
  durationDays: number
  slackDays: number
  critical: boolean
  // Predecessor task ids, for drawing dependency arrows.
  deps: string[]
  // Captured baseline window (planned-vs-actual variance), null until a baseline
  // has been set for the project.
  baselineStartMs: number | null
  baselineEndMs: number | null
  // Constraints. mustStartMs pins the start (MSO); deadlineMs is a finish-no-
  // later-than the schedule is checked against (deadlineMiss is set when blown).
  mustStartMs: number | null
  deadlineMs: number | null
  deadlineMiss: boolean
  // Optional cost for budget rollups (currency-agnostic number).
  cost: number | null
}

export interface PlanDep {
  id: string
  predId: string
  succId: string
  // Dependency type + working-day lag (negative = lead). Default FS, lag 0.
  type: DepType
  lag: number
}

export interface PlanDrift {
  id: string
  slipDays: number
  pushesSuccessors: boolean
}

export interface ProjectPlan {
  projectId: string
  title: string
  // The schedule anchor (day 0) as a ms epoch.
  anchorMs: number
  projectEndMs: number
  tasks: PlanTask[]
  deps: PlanDep[]
  criticalPath: string[]
  hasCycle: boolean
  drift: PlanDrift[]
  // True when a baseline has been captured, so the UI can show variance.
  hasBaseline: boolean
  // Sum of task costs (0 when none set).
  totalCost: number
}

export interface ProjectSummary {
  id: string
  title: string
  taskCount: number
  doneCount: number
  percentComplete: number
  endMs: number | null
  hasDrift: boolean
  hasCycle: boolean
}

export interface PlanTaskPatch {
  planStart?: number | null
  planDue?: number | null
  isMilestone?: boolean
  estimateMinutes?: number | null
  assignee?: string | null
  progressPct?: number
  mustStartMs?: number | null
  deadlineMs?: number | null
  cost?: number | null
}

export type AddDepResult =
  | { ok: true; dep: PlanDep }
  | { ok: false; reason: 'cycle' | 'self' | 'duplicate' | 'missing' }
