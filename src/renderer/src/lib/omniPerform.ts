// Perform an omni intent — the ONE act shared by every door (the palette
// rows, the chat composer, the Home bar), so "Open plexi.so" means exactly
// the same thing wherever it was typed. Pure store calls, no component state:
// callers handle their own input clearing.

import { useViewStore } from '../stores/view'
import { useNodeStore } from '../stores/nodes'
import { useWebPanel } from '../stores/webPanel'
import { searchUrl, type OmniIntent } from './omniIntent'

export function performOmniIntent(intent: OmniIntent): void {
  const view = useViewStore.getState()
  if (intent.kind === 'url' && intent.url) {
    // Deliberate browsing starts full screen (Caleb's default).
    useWebPanel.getState().openWeb(intent.url, { expanded: true })
  } else if (intent.kind === 'search' && intent.url) {
    useWebPanel
      .getState()
      .openWeb(searchUrl(useWebPanel.getState().engine, intent.url), { expanded: true })
  } else if (intent.kind === 'goto' && intent.target) {
    const t = intent.target
    if (t.kind === 'desk') {
      useNodeStore.getState().setActive(t.id)
      view.goTask(t.id)
    } else if (t.kind === 'document') {
      view.goDocument(t.id)
    } else {
      if (t.id === 'home') view.goHome()
      else if (t.id === 'tasks') view.goAllTasks()
      else if (t.id === 'calendar') view.goCalendar()
      else if (t.id === 'files') view.goFiles()
      else if (t.id === 'vault') view.goVault()
    }
  }
}

// The sticky surface modes (Caleb's pills ruling, 2026-08-23, "Both"
// semantics: tapping a pill acts on the current text AND locks the mode
// until switched). Persisted per surface so the bar you left in Search mode
// is still a search bar tomorrow — the pill row always shows the lock.
export type OmniMode = 'ask' | 'search'

export function loadOmniMode(key: string, fallback: OmniMode = 'ask'): OmniMode {
  try {
    const v = localStorage.getItem(key)
    if (v === 'ask' || v === 'search') return v
  } catch {
    /* fresh profile */
  }
  return fallback
}

export function saveOmniMode(key: string, mode: OmniMode): void {
  try {
    localStorage.setItem(key, mode)
  } catch {
    /* ignore */
  }
}
