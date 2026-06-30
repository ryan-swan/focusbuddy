import SegmentShell from './SegmentShell'
import Canvas from '../Canvas'
import HomeDashboard from '../views/HomeDashboard'
import AllTasksView from '../views/AllTasksView'
import CalendarView from '../views/CalendarView'
import FilesView from '../views/FilesView'
import OrgAdminView from '../views/OrgAdminView'
import PlexiProjectsView from '../views/PlexiProjectsView'
import RecentView from '../views/RecentView'
import KnowledgeView from '../views/KnowledgeView'
import PlexiSearchView from '../views/PlexiSearchView'
import BrainMapView from '../views/BrainMapView'
import PlexiFlowView from '../views/PlexiFlowView'
import AgentsView from '../views/AgentsView'
import ConnectedAppsHubView from '../views/ConnectedAppsHubView'
import PlexiApiView from '../views/PlexiApiView'
import InsightsView from '../views/InsightsView'
import PeopleHomeView from '../views/PeopleHomeView'
import PeopleMapView from '../views/PeopleMapView'

// The four top-level segments. Each is a focused area with its own side menu
// and a home of app tiles, reusing the existing views inline (so the segment
// menu stays put as you move between its apps). PlexiOffice is the third segment
// and keeps its own richer shell (PlexiOfficeShell) because of its document
// create/open affordances.

export function PlexiDeskShell({ initialApp }: { initialApp?: string } = {}): JSX.Element {
  return (
    <SegmentShell
      initialApp={initialApp}
      def={{
        wordmark: 'PLEXIDESK',
        title: 'PlexiDesk',
        subtitle: 'Your workspace. Your desk, plans, tasks, calendar and files in one place.',
        icon: 'desktop_windows',
        apps: [
          { key: 'home', label: 'Home', blurb: 'Your dashboard and what is next', icon: 'dashboard', tint: 'bg-indigo-500', render: () => <HomeDashboard /> },
          { key: 'desk', label: 'My Desk', blurb: 'The working canvas you build on', icon: 'space_dashboard', tint: 'bg-sky-500', render: () => <Canvas /> },
          { key: 'workspaces', label: 'Workspaces', blurb: 'Organisations and sub-workspaces', icon: 'apartment', tint: 'bg-teal-500', render: () => <OrgAdminView /> },
          { key: 'plans', label: 'Plans', blurb: 'Timelines, milestones and Gantt charts', icon: 'account_tree', tint: 'bg-violet-500', render: () => <PlexiProjectsView /> },
          { key: 'tasks', label: 'Tasks', blurb: 'Everything on your plate, in one list', icon: 'checklist', tint: 'bg-emerald-500', render: () => <AllTasksView /> },
          { key: 'calendar', label: 'Calendar', blurb: 'Your work by date', icon: 'calendar_month', tint: 'bg-amber-500', render: () => <CalendarView /> },
          { key: 'files', label: 'Files', blurb: 'Every file in your workspace', icon: 'folder', tint: 'bg-orange-500', render: () => <FilesView /> },
          { key: 'recent', label: 'Recent', blurb: 'Documents you last opened', icon: 'schedule', tint: 'bg-rose-500', render: () => <RecentView /> }
        ]
      }}
    />
  )
}

export function PlexiPeopleShell({ initialApp }: { initialApp?: string } = {}): JSX.Element {
  return (
    <SegmentShell
      initialApp={initialApp}
      def={{
        wordmark: 'PLEXIPEOPLE',
        title: 'PlexiPeople',
        subtitle: 'Your team. Who is here, the people directory and your organisation map.',
        icon: 'groups',
        apps: [
          { key: 'home', label: 'People Home', blurb: 'Team status and who is around', icon: 'groups', tint: 'bg-indigo-500', render: () => <PeopleHomeView /> },
          { key: 'directory', label: 'Directory', blurb: 'Everyone in your workspace', icon: 'badge', tint: 'bg-sky-500', render: () => <PeopleHomeView /> },
          { key: 'workspaces', label: 'Organisation', blurb: 'Members, roles, offices and profiles', icon: 'apartment', tint: 'bg-teal-500', render: () => <OrgAdminView /> },
          { key: 'map', label: 'Organisation Map', blurb: 'Everyone by office and reporting line', icon: 'account_tree', tint: 'bg-violet-500', render: () => <PeopleMapView /> }
        ]
      }}
    />
  )
}

export function PlexiBrainShell({ initialApp }: { initialApp?: string } = {}): JSX.Element {
  return (
    <SegmentShell
      initialApp={initialApp}
      def={{
        wordmark: 'PLEXIBRAIN',
        title: 'PlexiBrain',
        subtitle: 'Your knowledge, search, automation and insights, with AI woven through.',
        icon: 'neurology',
        apps: [
          { key: 'ask', label: 'Ask Brain', blurb: 'Your knowledge base, ask anything', icon: 'neurology', tint: 'bg-indigo-500', render: () => <KnowledgeView /> },
          { key: 'search', label: 'Search', blurb: 'Find anything across your workspace', icon: 'search', tint: 'bg-sky-500', render: () => <PlexiSearchView /> },
          { key: 'map', label: 'Brain Map', blurb: 'Your knowledge as a linked graph', icon: 'bubble_chart', tint: 'bg-fuchsia-500', render: () => <BrainMapView /> },
          { key: 'flows', label: 'Flows', blurb: 'Automations that run your work', icon: 'bolt', tint: 'bg-violet-500', render: () => <PlexiFlowView /> },
          { key: 'agents', label: 'Agents', blurb: 'Standing AI workers on your desks', icon: 'smart_toy', tint: 'bg-emerald-500', render: () => <AgentsView /> },
          { key: 'connect', label: 'Connect', blurb: 'Your connected apps and integrations', icon: 'hub', tint: 'bg-cyan-500', render: () => <ConnectedAppsHubView /> },
          { key: 'api', label: 'APIs', blurb: 'Connect and call external services', icon: 'api', tint: 'bg-amber-500', render: () => <PlexiApiView /> },
          { key: 'insights', label: 'Insights', blurb: 'Dashboards and reporting', icon: 'insights', tint: 'bg-rose-500', render: () => <InsightsView /> }
        ]
      }}
    />
  )
}
