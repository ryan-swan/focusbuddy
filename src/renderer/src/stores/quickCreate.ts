import { create } from 'zustand'

// Global quick-create: lets the command palette (Cmd+K) ask any module to create
// a new item, from anywhere in the app, without the user first navigating to that
// module and hunting for its "New" button. The palette sets a pending request and
// navigates; the destination module view consumes the request as it mounts (or
// immediately, if already open) and runs its own create. This removes the
// redundant "start a new ..." detour the UX panel flagged: one keystroke, one
// command, straight into the new thing.

interface QuickCreateStore {
  pending: string | null
  request: (moduleKey: string) => void
  // Returns true (and clears) if there is a pending request for this module.
  consume: (moduleKey: string) => boolean
}

export const useQuickCreate = create<QuickCreateStore>((set, get) => ({
  pending: null,
  request: (moduleKey) => set({ pending: moduleKey }),
  consume: (moduleKey) => {
    if (get().pending === moduleKey) {
      set({ pending: null })
      return true
    }
    return false
  }
}))
