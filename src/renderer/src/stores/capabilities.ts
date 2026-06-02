// Capability store — caches the per-tier resolved capability map for
// the signed-in user, refreshed on auth change + window focus + an
// imperative `refresh()` call. Consumers read via `useCapability(key)`.
//
// Why a store + not a hook-only fetch: multiple features (body double,
// AI features, marketplace) read capabilities simultaneously. A single
// shared cache avoids N parallel fetches on every render.
//
// Fallback behavior:
//   - Signed in + fetch succeeded → server-resolved values
//   - Signed in + fetch failed → local-snapshot values for the
//     account's tier (degrades to "I think the user has Pro" if the
//     account-meta lookup was stale, which is acceptable while the
//     server is unreachable)
//   - Signed out → local-snapshot values for 'free' tier

import { create } from 'zustand'
import {
  CAPABILITY_DEFAULTS,
  type CapabilityValue,
  type TierId
} from '../lib/capabilityDefaults'
import { signalConfig } from '../lib/signalConfig'
import { useAccountStore } from './account'

// Trial envelope shape from /account/capabilities. The desktop reads
// this to render the footer badge and the "Trial ended" modal. Server
// is the source of truth; we never compute days locally because clock
// drift on the user's machine would silently mis-state the deadline.
export interface TrialState {
  active: boolean
  daysLeft: number
  startedAt: number | null
  expiresAt: number | null
}

interface CapabilityStore {
  // The TIER actually being applied right now (e.g. 'team' if trial is
  // active even though storedTier is 'free'). This is what consumers
  // gate against. The legacy `tier` field aliases this for back-compat.
  tier: TierId
  effectiveTier: TierId
  // The TIER stored against the account (the post-trial fallback).
  // Useful for upgrade UX so we can show "You're currently on Free —
  // upgrade to Pro to keep these features after your trial."
  storedTier: TierId
  trial: TrialState
  capabilities: Record<string, CapabilityValue>
  loadedAt: number | null
  error: string | null
  refresh: () => Promise<void>
  /** Resolve a single capability synchronously — used by `useCapability`. */
  get: (key: string) => CapabilityValue
}

const DEFAULT_TRIAL: TrialState = {
  active: false,
  daysLeft: 0,
  startedAt: null,
  expiresAt: null
}

function localMap(tier: TierId): Record<string, CapabilityValue> {
  const out: Record<string, CapabilityValue> = {}
  for (const [key, perTier] of Object.entries(CAPABILITY_DEFAULTS)) {
    out[key] = perTier[tier]
  }
  return out
}

export const useCapabilityStore = create<CapabilityStore>((set, get) => ({
  tier: 'free',
  effectiveTier: 'free',
  storedTier: 'free',
  trial: DEFAULT_TRIAL,
  capabilities: localMap('free'),
  loadedAt: null,
  error: null,
  refresh: async () => {
    const token = useAccountStore.getState().sessionToken
    if (!token) {
      set({
        tier: 'free',
        effectiveTier: 'free',
        storedTier: 'free',
        trial: DEFAULT_TRIAL,
        capabilities: localMap('free'),
        loadedAt: null,
        error: null
      })
      return
    }
    try {
      const res = await fetch(`${signalConfig.httpUrl}/account/capabilities`, {
        headers: { authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        set({ error: `HTTP ${res.status}` })
        return
      }
      const body = (await res.json()) as {
        ok: boolean
        tier?: TierId
        // New richer fields. Older servers omit these — desktop falls
        // back to the legacy `tier`-only shape so a downgraded server
        // (or pinned old build) keeps working.
        storedTier?: TierId
        effectiveTier?: TierId
        trial?: TrialState
        capabilities?: Record<string, CapabilityValue>
      }
      if (!body.ok || !body.tier || !body.capabilities) {
        set({ error: 'Unexpected /account/capabilities shape' })
        return
      }
      const effectiveTier = body.effectiveTier ?? body.tier
      const storedTier = body.storedTier ?? body.tier
      const trial = body.trial ?? DEFAULT_TRIAL
      set({
        tier: effectiveTier,
        effectiveTier,
        storedTier,
        trial,
        capabilities: body.capabilities,
        loadedAt: Date.now(),
        error: null
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },
  get: (key: string): CapabilityValue => {
    const map = get().capabilities
    return map[key] ?? false
  }
}))

/**
 * Hook — reactive read of the user's trial state. Returns the envelope
 * the server sent (active flag, days left, expiry). Renderer-side UI
 * uses this to decide whether to show the footer badge / lapsed modal.
 */
export function useTrial(): TrialState {
  return useCapabilityStore((s) => s.trial)
}

/** Hook — current stored tier, for upgrade-affordance copy. */
export function useStoredTier(): TierId {
  return useCapabilityStore((s) => s.storedTier)
}

/**
 * Initialise the capability subscription:
 *   - Refresh whenever the account session changes (login, logout,
 *     adoptHandoff).
 *   - Refresh on window focus so admin matrix edits propagate quickly.
 * Called once from App.tsx on mount.
 */
export function installCapabilityWatcher(): () => void {
  const unsubAccount = useAccountStore.subscribe((s, prev) => {
    if (s.sessionToken !== prev.sessionToken) {
      void useCapabilityStore.getState().refresh()
    }
  })
  const onFocus = (): void => {
    void useCapabilityStore.getState().refresh()
  }
  window.addEventListener('focus', onFocus)
  // Kick off an immediate fetch (uses whatever session is loaded).
  void useCapabilityStore.getState().refresh()
  return () => {
    unsubAccount()
    window.removeEventListener('focus', onFocus)
  }
}

/**
 * Hook — reactive read of a single capability. Returns the resolved
 * value (boolean / number / string). Use as `useCapability('body_double')`.
 */
export function useCapability(key: string): CapabilityValue {
  return useCapabilityStore((s) => s.capabilities[key] ?? false)
}

/** Convenience: true if the capability resolves truthy. */
export function useCapabilityEnabled(key: string): boolean {
  const v = useCapability(key)
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v > 0
  if (typeof v === 'string') return v.length > 0 && v.toLowerCase() !== 'off'
  return false
}
