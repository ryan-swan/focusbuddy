import { create } from 'zustand'
import type { FocusSession, FocusSessionOutcome } from '@shared/types'
import { recordTrail } from '../lib/trail'
import { hapticMedium, hapticSuccess } from '../lib/haptics'
import { useViewStore } from './view'

// Lightweight store for the *currently running* 5-min-Promise / focus session.
// History is read from the DB on demand (Garden, Trail later); this store holds
// only the active session + a per-tick countdown so the overlay can re-render.
//
// Engaged-time tracking (the important bit):
//   The timer counts only seconds during which the user is actually engaged
//   with the task — meaning PlexiDesk has OS focus AND the current view is
//   the same task the session was started on. If the user alt-tabs to Slack
//   or switches to a different task inside PlexiDesk, the timer pauses.
//   When they return, it resumes. This matches the ADHD-friendly intent of
//   the 5-Minute Promise — five minutes of *actual* focused work, not five
//   minutes of wall-clock that quietly expires while you're distracted.
//
//   `activeSeconds` is the source of truth — it's what gets written to the
//   DB as `actualSeconds` and what the remaining countdown subtracts from
//   `plannedSeconds`. `pausedSeconds` is recorded for the UI ("paused for
//   2 min — welcome back") but is not persisted.

interface FocusSessionStore {
  active: FocusSession | null
  // Seconds remaining — updated by a 1s interval while a session is running
  remainingSec: number
  // Cumulative engaged seconds for the current session — only ticks up while
  // the user is genuinely engaged (window focused + on the session's task).
  activeSeconds: number
  // Cumulative seconds the user was AWAY/DISTRACTED during this session.
  // Surfaces in the overlay as a soft "paused" indicator + can feed a future
  // "session report" so the user sees their real engagement vs total time.
  pausedSeconds: number
  // Whether the timer is currently counting (engaged) vs paused (away).
  isEngaged: boolean
  // Was this session "renewed" by Keep going? Tracked so the success modal can adapt.
  renewedCount: number
  start: (taskId: string | null, plannedSeconds: number, kind?: string) => Promise<void>
  // Renew the current session — completes the old one as "continued" and starts a fresh one.
  renew: (plannedSeconds: number) => Promise<void>
  // Mark the active session complete with the given outcome. Returns the completed record.
  finish: (outcome: FocusSessionOutcome) => Promise<FocusSession | null>
  // Discard without saving (user closed the app etc.) — best-effort completion as abandoned.
  abandon: () => Promise<void>
  // Internal tick — called every second while there's an active session
  _tick: () => void
}

let tickHandle: number | null = null

function startTicker(get: () => FocusSessionStore): void {
  if (tickHandle !== null) return
  tickHandle = window.setInterval(() => {
    get()._tick()
  }, 1000)
}

function stopTicker(): void {
  if (tickHandle !== null) {
    window.clearInterval(tickHandle)
    tickHandle = null
  }
}

/**
 * Decide whether the user is currently "engaged" with the session's task.
 * Three independent gates, all required:
 *   1. The browser window has OS focus (not behind another app).
 *   2. The document is visible (not minimized, not in a hidden tab).
 *   3. The current view in PlexiDesk is the same task the session is bound
 *      to. Anything else — All Tasks, a Connected App, a different task —
 *      counts as "not engaged with this".
 *
 * If the session has no taskId (e.g. a global timer), only gates 1+2 apply.
 */
function isEngagedWith(taskId: string | null): boolean {
  if (typeof document === 'undefined') return true
  if (document.hidden) return false
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false
  if (taskId === null) return true
  const view = useViewStore.getState().view
  return view.kind === 'task' && view.taskId === taskId
}

export const useFocusSessionStore = create<FocusSessionStore>((set, get) => ({
  active: null,
  remainingSec: 0,
  activeSeconds: 0,
  pausedSeconds: 0,
  isEngaged: true,
  renewedCount: 0,
  start: async (taskId, plannedSeconds, kind = '5min') => {
    // If a session is already running, complete it as "continued" first.
    const cur = get().active
    if (cur) {
      await window.api.focus.complete(cur.id, {
        actualSeconds: get().activeSeconds,
        outcome: 'continued'
      })
    }
    const session = await window.api.focus.start({ taskId, kind, plannedSeconds })
    set({
      active: session,
      remainingSec: plannedSeconds,
      activeSeconds: 0,
      pausedSeconds: 0,
      isEngaged: isEngagedWith(taskId),
      renewedCount: 0
    })
    recordTrail('session_started', taskId, { kind, plannedSeconds, sessionId: session.id })
    hapticMedium()
    startTicker(get)
  },
  renew: async (plannedSeconds) => {
    const cur = get().active
    if (!cur) return
    await window.api.focus.complete(cur.id, {
      actualSeconds: get().activeSeconds,
      outcome: 'continued'
    })
    const session = await window.api.focus.start({
      taskId: cur.taskId,
      kind: cur.kind,
      plannedSeconds
    })
    set({
      active: session,
      remainingSec: plannedSeconds,
      activeSeconds: 0,
      pausedSeconds: 0,
      isEngaged: isEngagedWith(cur.taskId),
      renewedCount: get().renewedCount + 1
    })
    startTicker(get)
  },
  finish: async (outcome) => {
    const cur = get().active
    if (!cur) return null
    const actualSeconds = get().activeSeconds
    const completed = await window.api.focus.complete(cur.id, {
      actualSeconds,
      outcome
    })
    recordTrail('session_ended', cur.taskId, {
      sessionId: cur.id,
      outcome,
      actualSeconds,
      plannedSeconds: cur.plannedSeconds
    })
    if (outcome === 'done') hapticSuccess()
    stopTicker()
    set({
      active: null,
      remainingSec: 0,
      activeSeconds: 0,
      pausedSeconds: 0,
      isEngaged: true,
      renewedCount: 0
    })
    return completed
  },
  abandon: async () => {
    const cur = get().active
    if (!cur) return
    const actualSeconds = get().activeSeconds
    await window.api.focus.complete(cur.id, {
      actualSeconds,
      outcome: 'abandoned'
    })
    recordTrail('session_ended', cur.taskId, {
      sessionId: cur.id,
      outcome: 'abandoned',
      actualSeconds,
      plannedSeconds: cur.plannedSeconds
    })
    stopTicker()
    set({
      active: null,
      remainingSec: 0,
      activeSeconds: 0,
      pausedSeconds: 0,
      isEngaged: true,
      renewedCount: 0
    })
  },
  _tick: () => {
    const { active, activeSeconds, pausedSeconds } = get()
    if (!active) {
      stopTicker()
      return
    }
    const engaged = isEngagedWith(active.taskId)
    if (engaged) {
      const nextActive = activeSeconds + 1
      const remaining = Math.max(0, active.plannedSeconds - nextActive)
      set({
        activeSeconds: nextActive,
        remainingSec: remaining,
        isEngaged: true
      })
    } else {
      // Paused — keep remaining where it is, bump the paused counter, set
      // the UI flag. The overlay reads `isEngaged` to dim the timer pill +
      // show the "Paused — N min away" hint.
      set({
        pausedSeconds: pausedSeconds + 1,
        isEngaged: false
      })
    }
  }
}))

// Thin handle for debugging + e2e (same convention as __fbView/__fbNodes): the
// real store, not a mock. Changes nothing about user behaviour.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbFocusSession?: typeof useFocusSessionStore }).__fbFocusSession =
    useFocusSessionStore
}
