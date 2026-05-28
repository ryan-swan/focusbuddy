// Time-of-Day Anchoring — ambient time perception for ADHD/exec-dysfunction brains.
// The clock is hard to watch; the day must be FELT.
//
// Exports:
//   - module-level interval that pushes --tod-* CSS variables to :root every 60s
//   - useTimeOfDay() hook for components that want to re-render on minute ticks
//   - widget age helpers used by the AgeHalo component

import { useEffect, useState } from 'react'

export interface TimeOfDay {
  phase: number       // 0..1 across the 24-hour day
  hue: number         // CSS hue degrees (dawn~210 cyan → noon~50 amber → dusk~20 rose → night~250 indigo)
  warmth: number      // 0=cool, 1=warm
  sunX: number        // 0..100, horizontal position of the "sun glow" across the canvas
  sunOpacity: number  // 0..0.5, sun intensity (peak at midday)
  label: string       // human label of the current phase
}

function compute(now: Date = new Date()): TimeOfDay {
  const hour = now.getHours() + now.getMinutes() / 60
  const phase = hour / 24

  let hue: number
  let warmth: number
  let sunX = 50
  let sunOpacity = 0
  let label: string

  if (hour >= 6 && hour <= 20) {
    const dayT = (hour - 6) / 14 // 0..1 across daylight
    sunX = dayT * 100
    // parabolic opacity — peak at noon
    sunOpacity = 0.45 * (1 - Math.pow(2 * dayT - 1, 2))

    if (hour < 9) {
      hue = 210 - ((hour - 6) / 3) * 110 // 210 → 100 (dawn → morning)
      warmth = 0.25 + ((hour - 6) / 3) * 0.4
      label = hour < 7.5 ? 'Dawn' : 'Morning'
    } else if (hour < 12) {
      hue = 100 - ((hour - 9) / 3) * 50 // 100 → 50
      warmth = 0.65 + ((hour - 9) / 3) * 0.25
      label = 'Late morning'
    } else if (hour < 15) {
      hue = 50 - ((hour - 12) / 3) * 10 // 50 → 40
      warmth = 0.9
      label = 'Midday'
    } else if (hour < 18) {
      hue = 40 - ((hour - 15) / 3) * 15 // 40 → 25
      warmth = 0.85 - ((hour - 15) / 3) * 0.1
      label = 'Afternoon'
    } else {
      hue = 25 - ((hour - 18) / 2) * 10 // 25 → 15 (dusk amber/rose)
      warmth = 0.75 - ((hour - 18) / 2) * 0.35
      label = 'Dusk'
    }
  } else {
    // nighttime — deep indigo, no sun
    hue = 250
    warmth = 0.05
    label = hour > 20 && hour < 23 ? 'Evening' : hour < 5 ? 'Late night' : 'Night'
  }

  return { phase, hue, warmth, sunX, sunOpacity, label }
}

let cached: TimeOfDay = compute()
const subscribers = new Set<(t: TimeOfDay) => void>()

function applyToDOM(t: TimeOfDay): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--tod-hue', String(Math.round(t.hue)))
  root.style.setProperty('--tod-warmth', t.warmth.toFixed(3))
  root.style.setProperty('--tod-phase', t.phase.toFixed(4))
  root.style.setProperty('--tod-sun-x', `${t.sunX.toFixed(1)}%`)
  root.style.setProperty('--tod-sun-opacity', t.sunOpacity.toFixed(3))
}

// Apply immediately on module load so SSR/initial paint is correct
applyToDOM(cached)

if (typeof window !== 'undefined') {
  window.setInterval(() => {
    cached = compute()
    applyToDOM(cached)
    subscribers.forEach((cb) => cb(cached))
  }, 60_000)
}

export function getTimeOfDay(): TimeOfDay {
  return cached
}

export function useTimeOfDay(): TimeOfDay {
  const [t, setT] = useState<TimeOfDay>(cached)
  useEffect(() => {
    const cb = (next: TimeOfDay): void => setT(next)
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])
  return t
}

// ── Widget age helpers ─────────────────────────────────────────────────────────

export function widgetAgeHours(createdAt: number): number {
  return (Date.now() - createdAt) / 3_600_000
}

// Halo opacity ramps from 0 (fresh) to 1 (12h+ old).
// 30-minute grace period so newly-spawned widgets aren't haloed.
export function ageHaloOpacity(createdAt: number): number {
  const h = widgetAgeHours(createdAt)
  if (h < 0.5) return 0
  if (h > 12) return 1
  return (h - 0.5) / 11.5
}
