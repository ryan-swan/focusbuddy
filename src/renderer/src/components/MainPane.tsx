import { useViewStore } from '../stores/view'
import Canvas from './Canvas'
import HomeDashboard from './views/HomeDashboard'
import AllTasksView from './views/AllTasksView'
import ProjectDashboard from './views/ProjectDashboard'
import ConnectedAppView from './views/ConnectedAppView'
import VaultView from './views/VaultView'
import CalendarView from './views/CalendarView'

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
    default:
      return <HomeDashboard />
  }
}
