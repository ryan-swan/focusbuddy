import { create } from 'zustand'

// First-run onboarding gate. Shows the welcome + API-key + starter flow ONCE,
// and only to a genuinely fresh install. An existing user who upgrades into this
// build is grandfathered silently: if they already have any nodes or an API key,
// onboarding is marked done without ever showing.

const KEY = 'fb.onboarding.v1.done'

type Status = 'unknown' | 'active' | 'done'

interface OnboardingStore {
  status: Status
  init: () => Promise<void>
  complete: () => void
}

export const useOnboarding = create<OnboardingStore>((set) => ({
  status: 'unknown',
  init: async () => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1') {
      set({ status: 'done' })
      return
    }
    // Grandfather anyone who has already used the app — onboarding is for new
    // installs, not upgrades. Any existing data or a saved key means "not new".
    try {
      const [nodes, hint] = await Promise.all([
        window.api.nodes.list(),
        window.api.settings.hintAnthropic()
      ])
      if (nodes.length > 0 || hint.hasKey) {
        localStorage.setItem(KEY, '1')
        set({ status: 'done' })
        return
      }
    } catch {
      // If we can't tell, fail safe to showing onboarding — a fresh user is the
      // case that matters, and an existing user can dismiss it.
    }
    set({ status: 'active' })
  },
  complete: () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    set({ status: 'done' })
  }
}))
