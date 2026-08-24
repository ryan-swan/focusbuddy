// Renderer state for agentic-browsing runs (A6/B2): the runtime's client.
// Main drives the loop and pushes events; this store is the one place the
// renderer accumulates them — B3's visible run (step ledger, consent
// prompt, Stop) renders from here. Starting a run through this store also
// registers it with the web panel, so closing the panel keeps its
// kill-switch meaning (no page, no run).

import { create } from 'zustand'
import { useWebPanel } from './webPanel'

export interface BrowserAgentEventLite {
  kind: string
  runId: string
  [key: string]: unknown
}

export interface BrowserAgentRunState {
  runId: string
  task: string
  // 'running' until a finished event lands; then that event's outcome.
  outcome: string
  summary: string
  // The host awaiting an R26 consent answer, when paused.
  pendingConsentHost: string | null
  events: BrowserAgentEventLite[]
  cost: { inputTokens: number; outputTokens: number; costMicros: number } | null
}

interface BrowserAgentStore {
  runs: Record<string, BrowserAgentRunState>
  start: (input: { task: string; startUrl?: string }) => Promise<string | null>
  stop: (runId: string) => Promise<void>
  consent: (runId: string, granted: boolean, remember: boolean) => Promise<void>
}

export const useBrowserAgentRuns = create<BrowserAgentStore>((set) => ({
  runs: {},

  // Starts a run against the web panel's live webview. The panel must be
  // open (the run drives ITS page — R28: acting happens where you can see
  // it); returns null when there is no page to drive.
  start: async ({ task, startUrl }) => {
    const wcId = useWebPanel.getState().wcId
    if (wcId == null) return null
    const { runId } = await window.api.browserAgent.start({ wcId, task, startUrl })
    useWebPanel.getState().setActiveRun(runId)
    set((s) => ({
      runs: {
        ...s.runs,
        [runId]: {
          runId,
          task,
          outcome: 'running',
          summary: '',
          pendingConsentHost: null,
          events: [],
          cost: null
        }
      }
    }))
    return runId
  },

  stop: async (runId) => {
    await window.api.browserAgent.stop(runId)
  },

  consent: async (runId, granted, remember) => {
    await window.api.browserAgent.consent(runId, granted, remember)
    set((s) => {
      const run = s.runs[runId]
      return run
        ? { runs: { ...s.runs, [runId]: { ...run, pendingConsentHost: null } } }
        : s
    })
  }
}))

// One subscription for the window's lifetime; events for unknown runs (e.g.
// started before this window existed) create their entry on first sight.
window.api.browserAgent.onEvent((ev) => {
  useBrowserAgentRuns.setState((s) => {
    const prev: BrowserAgentRunState = s.runs[ev.runId] ?? {
      runId: ev.runId,
      task: typeof ev.task === 'string' ? ev.task : '',
      outcome: 'running',
      summary: '',
      pendingConsentHost: null,
      events: [],
      cost: null
    }
    const next: BrowserAgentRunState = {
      ...prev,
      events: [...prev.events, ev as BrowserAgentEventLite]
    }
    if (ev.kind === 'consent_required' && typeof ev.host === 'string') next.pendingConsentHost = ev.host
    if (ev.kind === 'finished') {
      next.outcome = typeof ev.outcome === 'string' ? ev.outcome : 'finished'
      next.summary = typeof ev.summary === 'string' ? ev.summary : ''
      next.pendingConsentHost = null
      const cost = ev.cost as BrowserAgentRunState['cost']
      next.cost = cost ?? null
      if (useWebPanel.getState().activeRunId === ev.runId) useWebPanel.getState().setActiveRun(null)
    }
    return { runs: { ...s.runs, [ev.runId]: next } }
  })
})

// Test handle (A6 probe): drive and observe runs without UI.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbBrowserAgent?: typeof useBrowserAgentRuns }).__fbBrowserAgent =
    useBrowserAgentRuns
}
