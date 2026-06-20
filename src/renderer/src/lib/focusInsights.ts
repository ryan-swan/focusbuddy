import type { FocusSession } from '@shared/types'

// Pure analytics over real focus sessions — no fabricated numbers. Every figure
// is derived from sessions the user actually ran; callers show honest empty
// states when there's nothing yet. Mirrors the lib/velocityStats pattern
// (compute client-side from data the store already fetches).

export interface FocusSummary {
  sessions: number // sessions started in the window
  completed: number // outcome 'done' or 'continued'
  abandoned: number
  focusedMinutes: number // sum of engaged seconds across completed sessions
  medianMinutes: number // median engaged minutes per completed session
  completionRate: number // completed / sessions, 0..1
}

function isCompleted(s: FocusSession): boolean {
  return s.completedAt != null
}

export function summarize(sessions: FocusSession[], sinceMs: number): FocusSummary {
  const inWin = sessions.filter((s) => s.startedAt >= sinceMs)
  const done = inWin.filter((s) => s.outcome === 'done' || s.outcome === 'continued')
  const abandoned = inWin.filter((s) => s.outcome === 'abandoned')
  const completed = inWin.filter(isCompleted)
  const focusedSec = completed.reduce((a, s) => a + (s.actualSeconds ?? 0), 0)
  const actualsMin = completed
    .map((s) => (s.actualSeconds ?? 0) / 60)
    .filter((m) => m > 0)
    .sort((a, b) => a - b)
  const median = actualsMin.length ? actualsMin[Math.floor(actualsMin.length / 2)] : 0
  return {
    sessions: inWin.length,
    completed: done.length,
    abandoned: abandoned.length,
    focusedMinutes: Math.round(focusedSec / 60),
    medianMinutes: Math.round(median),
    completionRate: inWin.length ? done.length / inWin.length : 0
  }
}

// Engaged minutes per hour-of-day (local), from completed sessions in the
// window. The shape of "when you actually focus".
export function focusByHour(sessions: FocusSession[], sinceMs: number): number[] {
  const buckets = new Array<number>(24).fill(0)
  for (const s of sessions) {
    if (s.startedAt < sinceMs || !isCompleted(s)) continue
    const hour = new Date(s.startedAt).getHours()
    buckets[hour] += (s.actualSeconds ?? 0) / 60
  }
  return buckets.map((m) => Math.round(m))
}

// The hours with the most focused time (descending), ignoring empty hours.
export function bestFocusHours(byHour: number[], top = 3): number[] {
  return byHour
    .map((m, h) => ({ h, m }))
    .filter((x) => x.m > 0)
    .sort((a, b) => b.m - a.m)
    .slice(0, top)
    .map((x) => x.h)
}

export interface TaskFocus {
  id: string
  title: string
  minutes: number
}

// Tasks ranked by focused time in the window. `titleFor` resolves a task id to
// its current title (unknown ids are dropped — a deleted task isn't shown).
export function topTasksByFocus(
  sessions: FocusSession[],
  sinceMs: number,
  titleFor: (id: string) => string | null,
  limit = 5
): TaskFocus[] {
  const byTask = new Map<string, number>()
  for (const s of sessions) {
    if (s.startedAt < sinceMs || !isCompleted(s) || !s.taskId) continue
    byTask.set(s.taskId, (byTask.get(s.taskId) ?? 0) + (s.actualSeconds ?? 0) / 60)
  }
  const out: TaskFocus[] = []
  for (const [id, mins] of byTask) {
    const title = titleFor(id)
    if (!title) continue
    out.push({ id, title, minutes: Math.round(mins) })
  }
  return out.sort((a, b) => b.minutes - a.minutes).slice(0, limit)
}

// Human label for an hour-of-day (0..23): "7am", "2pm", "12pm".
export function hourLabel(h: number): string {
  const period = h < 12 ? 'am' : 'pm'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}${period}`
}
