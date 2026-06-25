// Pure project-scheduling engine for PlexiProjects. No database and no dates-as-
// strings here, just the critical-path method (CPM) over a set of tasks with
// durations and finish-to-start dependencies, plus drift detection and an
// auto-reschedule that shifts successors when a predecessor actually slips. All
// of it is deterministic and unit-testable in isolation; the main-process store
// wraps it with the node table, and the renderer draws the result as a Gantt.
//
// The model: each task has a duration in whole days and a list of predecessor
// task ids. A milestone is a zero-duration task, drawn as a marker. The forward
// pass gives the earliest each task can start and finish; the backward pass the
// latest it can without delaying the project; the difference is slack, and a
// task with zero slack is on the critical path. Nothing is invented: a task with
// no dates and no dependencies simply starts at the project anchor.

export const DAY_MS = 24 * 60 * 60 * 1000

export interface GanttInput {
  id: string
  // Whole-day duration. A milestone is 0. Negative is clamped to 0.
  durationDays: number
  // Finish-to-start predecessor task ids. Unknown ids are ignored so a partially
  // wired plan still schedules rather than throwing.
  deps: string[]
  isMilestone?: boolean
  // Optional "start no earlier than" day offset from the anchor, from a task's
  // explicit planned start. The earliest start is the later of this and the
  // latest predecessor finish, so a user-set date is honoured but a dependency
  // can still push a task out.
  minStartDay?: number
}

export interface ScheduledTask {
  id: string
  isMilestone: boolean
  durationDays: number
  // Day offsets from the project anchor (0 = the anchor day).
  earliestStart: number
  earliestFinish: number
  latestStart: number
  latestFinish: number
  slackDays: number
  critical: boolean
  // Absolute timestamps, anchor + offset days.
  startMs: number
  endMs: number
}

export interface ScheduleResult {
  tasks: ScheduledTask[]
  // Project finish as a day offset and an absolute timestamp.
  projectDurationDays: number
  projectEndMs: number
  // The ordered ids on the critical path (longest zero-slack chain).
  criticalPath: string[]
  // True when the dependency graph had a cycle; when so the cyclic edges were
  // dropped to still produce a schedule, and this flags that the plan is broken.
  hasCycle: boolean
}

function clampDuration(d: number): number {
  return Number.isFinite(d) && d > 0 ? Math.floor(d) : 0
}

// Topologically order task ids so every predecessor comes before its successors.
// Returns the order plus whether a cycle was found (cyclic nodes are appended in
// input order so scheduling can still proceed on the acyclic part).
export function topoSort(inputs: GanttInput[]): { order: string[]; hasCycle: boolean } {
  const ids = new Set(inputs.map((t) => t.id))
  const preds = new Map<string, string[]>()
  for (const t of inputs) {
    preds.set(
      t.id,
      t.deps.filter((d) => ids.has(d) && d !== t.id)
    )
  }
  // Kahn's algorithm on the predecessor graph.
  const indegree = new Map<string, number>()
  for (const id of ids) indegree.set(id, 0)
  for (const t of inputs) {
    for (const _p of preds.get(t.id) ?? []) {
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1)
    }
  }
  const queue: string[] = []
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id)
  // Stable: process in input order among ready nodes.
  const inputIndex = new Map(inputs.map((t, i) => [t.id, i]))
  queue.sort((a, b) => (inputIndex.get(a) ?? 0) - (inputIndex.get(b) ?? 0))
  const succs = new Map<string, string[]>()
  for (const id of ids) succs.set(id, [])
  for (const t of inputs) for (const p of preds.get(t.id) ?? []) succs.get(p)!.push(t.id)

  const order: string[] = []
  while (queue.length) {
    const n = queue.shift()!
    order.push(n)
    for (const s of succs.get(n) ?? []) {
      indegree.set(s, (indegree.get(s) ?? 0) - 1)
      if (indegree.get(s) === 0) {
        // Insert keeping input order for determinism.
        const idx = inputIndex.get(s) ?? 0
        let i = queue.length
        while (i > 0 && (inputIndex.get(queue[i - 1]) ?? 0) > idx) i--
        queue.splice(i, 0, s)
      }
    }
  }
  if (order.length < inputs.length) {
    // Cycle: append the unprocessed nodes in input order so they still schedule.
    const seen = new Set(order)
    for (const t of inputs) if (!seen.has(t.id)) order.push(t.id)
    return { order, hasCycle: true }
  }
  return { order, hasCycle: false }
}

