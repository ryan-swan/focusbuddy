import { create } from 'zustand'
import { recordViewVisit } from '../lib/viewRecency'

// Current pane view — replaces the assumption that the main area always shows a task canvas.
// As PlexiDesk grows into a workspace OS, the main pane routes between Home Dashboard,
// All Tasks, per-Project Dashboards, individual Tasks, and Connected Apps.

export type View =
  | { kind: 'home' }
  | { kind: 'all-tasks' }
  // The Rooms/Desks index pages. 'rooms' lists every Room (folder node) and
  // 'desks' lists every Desk (canvas / task node) across all rooms, each with
  // gallery / list / kanban / table / timeline modes. optional roomId scopes the
  // desks index to a single room.
  | { kind: 'rooms' }
  | { kind: 'desks'; roomId?: string }
  | { kind: 'calendar' }
  | { kind: 'project-dashboard'; projectId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'connected-app'; appId: string }
  | { kind: 'vault' }
  | { kind: 'messages' }
  | { kind: 'inbox' }
  | { kind: 'mail'; openUid?: number }
  | { kind: 'documents' }
  | { kind: 'office'; app?: string }
  // The segment views carry an optional `app` so entry points elsewhere (the
  // suite launcher, the command palette, the home dashboard) can deep-link to a
  // specific app inside the segment rather than just its home. The top-level
  // structure is four segments: PlexiDesk (the workspace), PlexiOffice (the
  // 'office' kind below), PlexiPeople (the team area) and PlexiBrain (knowledge,
  // automation, insights).
  | { kind: 'plexidesk'; app?: string }
  | { kind: 'plexipeople'; app?: string }
  | { kind: 'plexibrain'; app?: string }
  | { kind: 'design' }
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
  | { kind: 'knowledge'; entryId?: string }
  | { kind: 'meetings' }
  | { kind: 'apps' }
  | { kind: 'forms' }
  | { kind: 'sign' }
  | { kind: 'search' }
  | { kind: 'projects' }
  | { kind: 'reports' }
  | { kind: 'flows' }
  | { kind: 'api' }
  | { kind: 'marketplace' }

interface ViewStore {
  view: View
  go: (view: View) => void
  goHome: () => void
  goAllTasks: () => void
  goRooms: () => void
  goDesks: (roomId?: string) => void
  goCalendar: () => void
  goProject: (projectId: string) => void
  goTask: (taskId: string) => void
  goConnectedApp: (appId: string) => void
  goVault: () => void
  goMessages: () => void
  goInbox: () => void
  goMail: (openUid?: number) => void
  goDocuments: () => void
  goOffice: (app?: string) => void
  goPlexiDesk: (app?: string) => void
  goPlexiPeople: (app?: string) => void
  goPlexiBrain: (app?: string) => void
  goDesign: () => void
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
  goKnowledge: (entryId?: string) => void
  goMeetings: () => void
  goApps: () => void
  goForms: () => void
  goSign: () => void
  goSearch: () => void
  goProjects: () => void
  goReports: () => void
  goFlows: () => void
  goApi: () => void
  goMarketplace: () => void
}

const STORAGE_KEY = 'fb.view.last'

function readLastView(): View {
  // PlexiSuite is the default landing: anyone without a saved view starts on the
  // suite launcher. Returning users still resume their last view.
  if (typeof localStorage === 'undefined') return { kind: 'suite' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { kind: 'suite' }
    // Read the raw shape loosely first so legacy kinds that are no longer in the
    // View union can still be mapped. A user mid-session may have one of the old
    // four-segment kinds (plexiwork / plexiconnect / plexiflow) persisted; map
    // each to its closest new home so resuming never lands on a dead kind.
    const loose = JSON.parse(raw) as { kind?: string; app?: string }
    if (loose && typeof loose.kind === 'string') {
      const app = loose.app
      switch (loose.kind) {
        case 'plexiwork':
          // Projects / Tasks lived in PlexiWork and live in PlexiDesk now;
          // Reports rolls into PlexiBrain insights.
          if (app === 'reports') return { kind: 'plexibrain', app: 'insights' }
          return { kind: 'plexidesk', app: app === 'projects' ? 'plans' : app }
        case 'plexiconnect':
          // Chat / Meet moved into PlexiOffice.
          return { kind: 'office', app }
        case 'plexiflow':
          // Flow / API / Build / Form moved into PlexiBrain.
          return { kind: 'plexibrain', app: app === 'flow' ? 'flows' : app }
        default:
          return JSON.parse(raw) as View
      }
    }
  } catch {
    // ignore
  }
  return { kind: 'suite' }
}

function persistView(view: View): void {
  // Remember the most-visited modules so the command palette can promote them.
  recordViewVisit(view.kind)
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
  goRooms: () => {
    const v: View = { kind: 'rooms' }
    persistView(v)
    set({ view: v })
  },
  goDesks: (roomId?: string) => {
    const v: View = { kind: 'desks', roomId }
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
  goOffice: (app) => {
    const v: View = { kind: 'office', app }
    persistView(v)
    set({ view: v })
  },
  goPlexiDesk: (app) => {
    const v: View = { kind: 'plexidesk', app }
    persistView(v)
    set({ view: v })
  },
  goPlexiPeople: (app) => {
    const v: View = { kind: 'plexipeople', app }
    persistView(v)
    set({ view: v })
  },
  goPlexiBrain: (app) => {
    const v: View = { kind: 'plexibrain', app }
    persistView(v)
    set({ view: v })
  },
  goDesign: () => {
    const v: View = { kind: 'design' }
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
  goKnowledge: (entryId?: string) => {
    const v: View = { kind: 'knowledge', entryId }
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
  },
  goReports: () => {
    const v: View = { kind: 'reports' }
    persistView(v)
    set({ view: v })
  },
  goFlows: () => {
    const v: View = { kind: 'flows' }
    persistView(v)
    set({ view: v })
  },
  goApi: () => {
    const v: View = { kind: 'api' }
    persistView(v)
    set({ view: v })
  },
  goMarketplace: () => {
    const v: View = { kind: 'marketplace' }
    persistView(v)
    set({ view: v })
  }
}))

// Expose the view store on window so debugging sessions and e2e specs can drive
// navigation directly. This is a thin handle to the real store, not a mock; it
// changes nothing about how the app behaves for users.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbView?: typeof useViewStore }).__fbView = useViewStore
}
