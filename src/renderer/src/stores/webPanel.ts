// The in-app browser panel's state (A2, AI-03, R4/R13): one right-panel
// browser serves citations, omnibar URLs, and web search results — the web
// never leaves Plexi; the system browser is an explicit escape, not the
// default. Chrome-level state only (the webview owns its own history); kept
// tiny so any surface can send a URL here without knowing the panel.

import { create } from 'zustand'
import type { SearchEngineId } from '../lib/omniIntent'

const ENGINE_KEY = 'fb.webpanel.engine'

interface WebPanelState {
  open: boolean
  // Fullscreen (Caleb's seamless ruling, 2026-08-23): the half panel is the
  // fast default, one toggle makes the same page a genuine full-screen
  // browser inside Plexi. Per-open state: the panel always reopens compact.
  expanded: boolean
  // The address the panel was asked to show. The webview navigates freely
  // afterwards; this changes only on a new openWeb call (it is the webview's
  // `src`, and rewriting src on every did-navigate would reload the page).
  url: string | null
  // Pinned search-engine preference (AI-02 seed).
  engine: SearchEngineId
  openWeb: (url: string) => void
  close: () => void
  toggleExpanded: () => void
  setEngine: (engine: SearchEngineId) => void
}

export const useWebPanel = create<WebPanelState>((set) => ({
  open: false,
  expanded: false,
  url: null,
  engine: ((): SearchEngineId => {
    try {
      const v = localStorage.getItem(ENGINE_KEY)
      if (v === 'duckduckgo' || v === 'google' || v === 'bing') return v
    } catch {
      /* fresh profile */
    }
    return 'duckduckgo'
  })(),
  openWeb: (url) => set({ open: true, url }),
  close: () => set({ open: false, expanded: false }),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
  setEngine: (engine) => {
    try {
      localStorage.setItem(ENGINE_KEY, engine)
    } catch {
      /* ignore */
    }
    set({ engine })
  }
}))