// Run the critical-path method and return the full schedule. projectStartMs is
// the anchor day (offset 0). Deterministic and side-effect free.
export function computeSchedule(inputs: GanttInput[], projectStartMs: number): ScheduleResult {
  const byId = new Map(inputs.map((t) => [t.id, t]))
  const dur = (id: string): number => {
    const t = byId.get(id)
    if (!t) return 0
    return t.isMilestone ? 0 : clampDuration(t.durationDays)
  }
  const validPreds = (id: string): string[] => {
    const t = byId.get(id)
    if (!t) return []
    return t.deps.filter((d) => byId.has(d) && d !== id)
  }

  const { order, hasCycle } = topoSort(inputs)

  // Forward pass: earliest start/finish.
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  for (const id of order) {
    const preds = validPreds(id)
    const floor = byId.get(id)?.minStartDay ?? 0
    const depStart = preds.length ? Math.max(...preds.map((p) => ef.get(p) ?? 0)) : 0
    const start = Math.max(depStart, floor)
    es.set(id, start)
    ef.set(id, start + dur(id))
  }

  const projectDurationDays = order.length ? Math.max(...order.map((id) => ef.get(id) ?? 0)) : 0

  // Successor map for the backward pass.
  const succs = new Map<string, string[]>()
  for (const t of inputs) succs.set(t.id, [])
  for (const t of inputs) for (const p of validPreds(t.id)) succs.get(p)!.push(t.id)

  // Backward pass: latest start/finish, processed in reverse topo order.
  const lf = new Map<string, number>()
  const ls = new Map<string, number>()
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    const ss = succs.get(id) ?? []
    const finish = ss.length ? Math.min(...ss.map((s) => ls.get(s) ?? projectDurationDays)) : projectDurationDays
    lf.set(id, finish)
    ls.set(id, finish - dur(id))
  }

  const tasks: ScheduledTask[] = inputs.map((t) => {
    const earliestStart = es.get(t.id) ?? 0
    const earliestFinish = ef.get(t.id) ?? 0
    const latestStart = ls.get(t.id) ?? earliestStart
    const latestFinish = lf.get(t.id) ?? earliestFinish
    const slackDays = latestStart - earliestStart
    return {
      id: t.id,
      isMilestone: !!t.isMilestone,
      durationDays: dur(t.id),
      earliestStart,
      earliestFinish,
      latestStart,
      latestFinish,
      slackDays,
      critical: slackDays <= 0,
      startMs: projectStartMs + earliestStart * DAY_MS,
      endMs: projectStartMs + earliestFinish * DAY_MS
    }
  })

  // The critical path: the longest chain of critical tasks following dependencies.
  const criticalPath = longestCriticalChain(inputs, tasks, validPreds)

  return {
    tasks,
    projectDurationDays,
    projectEndMs: projectStartMs + projectDurationDays * DAY_MS,
    criticalPath,
    hasCycle
  }
}

// Walk the critical tasks along dependency edges to produce one ordered chain
// from a critical start to a critical end. Used to draw the highlighted path.
function longestCriticalChain(
  inputs: GanttInput[],
  scheduled: ScheduledTask[],
  validPreds: (id: string) => string[]
): string[] {
  const crit = new Set(scheduled.filter((t) => t.critical).map((t) => t.id))
  if (crit.size === 0) return []
  const ef = new Map(scheduled.map((t) => [t.id, t.earliestFinish]))
  // memoized longest chain ending at id, among critical nodes. `visiting` breaks
  // recursion if the dependency graph has a cycle (the schedule still returns).
  const chain = new Map<string, string[]>()
  const visiting = new Set<string>()
  const build = (id: string): string[] => {
    if (chain.has(id)) return chain.get(id)!
    if (visiting.has(id)) return [id] // cycle guard
    visiting.add(id)
    const cps = validPreds(id).filter((p) => crit.has(p))
    let best: string[] = []
    for (const p of cps) {
      const c = build(p)
      if (c.length > best.length) best = c
    }
    visiting.delete(id)
    const result = [...best, id]
    chain.set(id, result)
    return result
  }
  let longest: string[] = []
  for (const t of inputs) {
    if (!crit.has(t.id)) continue
    const c = build(t.id)
    // Prefer the chain that reaches the latest finish, then the longer one.
    if (c.length > longest.length || (c.length === longest.length && (ef.get(t.id) ?? 0) > (ef.get(longest[longest.length - 1]) ?? 0))) {
      longest = c
    }
  }
  return longest
}

