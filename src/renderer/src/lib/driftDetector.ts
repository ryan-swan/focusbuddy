import { useEffect, useState } from 'react'

// Drift detector — fires when the user comes BACK after being away.
// Definition of "away": document was hidden for >= MIN_AWAY_MS, OR window was
// blurred for >= MIN_AWAY_MS, OR no input events for >= IDLE_THRESHOLD_MS.
//
// The component using this hook sees a `driftedFor` value (ms) when the user
// is freshly returning. Once they engage (click, key, scroll), the drift clears.

const MIN_AWAY_MS = 3 * 60 * 1000 // 3 minutes
const IDLE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes of no input while visible
const IDLE_CHECK_MS = 30 * 1000

interface DriftState {
  driftedForMs: number | null // null = currently engaged; number = drift just detected
  detectedAt: number | null
}

let state: DriftState = { driftedForMs: null, detectedAt: null }
let lastInputAt = Date.now()
let documentHiddenAt: number | null = null
let windowBlurredAt: number | null = null
const subscribers = new Set<(s: DriftState) => void>()

function notify(): void {
  subscribers.forEach((cb) => cb(state))
}

function recordReturn(awayForMs: number): void {
  if (awayForMs < MIN_AWAY_MS) return
  if (state.driftedForMs !== null) return // already showing
  state = { driftedForMs: awayForMs, detectedAt: Date.now() }
  notify()
}

export function clearDrift(): void {
  if (state.driftedForMs === null) return
  state = { driftedForMs: null, detectedAt: null }
  notify()
}

// Mark the user as freshly active (any input). Clears drift if showing AND resets idle timer.
function markActive(): void {
  lastInputAt = Date.now()
  if (state.driftedForMs !== null) clearDrift()
}

// Initialize listeners on module load
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      documentHiddenAt = Date.now()
    } else if (documentHiddenAt !== null) {
      const awayFor = Date.now() - documentHiddenAt
      documentHiddenAt = null
      recordReturn(awayFor)
    }
  })

  window.addEventListener('blur', () => {
    if (document.hidden) return // visibilitychange will handle it
    windowBlurredAt = Date.now()
  })
  window.addEventListener('focus', () => {
    if (windowBlurredAt !== null) {
      const awayFor = Date.now() - windowBlurredAt
      windowBlurredAt = null
      recordReturn(awayFor)
    }
  })

  // Any input clears the drift banner and resets idle
  for (const ev of ['mousedown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, markActive, { passive: true })
  }

  // Passive idle check — if user stayed in-app but did nothing for IDLE_THRESHOLD,
  // surface the drift banner too (e.g. they were reading something elsewhere on screen).
  window.setInterval(() => {
    if (state.driftedForMs !== null) return // already showing
    if (document.hidden) return // hidden case handled above
    const idleMs = Date.now() - lastInputAt
    if (idleMs >= IDLE_THRESHOLD_MS) {
      recordReturn(idleMs)
      lastInputAt = Date.now() // reset so we don't loop-fire
    }
  }, IDLE_CHECK_MS)
}

export function useDriftState(): DriftState {
  const [s, setS] = useState<DriftState>(state)
  useEffect(() => {
    const cb = (next: DriftState): void => setS({ ...next })
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])
  return s
}

export function fmtAway(ms: number): string {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}
