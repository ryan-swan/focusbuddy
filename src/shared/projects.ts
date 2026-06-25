// Shared PlexiProjects data shapes, used by the main-process plan store, the
// preload bridge and the renderer Gantt. The scheduling math lives in gantt.ts;
// these are the data-transfer types that carry a computed plan to the UI.

export interface PlanTask {
  id: string
  title: string
  status: string
  isMilestone: boolean
  // User-set planning fields (ms epoch), or null when not set.
  planStart: number | null
  planDue: number | null
  estimateMinutes: number | null
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
}

export interface PlanDep {
  id: string
  predId: string
  succId: string
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
}

export type AddDepResult =
  | { ok: true; dep: PlanDep }
  | { ok: false; reason: 'cycle' | 'self' | 'duplicate' | 'missing' }