export interface DriftItem {
  id: string
  // Days the task's actual finish slipped past its planned earliest finish.
  slipDays: number
  // True when this slip pushes at least one successor (i.e. the task had no slack
  // to absorb it or the slip exceeded the slack).
  pushesSuccessors: boolean
}

// Compare actual finish day-offsets against the computed schedule and report
// which tasks slipped and whether the slip eats their slack (and so cascades).
// actualFinishByid maps task id to an actual finish day-offset from the anchor.
export function detectDrift(schedule: ScheduleResult, actualFinishById: Map<string, number>): DriftItem[] {
  const out: DriftItem[] = []
  for (const t of schedule.tasks) {
    const actual = actualFinishById.get(t.id)
    if (actual === undefined) continue
    const slipDays = actual - t.earliestFinish
    if (slipDays > 0) {
      out.push({ id: t.id, slipDays, pushesSuccessors: slipDays > t.slackDays })
    }
  }
  return out
}

// Auto-reschedule: given actual finishes, push each task's effective duration/
// dependency timing forward so the recomputed schedule respects what already
// happened. Returns a fresh ScheduleResult whose earliest starts never precede a
// predecessor's actual finish. Tasks with no actuals keep their planned timing.
export function rescheduleOnDrift(
  inputs: GanttInput[],
  projectStartMs: number,
  actualFinishById: Map<string, number>
): ScheduleResult {
  // Encode actuals as a minimum earliest-finish floor by inflating duration when
  // a task finished later than its dependency-driven earliest finish. We do this
  // by adding pseudo lead via an augmented forward pass rather than mutating the
  // inputs, so the engine stays pure.
  const base = computeSchedule(inputs, projectStartMs)
  const byId = new Map(inputs.map((t) => [t.id, t]))
  const efFloor = new Map<string, number>()
  for (const t of base.tasks) {
    const actual = actualFinishById.get(t.id)
    efFloor.set(t.id, actual !== undefined ? Math.max(actual, t.earliestFinish) : t.earliestFinish)
  }
  // Recompute a forward pass honoring the actual-finish floor, then derive a new
  // schedule by expressing the floor as an adjusted duration per task.
  const { order } = topoSort(inputs)
  const adjEf = new Map<string, number>()
  const adjEs = new Map<string, number>()
  const adjDurationDays = new Map<string, number>()
  for (const id of order) {
    const t = byId.get(id)
    const preds = (t?.deps ?? []).filter((d) => byId.has(d) && d !== id)
    const minStart = t?.minStartDay ?? 0
    const start = Math.max(preds.length ? Math.max(...preds.map((p) => adjEf.get(p) ?? 0)) : 0, minStart)
    const naturalDur = t?.isMilestone ? 0 : clampDuration(t?.durationDays ?? 0)
    const floor = efFloor.get(id) ?? start + naturalDur
    const finish = Math.max(start + naturalDur, floor)
    adjEs.set(id, start)
    adjEf.set(id, finish)
    adjDurationDays.set(id, finish - start)
  }
  // Build adjusted inputs whose durations encode the slip, then run the normal
  // CPM so slack and critical path reflect the rescheduled reality.
  const adjusted: GanttInput[] = inputs.map((t) => ({
    id: t.id,
    durationDays: adjDurationDays.get(t.id) ?? clampDuration(t.durationDays),
    deps: t.deps,
    isMilestone: t.isMilestone && (adjDurationDays.get(t.id) ?? 0) === 0
  }))
  return computeSchedule(adjusted, projectStartMs)
}
