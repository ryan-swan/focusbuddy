import { create } from 'zustand'
import type { EnergyLevel, EnergyLogEntry, FbNode } from '@shared/types'

interface EnergyStore {
  current: EnergyLogEntry | null
  history: EnergyLogEntry[]
  loaded: boolean
  refresh: () => Promise<void>
  log: (level: EnergyLevel) => Promise<void>
}

export const useEnergyStore = create<EnergyStore>((set) => ({
  current: null,
  history: [],
  loaded: false,
  refresh: async () => {
    const [current, history] = await Promise.all([
      window.api.energy.current(),
      window.api.energy.recent(72)
    ])
    set({ current, history, loaded: true })
  },
  log: async (level) => {
    const entry = await window.api.energy.log(level)
    set((s) => ({
      current: entry,
      history: [entry, ...s.history.slice(0, 100)]
    }))
  }
}))

// Task-side helper — what energy level does this task "fit"?
//   - High lift: importance ≥4 OR estimate ≥60 min
//   - Med lift: estimate 15–60 min OR importance ≥3
//   - Low lift: short estimate (<15 min) or low importance
//
// Used by the All Tasks "Energy fit" sort and the (future) Pre-Task Bridge update.
export function energyFitForTask(task: FbNode): EnergyLevel {
  const estimate = (task.estimateMinutes ?? 0) + (task.extensionsMinutes ?? 0)
  if (task.importance >= 4 || estimate >= 60) return 'high'
  if (estimate >= 15 || task.importance >= 3) return 'medium'
  return 'low'
}

// How well do two energy levels match? Used for sorting.
// 2 = perfect match, 1 = adjacent, 0 = mismatch (high vs low)
export function energyAffinity(current: EnergyLevel, taskFit: EnergyLevel): number {
  if (current === taskFit) return 2
  if (
    (current === 'medium' && (taskFit === 'low' || taskFit === 'high')) ||
    (taskFit === 'medium' && (current === 'low' || current === 'high'))
  ) {
    return 1
  }
  return 0
}

export const ENERGY_META: Record<
  EnergyLevel,
  { label: string; emoji: string; color: string; description: string }
> = {
  low: {
    label: 'Low',
    emoji: '🪫',
    color: 'rgb(120 113 108)', // stone-500
    description: 'Tired, foggy, scattered. Short admin tasks fit best.'
  },
  medium: {
    label: 'Steady',
    emoji: '🔋',
    color: 'rgb(180 83 9)', // amber-700
    description: 'Functional but not peak. Most tasks fit.'
  },
  high: {
    label: 'High',
    emoji: '⚡', // lightning bolt
    color: 'rgb(4 120 87)', // emerald-700
    description: 'Sharp, focused, energetic. Heavy lifts fit best.'
  }
}
