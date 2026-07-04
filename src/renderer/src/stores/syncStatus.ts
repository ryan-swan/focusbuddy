import { create } from 'zustand'

// Honest, user-visible sync status. The audit (review finding M1/M2) noted that
// workspace/cloud sync failed completely invisibly: an offline blip self-healed
// (correct), but a persistent server rejection also just retried every cycle
// forever with no signal, and a server-wins conflict discarded a local change
// silently. This store is the single source of truth the SyncIndicator reads so
// the user can tell synced / syncing / retrying-offline / error apart.
//
// It is deliberately NOT persisted: sync health is a live, this-session fact.
// The sync loop reports into it; nothing else writes it.

export type SyncState =
  | 'disabled' // not signed in, or sync flag off, or preview guard blocking
  | 'idle' // signed in, nothing to do yet
  | 'syncing'
  | 'ok' // last cycle completed and reached the server
  | 'offline' // last cycle could not reach the server (transient; keeps retrying)
  | 'error' // last cycle hit a real, non-transient server rejection

interface SyncStatusStore {
  state: SyncState
  lastOkAt: number // ms of the last cycle that reached the server, 0 if never
  lastError: string | null
  // How many times a push/pull has failed in a row for a non-offline reason.
  // The indicator escalates offline -> error wording once this passes a small
  // threshold, so one flaky response does not cry wolf.
  consecutiveErrors: number
  setSyncing: () => void
  setOk: () => void
  setOffline: () => void
  setError: (message: string) => void
  setDisabled: () => void
}

const ERROR_THRESHOLD = 3

export const useSyncStatus = create<SyncStatusStore>((set, get) => ({
  state: 'disabled',
  lastOkAt: 0,
  lastError: null,
  consecutiveErrors: 0,
  setSyncing: () => {
    // Do not flap the visible state to "syncing" on every 20s tick when things
    // are healthy; only show syncing if we are not already ok, so a steady
    // green does not blink every cycle.
    if (get().state === 'ok') return
    set({ state: 'syncing' })
  },
  setOk: () => set({ state: 'ok', lastOkAt: Date.now(), lastError: null, consecutiveErrors: 0 }),
  setOffline: () => {
    // Offline is transient and expected; it never counts as a hard error and
    // never overrides a genuine error state into looking merely offline.
    if (get().state === 'error') return
    set({ state: 'offline' })
  },
  setError: (message) => {
    const n = get().consecutiveErrors + 1
    // Below the threshold, treat it as offline-ish (transient) so a single bad
    // response does not alarm the user; at/over it, surface the real error.
    set({
      consecutiveErrors: n,
      lastError: message,
      state: n >= ERROR_THRESHOLD ? 'error' : 'offline'
    })
  },
  setDisabled: () => set({ state: 'disabled', lastError: null, consecutiveErrors: 0 })
}))
