import { create } from 'zustand'

// Chrome state for the global assistant: whether it is open, which of the
// three display modes it is in, and the sidebar-mode dock width. This is the
// Notion-mirror container state — the CONVERSATION lives in stores/chat.ts and
// is completely independent of it; switching modes re-dresses the same panel
// over the same thread.
//
// Everything persists (localStorage, same pattern as fb.sidebar.*) so the
// assistant reopens where and how you left it, across reloads and restarts.
// Defaults mirror the Notion reference: closed pill, floating mode.

export type AssistantMode = 'sidebar' | 'floating' | 'fullscreen'

// The persistent assistant is a tabbed control surface (spec §5): Today (the daily
// standup), Chat (the conversation), Tasks, Activity, Work (desk agents). The tab
// is chrome, not conversation state, so it lives here beside mode/width.
export type AssistantTab = 'today' | 'chat' | 'agent' | 'tasks' | 'activity' | 'work'
export const ASSISTANT_TABS: AssistantTab[] = ['today', 'chat', 'agent', 'tasks', 'activity', 'work']

const OPEN_KEY = 'fb.assistant.open'
const MODE_KEY = 'fb.assistant.mode'
const WIDTH_KEY = 'fb.assistant.width'
const TAB_KEY = 'fb.assistant.tab'

// Sidebar-mode dock bounds, measured on the dock column (card + inset), same
// convention as the desk sidebar's SIDEBAR_MIN/MAX in chrome/floatingMenu. The
// assistant needs more room than the nav sidebar — prose, cards and the
// composer all live in it.
export const ASSISTANT_MIN = 300
export const ASSISTANT_MAX = 640
export const ASSISTANT_DEFAULT = 400

export function clampAssistantWidth(px: number): number {
  if (!Number.isFinite(px)) return ASSISTANT_DEFAULT
  return Math.max(ASSISTANT_MIN, Math.min(ASSISTANT_MAX, Math.round(px)))
}

function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function loadMode(): AssistantMode {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (raw === 'sidebar' || raw === 'floating' || raw === 'fullscreen') return raw
  } catch {
    /* ignore */
  }
  return 'floating'
}

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY)
    if (raw) return clampAssistantWidth(Number(raw))
  } catch {
    /* ignore */
  }
  return ASSISTANT_DEFAULT
}

function loadTab(): AssistantTab {
  try {
    const raw = localStorage.getItem(TAB_KEY)
    if (raw && (ASSISTANT_TABS as string[]).includes(raw)) return raw as AssistantTab
  } catch {
    /* ignore */
  }
  return 'today'
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

interface AssistantChromeStore {
  open: boolean
  mode: AssistantMode
  // Sidebar-mode dock width in px, clamped to [ASSISTANT_MIN, ASSISTANT_MAX].
  width: number
  activeTab: AssistantTab
  openPanel: () => void
  close: () => void
  toggle: () => void
  setTab: (tab: AssistantTab) => void
  setMode: (mode: AssistantMode) => void
  // Live during a drag — clamps but does not persist (that's persistWidth's
  // job when the drag settles, mirroring useSidebarWidth).
  setWidth: (px: number) => void
  persistWidth: () => void
}

export const useAssistantChrome = create<AssistantChromeStore>((set, get) => ({
  open: loadOpen(),
  mode: loadMode(),
  width: loadWidth(),
  activeTab: loadTab(),
  openPanel: () => {
    persist(OPEN_KEY, '1')
    set({ open: true })
  },
  close: () => {
    persist(OPEN_KEY, '0')
    set({ open: false })
  },
  toggle: () => {
    const next = !get().open
    persist(OPEN_KEY, next ? '1' : '0')
    set({ open: next })
  },
  setTab: (tab) => {
    persist(TAB_KEY, tab)
    set({ activeTab: tab })
  },
  setMode: (mode) => {
    persist(MODE_KEY, mode)
    set({ mode })
  },
  setWidth: (px) => set({ width: clampAssistantWidth(px) }),
  persistWidth: () => persist(WIDTH_KEY, String(get().width))
}))
