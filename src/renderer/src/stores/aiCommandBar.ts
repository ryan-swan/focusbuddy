import { create } from 'zustand'
import type { AiBuildSuggestion } from '@shared/types'

// Global control for the single "Ask AI" command bar so it can be summoned from
// anywhere (header button, Cmd+Shift+K, the canvas toolbar) rather than being
// owned by one component's local state. Also carries the build hand-off: when
// the command bar has prepared object suggestions, it stashes them here and the
// canvas picks them up to open the builder preview, which replaces the old
// dead-end alert that told the user to "go open the AI builder".

export interface AiBuildHandoff {
  suggestions: AiBuildSuggestion[]
  intent: string
}

interface AiCommandBarState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  // Suggestions handed from the command bar to the canvas builder for placement.
  handoff: AiBuildHandoff | null
  setHandoff: (handoff: AiBuildHandoff | null) => void
}

export const useAiCommandBar = create<AiCommandBarState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  handoff: null,
  setHandoff: (handoff) => set({ handoff })
}))
