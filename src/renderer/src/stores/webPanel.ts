// The in-app browser panel's state (A2, AI-03, R4/R13): one right-panel
// browser serves citations, omnibar URLs, and web search results — the web
// never leaves Plexii; the system browser is an explicit escape, not the
// default. Chrome-level state only (the webview owns its own history); kept
// tiny so any surface can send a URL here without knowing the panel.

import { create } from 'zustand'
import { SEARCH_ENGINES, type SearchEngineId } from '../lib/omniIntent'

const ENGINE_KEY = 'fb.webpanel.engine'

interface WebPanelState {
  open: boolean
  // Fullscreen (Caleb's seamless ruling, 2026-08-23): the half panel is the
  // fast default, one toggle makes the same page a genuine full-screen
  // browser inside Plexii. Per-open state: the panel always reopens compact.
  expanded: boolean
  // The address the panel was asked to show. The webview navigates freely
  // afterwards; this changes only on a new openWeb call (it is the webview's
  // `src`, and rewriting src on every did-navigate would reload the page).
  url: string | null
  // Pinned search-engine preference (AI-02 seed).
  engine: SearchEngineId
  // The mounted webview's webContents id (null until attach / after close).
  // The agent runtime (A6) drives the panel's page through this — main can
  // only act on a webContents it can address.
  wcId: number | null
  // The agent run currently driving this panel, if any. Closing the panel is
  // itself a kill switch (R26: actions happen where you can see them — no
  // page, no run): close() stops the run before the webview unmounts.
  activeRunId: string | null
  openWeb: (url: string, opts?: { expanded?: boolean }) => void
  close: () => void
  toggleExpanded: () => void
  setEngine: (engine: SearchEngineId) => void
  setWcId: (wcId: number | null) => void
  setActiveRun: (runId: string | null) => void
}

export const useWebPanel = create<WebPanelState>((set) => ({
  open: false,
  expanded: false,
  url: null,
  engine: ((): SearchEngineId => {
    try {
      const v = localStorage.getItem(ENGINE_KEY)
      if (SEARCH_ENGINES.some((e) => e.id === v)) return v as SearchEngineId
    } catch {
      /* fresh profile */
    }
    return 'duckduckgo'
  })(),
  // Browsing you ASKED for (a search, an omnibar open) starts full screen —
  // Caleb's default; a citation clicked beside an answer stays the compact
  // panel so the conversation remains in view. Callers say which they are.
  openWeb: (url, opts) => set((s) => ({ open: true, url, expanded: opts?.expanded ?? s.expanded })),
  close: () =>
    set((s) => {
      if (s.activeRunId) {
        try {
          void window.api.agentBrowser.stopRun(s.activeRunId)
        } catch {
          /* main gone — nothing left to stop */
        }
      }
      return { open: false, expanded: false, wcId: null, activeRunId: null }
    }),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
  setEngine: (engine) => {
    try {
      localStorage.setItem(ENGINE_KEY, engine)
    } catch {
      /* ignore */
    }
    set({ engine })
  },
  wcId: null,
  setWcId: (wcId) => set({ wcId }),
  activeRunId: null,
  setActiveRun: (runId) => set({ activeRunId: runId })
}))

// Test handle (A6 probe): the bridge probe needs the live wcId to drive.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbWebPanel?: typeof useWebPanel }).__fbWebPanel = useWebPanel
}
