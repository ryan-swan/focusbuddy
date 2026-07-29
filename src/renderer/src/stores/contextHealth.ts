import { create } from 'zustand'

// Renderer-side Context Health (plexi-4.0). Reads the live context:* endpoints so
// desks can surface "what changed since you last looked" and "which related desks
// need attention". Everything degrades honestly: if the endpoints are absent (an
// older main process), the store simply holds nothing rather than inventing state.

export type HealthState = 'current' | 'changed' | 'attention-required' | 'decision-risk'

export interface HealthSnapshot {
  objectId: string
  state: HealthState
  changedEventCount: number
  materiality: { score: number; band: string } | null
  decisionsAtRisk: Array<{ decisionId: string; title: string; invalidatingChange: string }>
}

function ctx(): NonNullable<typeof window.api.context> | null {
  return window.api?.context ?? null
}

// States that warrant a visible nudge (as opposed to a passive "changed").
export function needsAttention(s: HealthState): boolean {
  return s === 'attention-required' || s === 'decision-risk'
}

interface ContextHealthStore {
  byId: Record<string, HealthSnapshot>
  // Snapshot captured at the moment a desk was opened, BEFORE it was marked
  // reviewed — so the header can show "caught you up on N changes since last visit".
  lastVisit: Record<string, HealthSnapshot>
  relatedById: Record<string, string[]>
  refresh: (id: string) => Promise<void>
  refreshMany: (ids: string[]) => Promise<void>
  openDesk: (id: string) => Promise<void>
}

export const useContextHealthStore = create<ContextHealthStore>((set, get) => ({
  byId: {},
  lastVisit: {},
  relatedById: {},

  refresh: async (id) => {
    const api = ctx()
    if (!api || !id) return
    try {
      const snap = await api.health(id)
      set((s) => ({ byId: { ...s.byId, [id]: snap as HealthSnapshot } }))
    } catch {
      /* honest no-op: leave prior state untouched rather than fabricate */
    }
  },

  refreshMany: async (ids) => {
    const api = ctx()
    if (!api || ids.length === 0) return
    const results = await Promise.allSettled(ids.filter(Boolean).map((id) => api.health(id)))
    set((s) => {
      const next = { ...s.byId }
      for (const r of results) if (r.status === 'fulfilled') next[(r.value as HealthSnapshot).objectId] = r.value as HealthSnapshot
      return { byId: next }
    })
  },

  // Opening a desk is the honest "I am now looking at this" signal. Capture the
  // pre-review snapshot, mark it reviewed (resets it to current), then refresh it
  // and its confirmed-related desks so their badges are current.
  openDesk: async (id) => {
    const api = ctx()
    if (!api || !id) return
    try {
      const before = (await api.health(id)) as HealthSnapshot
      const related = await api.related(id)
      set((s) => ({
        lastVisit: { ...s.lastVisit, [id]: before },
        relatedById: { ...s.relatedById, [id]: related }
      }))
      await api.markReviewed(id)
      await get().refresh(id)
      await get().refreshMany(related)
    } catch {
      /* honest no-op */
    }
  }
}))
