import { create } from 'zustand'
import { signalConfig } from '../lib/signalConfig'
import { useAccountStore } from './account'

// Upvotes for coming-soon and planned PlexiSuite products. Each vote is a real
// account voting for a real feature key, so the team can both rank demand and
// notify the exact people who asked once a feature is ready to test.
//
// Persistence is local-first: a vote is recorded immediately in localStorage so
// it survives and reflects in the UI right away, and is synced to the signal
// server (which records WHICH account voted, for notification). Counts shown are
// the real server aggregate when the backend is reachable; before then we never
// fabricate a number, we show the votes we genuinely know about (the user's own)
// and reconcile with the server the moment it answers.

const LOCAL_KEY = 'fb.featureVotes.mine'

function loadLocalMine(): Record<string, true> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as Record<string, true>) : {}
  } catch {
    return {}
  }
}

function saveLocalMine(mine: Record<string, true>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(mine))
  } catch {
    /* ignore quota */
  }
}

function api(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

async function call<T>(
  method: string,
  path: string
): Promise<{ ok: boolean; status: number; json: T | null }> {
  const token = useAccountStore.getState().sessionToken
  try {
    const res = await fetch(api(path), {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    let json: T | null = null
    try {
      json = (await res.json()) as T
    } catch {
      /* ignore */
    }
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}

interface VotesState {
  // Real server aggregate per feature key. Absent key = unknown / zero known.
  counts: Record<string, number>
  // Feature keys this account has voted for.
  mine: Record<string, true>
  // True once the server answered at least once this session.
  serverSynced: boolean
  load: () => Promise<void>
  toggle: (key: string) => Promise<void>
  hasVoted: (key: string) => boolean
  countFor: (key: string) => number
}

export const useFeatureVotesStore = create<VotesState>((set, get) => ({
  counts: {},
  mine: loadLocalMine(),
  serverSynced: false,

  load: async () => {
    const { json } = await call<{ ok: boolean; counts?: Record<string, number>; mine?: string[] }>(
      'GET',
      '/features/votes'
    )
    if (json?.ok) {
      const mine: Record<string, true> = {}
      for (const k of json.mine ?? []) mine[k] = true
      // Server is the source of truth once it answers; merge any local-only
      // votes the user cast before the backend existed so nothing is lost.
      const merged = { ...get().mine, ...mine }
      saveLocalMine(merged)
      set({ counts: json.counts ?? {}, mine: merged, serverSynced: true })
    }
  },

  toggle: async (key) => {
    const voted = !!get().mine[key]
    // Optimistic, local-first: reflect the user's real choice immediately.
    const mine = { ...get().mine }
    if (voted) delete mine[key]
    else mine[key] = true
    saveLocalMine(mine)
    // Adjust the known count optimistically only when we already trust the
    // server number; otherwise leave counts alone rather than invent one.
    const counts = { ...get().counts }
    if (key in counts) counts[key] = Math.max(0, (counts[key] ?? 0) + (voted ? -1 : 1))
    set({ mine, counts })

    const { json } = await call<{ ok: boolean; count?: number }>(
      voted ? 'DELETE' : 'POST',
      `/features/${encodeURIComponent(key)}/vote`
    )
    if (json?.ok && typeof json.count === 'number') {
      set({ counts: { ...get().counts, [key]: json.count }, serverSynced: true })
    }
  },

  hasVoted: (key) => !!get().mine[key],
  countFor: (key) => get().counts[key] ?? 0
}))
