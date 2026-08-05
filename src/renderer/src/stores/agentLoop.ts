import { create } from 'zustand'
import type { ActionProposal, AgentStatus, AgentActionOutcome } from '@shared/types'

// State for one autonomous agent run: the live transcript the UI shows, the
// gated actions deferred for the user's approval, and a `running` flag other
// surfaces read as a lock (ProposalCards disables its Apply while a run is live,
// so a manual click can't fold into the run's undo batch or race its applies).

export interface AgentRunStep {
  round: number
  narration: string
  outcomes: AgentActionOutcome[]
  // Kinds deferred this round because they are consequential (gated) — surfaced
  // to the user as approval cards rather than auto-applied.
  deferred: string[]
  status: AgentStatus
  blocker: string | null
}

interface AgentLoopState {
  running: boolean
  goal: string | null
  steps: AgentRunStep[]
  pendingApprovals: ActionProposal[]
  finalStatus: AgentStatus | null
  finalBlocker: string | null
  start: (goal: string) => void
  pushStep: (step: AgentRunStep) => void
  finish: (status: AgentStatus, blocker: string | null, pendingApprovals: ActionProposal[]) => void
  reset: () => void
}

export const useAgentLoop = create<AgentLoopState>((set) => ({
  running: false,
  goal: null,
  steps: [],
  pendingApprovals: [],
  finalStatus: null,
  finalBlocker: null,
  start: (goal) =>
    set({ running: true, goal, steps: [], pendingApprovals: [], finalStatus: null, finalBlocker: null }),
  pushStep: (step) => set((s) => ({ steps: [...s.steps, step] })),
  finish: (finalStatus, finalBlocker, pendingApprovals) =>
    set({ running: false, finalStatus, finalBlocker, pendingApprovals }),
  reset: () =>
    set({ running: false, goal: null, steps: [], pendingApprovals: [], finalStatus: null, finalBlocker: null })
}))

// Thin handle for debugging + e2e (same convention as __fbNodes/__fbView).
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbAgentLoop?: typeof useAgentLoop }).__fbAgentLoop = useAgentLoop
}
