import { useEffect, useState } from 'react'

// Hyperfocus Guardian — tracks the longest continuous focus run (active input with no
// 5+ min idle gap). When it crosses 90 minutes, a soft floating banner offers a stretch.
// The opposite of a focus timer: this protects you FROM staying too long.

const BREAK_THRESHOLD_MS = 5 * 60 * 1000 // 5 min idle = a real break, restart the run
const TRIGGER_AT_MS = 90 * 60 * 1000 // 90 min straight = banner appears
const SNOOZE_MS = 30 * 60 * 1000 // "Keep going" hides the banner for 30 min
const TICK_MS = 30 * 1000 // re-evaluate every 30s

interface GuardianState {
  runStartAt: number // when the current uninterrupted run started
  lastInputAt: number
  bannerVisible: boolean
  snoozedUntil: number | null
  currentRunMs: number
}

let state: GuardianState = {
  runStartAt: Date.now(),
  lastInputAt: Date.now(),
  bannerVisible: false,
  snoozedUntil: null,
  currentRunMs: 0
}
const subscribers = new Set<(s: GuardianState) => void>()

function notify(): void {
  subscribers.forEach((cb) => cb({ ...state }))
}

function onInput(): void {
  const now = Date.now()
  const idleMs = now - state.lastInputAt
  // If they were idle for the break threshold, this counts as having broken — reset the run.
  if (idleMs >= BREAK_THRESHOLD_MS) {
    state.runStartAt = now
    state.bannerVisible = false
    // Clear stale snooze so the next 90 min run can trigger again
    state.snoozedUntil = null
  }
  state.lastInputAt = now
  state.currentRunMs = now - state.runStartAt
}

function evaluate(): void {
  const now = Date.now()
  const idleMs = now - state.lastInputAt
  state.currentRunMs = now - state.runStartAt

  // If currently idle for the break threshold, treat the run as over for banner purposes
  if (idleMs >= BREAK_THRESHOLD_MS) {
    if (state.bannerVisible) {
      state.bannerVisible = false
    }
    notify()
    return
  }

  const snoozed = state.snoozedUntil !== null && now < state.snoozedUntil
  const shouldShow = state.currentRunMs >= TRIGGER_AT_MS && !snoozed

  if (shouldShow !== state.bannerVisible) {
    state.bannerVisible = shouldShow
    notify()
  } else {
    // Still notify periodically so consumers see currentRunMs updates
    notify()
  }
}

// Wire up listeners on module load (same input events as driftDetector — they don't conflict)
if (typeof window !== 'undefined') {
  for (const ev of ['mousedown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, onInput, { passive: true })
  }
  window.setInterval(evaluate, TICK_MS)
}

export function snoozeGuardian(): void {
  state.snoozedUntil = Date.now() + SNOOZE_MS
  state.bannerVisible = false
  notify()
}

export function endRunForBreak(): void {
  // User took the break — reset the run start, hide banner, no snooze (so a fresh 90 min counts again).
  state.runStartAt = Date.now()
  state.lastInputAt = Date.now()
  state.bannerVisible = false
  state.snoozedUntil = null
  state.currentRunMs = 0
  notify()
}

export function useGuardianState(): GuardianState {
  const [s, setS] = useState<GuardianState>({ ...state })
  useEffect(() => {
    const cb = (next: GuardianState): void => setS({ ...next })
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])
  return s
}

export function fmtRun(ms: number): string {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}
