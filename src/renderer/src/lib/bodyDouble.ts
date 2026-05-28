import { useEffect, useState } from 'react'
import { useChatStore } from '../stores/chat'
import { useNodeStore } from '../stores/nodes'

// Body Double Mode — quiet AI presence that drops a 1-line check-in every TICK_MIN.
// State persists across app restarts in localStorage; if it was on, it auto-resumes.

const KEY = 'fb.bodyDouble.enabled'
const TICK_MIN = 10
const TICK_MS = TICK_MIN * 60 * 1000
// First tick after enabling. Slightly delayed so the user gets settled first.
const FIRST_TICK_MS = 90_000

interface BodyDoubleState {
  enabled: boolean
  lastTickAt: number | null
  recentLines: string[] // last few presence lines so the model can vary tone
}

const subscribers = new Set<(s: BodyDoubleState) => void>()
let state: BodyDoubleState = {
  enabled: typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1',
  lastTickAt: null,
  recentLines: []
}
let tickHandle: number | null = null

function notify(): void {
  subscribers.forEach((cb) => cb(state))
}

async function fireTick(): Promise<void> {
  const taskId = useNodeStore.getState().activeTaskId
  try {
    const result = await window.api.bodyDouble.tick(taskId, state.recentLines)
    state.lastTickAt = Date.now()
    if (result.ok && !result.skip && result.line) {
      const line = result.line.trim()
      if (line) {
        useChatStore.getState().pushAssistantMessage(taskId, line)
        state.recentLines = [...state.recentLines.slice(-9), line]
      }
    }
    notify()
  } catch {
    // swallow — bad tick shouldn't break the loop
  }
}

function scheduleNext(delay: number): void {
  if (tickHandle !== null) window.clearTimeout(tickHandle)
  tickHandle = window.setTimeout(async () => {
    if (!state.enabled) return
    await fireTick()
    if (state.enabled) scheduleNext(TICK_MS)
  }, delay)
}

export function enableBodyDouble(): void {
  state = { ...state, enabled: true, lastTickAt: null }
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* ignore quota */
  }
  scheduleNext(FIRST_TICK_MS)
  notify()
}

export function disableBodyDouble(): void {
  state = { ...state, enabled: false }
  try {
    localStorage.setItem(KEY, '0')
  } catch {
    /* ignore quota */
  }
  if (tickHandle !== null) {
    window.clearTimeout(tickHandle)
    tickHandle = null
  }
  notify()
}

export function getBodyDoubleState(): BodyDoubleState {
  return state
}

// Auto-resume on module load if it was on when the app last ran
if (typeof window !== 'undefined' && state.enabled) {
  scheduleNext(FIRST_TICK_MS)
}

export function useBodyDouble(): {
  enabled: boolean
  toggle: () => void
  triggerNow: () => void
  minutesUntilNext: number | null
} {
  const [s, setS] = useState<BodyDoubleState>(state)
  useEffect(() => {
    const cb = (next: BodyDoubleState): void => setS({ ...next })
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])
  // Re-render every 30s so the "next tick" counter ticks down smoothly
  useEffect(() => {
    if (!s.enabled) return
    const id = window.setInterval(() => setS({ ...state }), 30_000)
    return () => window.clearInterval(id)
  }, [s.enabled])

  const minutesUntilNext = s.enabled
    ? Math.max(
        0,
        Math.ceil(
          ((s.lastTickAt ?? Date.now() - (TICK_MS - FIRST_TICK_MS)) + TICK_MS - Date.now()) /
            60_000
        )
      )
    : null

  return {
    enabled: s.enabled,
    toggle: () => (s.enabled ? disableBodyDouble() : enableBodyDouble()),
    triggerNow: () => void fireTick(),
    minutesUntilNext
  }
}
