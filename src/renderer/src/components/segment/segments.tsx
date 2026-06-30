import SegmentShell from './SegmentShell'
import AllTasksView from '../views/AllTasksView'
import MessagesView from '../views/MessagesView'
import PlexiMeetView from '../views/PlexiMeetView'
import PlexiBuildView from '../views/PlexiBuildView'
import PlexiFormsView from '../views/PlexiFormsView'
import PlexiProjectsView from '../views/PlexiProjectsView'
import PlexiReportsView from '../views/PlexiReportsView'
import PlexiFlowView from '../views/PlexiFlowView'
import PlexiApiView from '../views/PlexiApiView'

// The three remaining segments, each a focused area with its own side menu and
// home, reusing the existing views inline (so the segment menu stays put as you
// move between its apps).

export function PlexiWorkShell(): JSX.Element {
  return (
    <SegmentShell
      def={{
        wordmark: 'PLEXIWORK',
        title: 'PlexiWork',
        subtitle: 'Plan and run your work, from projects and tasks to reports.',
        icon: 'work',
        apps: [
          { key: 'projects', label: 'Projects', blurb: 'Plans, timelines and Gantt charts', icon: 'account_tree', tint: 'bg-indigo-500', render: () => <PlexiProjectsView /> },
          { key: 'tasks', label: 'Tasks', blurb: 'Everything on your plate, in one list', icon: 'checklist', tint: 'bg-emerald-500', render: () => <AllTasksView /> },
          { key: 'reports', label: 'Reports', blurb: 'Summaries and insights from your work', icon: 'summarize', tint: 'bg-amber-500', render: () => <PlexiReportsView /> }
        ]
      }}
    />
  )
}

export function PlexiConnectShell(): JSX.Element {
  return (
    <SegmentShell
      def={{
        wordmark: 'PLEXICONNECT',
        title: 'PlexiConnect',
        subtitle: 'Talk and meet with your team, in chat and on video.',
        icon: 'diversity_3',
        apps: [
          { key: 'chat', label: 'PlexiChat', blurb: 'Channels and direct messages', icon: 'forum', tint: 'bg-sky-500', render: () => <MessagesView /> },
          { key: 'meet', label: 'PlexiMeet', blurb: 'Video calls and meetings', icon: 'video_call', tint: 'bg-rose-500', render: () => <PlexiMeetView /> }
        ]
      }}
    />
  )
}

export function PlexiFlowShell(): JSX.Element {
  return (
    <SegmentShell
      def={{
        wordmark: 'PLEXIFLOW',
        title: 'PlexiFlow',
        subtitle: 'Automate, build and collect, with flows, APIs, apps and forms.',
        icon: 'bolt',
        apps: [
          { key: 'flow', label: 'Flow', blurb: 'Automations that run your work', icon: 'bolt', tint: 'bg-violet-500', render: () => <PlexiFlowView /> },
          { key: 'api', label: 'API', blurb: 'Connect and call external services', icon: 'api', tint: 'bg-cyan-500', render: () => <PlexiApiView /> },
          { key: 'build', label: 'Build', blurb: 'Compose custom tools and apps', icon: 'construction', tint: 'bg-orange-500', render: () => <PlexiBuildView /> },
          { key: 'form', label: 'Form', blurb: 'Forms and surveys', icon: 'dynamic_form', tint: 'bg-pink-500', render: () => <PlexiFormsView /> }
        ]
      }}
    />
  )
}
