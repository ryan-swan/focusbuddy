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
  | { kind: 'livedoc'; liveDocId: string }
  | { kind: 'livecanvas'; liveCanvasId: string }
  | { kind: 'livefolder'; liveFolderId: string }
  | { kind: 'collaborations' }
  | { kind: 'insights' }
  | { kind: 'files' }
  | { kind: 'organization' }
  | { kind: 'people-map' }
  | { kind: 'suite' }
  | { kind: 'product'; productKey: string }
  | { kind: 'knowledge' }
  | { kind: 'meetings' }
  | { kind: 'apps' }
  | { kind: 'forms' }
  | { kind: 'sign' }
  | { kind: 'search' }
  | { kind: 'projects' }

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
  goLiveDoc: (liveDocId: string) => void
  goLiveCanvas: (liveCanvasId: string) => void
  goLiveFolder: (liveFolderId: string) => void
  goCollaborations: () => void
  goInsights: () => void
  goFiles: () => void
  goOrg: () => void
  goPeopleMap: () => void
  goSuite: () => void
  goProduct: (productKey: string) => void
  goKnowledge: () => void
  goMeetings: () => void
  goApps: () => void
  goForms: () => void
  goSign: () => void
  goSearch: () => void
  goProjects: () => void
}

const STORAGE_KEY = 'fb.view.last'

function readLastView(): View {
  // PlexiSuite is the default landing: anyone without a saved view starts on the
  // suite launcher. Returning users still resume their last view.
  if (typeof localStorage === 'undefined') return { kind: 'suite' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { kind: 'suite' }
    const parsed = JSON.parse(raw) as Partial<View>
    if (parsed && typeof parsed.kind === 'string') {
      return parsed as View
    }
  } catch {
    // ignore
  }
  return { kind: 'suite' }
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
  goLiveDoc: (liveDocId) => {
    const v: View = { kind: 'livedoc', liveDocId }
    persistView(v)
    set({ view: v })
  },
  goLiveCanvas: (liveCanvasId) => {
    const v: View = { kind: 'livecanvas', liveCanvasId }
    persistView(v)
    set({ view: v })
  },
  goLiveFolder: (liveFolderId) => {
    const v: View = { kind: 'livefolder', liveFolderId }
    persistView(v)
    set({ view: v })
  },
  goCollaborations: () => {
    const v: View = { kind: 'collaborations' }
    persistView(v)
    set({ view: v })
  },
  goInsights: () => {
    const v: View = { kind: 'insights' }
    persistView(v)
    set({ view: v })
  },
  goFiles: () => {
    const v: View = { kind: 'files' }
    persistView(v)
    set({ view: v })
  },
  goOrg: () => {
    const v: View = { kind: 'organization' }
    persistView(v)
    set({ view: v })
  },
  goPeopleMap: () => {
    const v: View = { kind: 'people-map' }
    persistView(v)
    set({ view: v })
  },
  goSuite: () => {
    const v: View = { kind: 'suite' }
    persistView(v)
    set({ view: v })
  },
  goProduct: (productKey) => {
    const v: View = { kind: 'product', productKey }
    persistView(v)
    set({ view: v })
  },
  goKnowledge: () => {
    const v: View = { kind: 'knowledge' }
    persistView(v)
    set({ view: v })
  },
  goMeetings: () => {
    const v: View = { kind: 'meetings' }
    persistView(v)
    set({ view: v })
  },
  goApps: () => {
    const v: View = { kind: 'apps' }
    persistView(v)
    set({ view: v })
  },
  goForms: () => {
    const v: View = { kind: 'forms' }
    persistView(v)
    set({ view: v })
  },
  goSign: () => {
    const v: View = { kind: 'sign' }
    persistView(v)
    set({ view: v })
  },
  goSearch: () => {
    const v: View = { kind: 'search' }
    persistView(v)
    set({ view: v })
  },
  goProjects: () => {
    const v: View = { kind: 'projects' }
    persistView(v)
    set({ view: v })
  }
}))
