import { create } from 'zustand'

// Current pane view — replaces the assumption that the main area always shows a task canvas.
// As PlexiDesk grows into a workspace OS, the main pane routes between Home Dashboard,
// All Tasks, per-Project Dashboards, individual Tasks, and Connected Apps.

export type View =
  | { kind: 'home' }
  | { kind: 'all-tasks' }
  | { kind: 'calendar' }
  | { kind: 'project-dashboard'; projectId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'connected-app'; appId: string }
  | { kind: 'vault' }
  | { kind: 'messages' }
  | { kind: 'inbox' }
  | { kind: 'mail'; openUid?: number }
  | { kind: 'documents' }
  | { kind: 'document'; documentId: string }
  | { kind: 'files' }

interface ViewStore {
  view: View
  go: (view: View) => void
  goHome: () => void
  goAllTasks: () => void
  goCalendar: () => void
  goProject: (projectId: string) => void
  goTask: (taskId: string) => void
  goConnectedApp: (appId: string) => void
  goVault: () => void
  goMessages: () => void
  goInbox: () => void
  goMail: (openUid?: number) => void
  goDocuments: () => void
  goDocument: (documentId: string) => void
  goFiles: () => void
}

const STORAGE_KEY = 'fb.view.last'

function readLastView(): View {
  if (typeof localStorage === 'undefined') return { kind: 'home' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { kind: 'home' }
    const parsed = JSON.parse(raw) as Partial<View>
    if (parsed && typeof parsed.kind === 'string') {
      return parsed as View
    }
  } catch {
    // ignore
  }
  return { kind: 'home' }
}

function persistView(view: View): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view))
  } catch {
    /* ignore quota */
  }
}

export const useViewStore = create<ViewStore>((set) => ({
  view: readLastView(),
  go: (view) => {
    persistView(view)
    set({ view })
  },
  goHome: () => {
    const v: View = { kind: 'home' }
    persistView(v)
    set({ view: v })
  },
  goAllTasks: () => {
    const v: View = { kind: 'all-tasks' }
    persistView(v)
    set({ view: v })
  },
  goCalendar: () => {
    const v: View = { kind: 'calendar' }
    persistView(v)
    set({ view: v })
  },
  goProject: (projectId) => {
    const v: View = { kind: 'project-dashboard', projectId }
    persistView(v)
    set({ view: v })
  },
  goTask: (taskId) => {
    const v: View = { kind: 'task', taskId }
    persistView(v)
    set({ view: v })
  },
  goConnectedApp: (appId) => {
    const v: View = { kind: 'connected-app', appId }
    persistView(v)
    set({ view: v })
  },
  goVault: () => {
    const v: View = { kind: 'vault' }
    persistView(v)
    set({ view: v })
  },
  goMessages: () => {
    const v: View = { kind: 'messages' }
    persistView(v)
    set({ view: v })
  },
  goInbox: () => {
    const v: View = { kind: 'inbox' }
    persistView(v)
    set({ view: v })
  },
  goMail: (openUid) => {
    const v: View = { kind: 'mail', openUid }
    persistView(v)
    set({ view: v })
  },
  goDocuments: () => {
    const v: View = { kind: 'documents' }
    persistView(v)
    set({ view: v })
  },
  goDocument: (documentId) => {
    const v: View = { kind: 'document', documentId }
    persistView(v)
    set({ view: v })
  },
  goFiles: () => {
    const v: View = { kind: 'files' }
    persistView(v)
    set({ view: v })
  }
}))
