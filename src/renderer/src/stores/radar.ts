import { create } from 'zustand'
import type { RadarSuggestion, RadarKind } from '@shared/types'
import { detectTaskRadar } from '../lib/radar'
import { useNodeStore } from './nodes'

// Holds the current radar suggestions + the per-kind accept counters that are the
// foundation for learned autonomy (a category the user keeps accepting can later
// be escalated toward hands-free). Dismissals are session-scoped so a re-run
// doesn't immediately resurface something the user just cleared.

const ACCEPTS_KEY = 'fb.radar.accepts'

function loadAccepts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ACCEPTS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

interface RadarState {
  suggestions: RadarSuggestion[]
  dismissed: Set<string>
  accepts: Record<string, number>
  // Re-run the detectors over the current tasks and update the visible list.
  refresh: () => void
  dismiss: (id: string) => void
  // Record that the user acted on a suggestion of this kind (learned-autonomy
  // signal) and drop it from the list.
  accept: (suggestion: RadarSuggestion) => void
}

export const useRadar = create<RadarState>((set, get) => ({
  suggestions: [],
  dismissed: new Set<string>(),
  accepts: loadAccepts(),
  refresh: () => {
    const tasks = useNodeStore.getState().nodes
    const all = detectTaskRadar(tasks, Date.now())
    const { dismissed } = get()
    set({ suggestions: all.filter((s) => !dismissed.has(s.id)) })
  },
  dismiss: (id) =>
    set((s) => {
      const dismissed = new Set(s.dismissed)
      dismissed.add(id)
      return { dismissed, suggestions: s.suggestions.filter((x) => x.id !== id) }
    }),
  accept: (suggestion) =>
    set((s) => {
      const accepts = { ...s.accepts, [suggestion.kind]: (s.accepts[suggestion.kind] ?? 0) + 1 }
      try {
        localStorage.setItem(ACCEPTS_KEY, JSON.stringify(accepts))
      } catch {
        // best-effort persistence
      }
      return { accepts, suggestions: s.suggestions.filter((x) => x.id !== suggestion.id) }
    })
}))

// How many times the user has accepted suggestions of a kind — the signal a later
// slice reads to escalate a category toward hands-free autonomy.
export function acceptCount(kind: RadarKind): number {
  return useRadar.getState().accepts[kind] ?? 0
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbRadar?: typeof useRadar }).__fbRadar = useRadar
}
