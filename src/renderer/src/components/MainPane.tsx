import { useViewStore } from '../stores/view'
import Canvas from './Canvas'
import HomeDashboard from './views/HomeDashboard'
import AllTasksView from './views/AllTasksView'
import ProjectDashboard from './views/ProjectDashboard'
import ConnectedAppView from './views/ConnectedAppView'
import VaultView from './views/VaultView'
import CalendarView from './views/CalendarView'
import MessagesView from './views/MessagesView'
import InboxView from './views/InboxView'
import MailView from './views/MailView'
import DocumentsView from './views/DocumentsView'
import DocumentEditorView from './views/DocumentEditorView'
import LiveDocEditorView from './views/LiveDocEditorView'
import LiveCanvasView from './views/LiveCanvasView'
import LiveFolderView from './views/LiveFolderView'
import CollaborationsView from './views/CollaborationsView'
import InsightsView from './views/InsightsView'
import FilesView from './views/FilesView'
import OrgAdminView from './views/OrgAdminView'
import PeopleMapView from './views/PeopleMapView'
import PlexiSignView from './views/PlexiSignView'
import PlexiSuiteHome from './suite/PlexiSuiteHome'
import ProductHome from './suite/ProductHome'
import KnowledgeView from './views/KnowledgeView'
import PlexiMeetView from './views/PlexiMeetView'
import PlexiBuildView from './views/PlexiBuildView'
import PlexiFormsView from './views/PlexiFormsView'
import PlexiSearchView from './views/PlexiSearchView'
import PlexiProjectsView from './views/PlexiProjectsView'
import PlexiReportsView from './views/PlexiReportsView'
import PlexiFlowView from './views/PlexiFlowView'
import PlexiApiView from './views/PlexiApiView'
import PlexiMarketplaceView from './views/PlexiMarketplaceView'

// The MainPane routes the central area between the OS-level views.
// Existing Canvas + chat behavior is preserved for the 'task' view; everything else
// is new surface introduced by the OS Phase 1 sidebar restructure.
export default function MainPane(): JSX.Element {
  const view = useViewStore((s) => s.view)
  switch (view.kind) {
    case 'home':
      return <HomeDashboard />
    case 'all-tasks':
      return <AllTasksView />
    case 'project-dashboard':
      return <ProjectDashboard projectId={view.projectId} />
    case 'task':
      return <Canvas />
    case 'connected-app':
      return <ConnectedAppView appId={view.appId} />
    case 'vault':
      return <VaultView />
    case 'calendar':
      return <CalendarView />
    case 'messages':
      return <MessagesView />
    case 'inbox':
      return <InboxView />
    case 'mail':
      return <MailView />
    case 'documents':
      return <DocumentsView />
    case 'document':
      return <DocumentEditorView documentId={view.documentId} />
    case 'livedoc':
      return <LiveDocEditorView liveDocId={view.liveDocId} />
    case 'livecanvas':
      return <LiveCanvasView liveCanvasId={view.liveCanvasId} />
    case 'livefolder':
      return <LiveFolderView liveFolderId={view.liveFolderId} />
    case 'collaborations':
      return <CollaborationsView />
    case 'insights':
      return <InsightsView />
    case 'files':
      return <FilesView />
    case 'organization':
      return <OrgAdminView />
    case 'people-map':
      return <PeopleMapView />
    case 'suite':
      return <PlexiSuiteHome />
    case 'product':
      return <ProductHome productKey={view.productKey} />
    case 'knowledge':
      return <KnowledgeView />
    case 'meetings':
      return <PlexiMeetView />
    case 'apps':
      return <PlexiBuildView />
    case 'forms':
      return <PlexiFormsView />
    case 'sign':
      return <PlexiSignView />
    case 'search':
      return <PlexiSearchView />
    case 'projects':
      return <PlexiProjectsView />
    case 'reports':
      return <PlexiReportsView />
    case 'flows':
      return <PlexiFlowView />
    case 'api':
      return <PlexiApiView />
    case 'marketplace':
      return <PlexiMarketplaceView />
    default:
      return <HomeDashboard />
  }
}
