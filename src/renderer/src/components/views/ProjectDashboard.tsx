import { useState } from 'react'
import type { DashboardCardKind } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import Dashboard from '../dashboard/Dashboard'
import WorkspaceHeader, { type WorkspaceTab } from '../WorkspaceHeader'
import PlaceholderView from './PlaceholderView'

interface Props {
  projectId: string
}

// Maps each workspace tab to the dashboard cards that should be visible.
// Overview = whatever the user has configured. Tasks / Notes / Files /
// Activity = filtered down to the cards most relevant to that lens.
// Calendar redirects to the dedicated Calendar view (handled in
// WorkspaceHeader itself).
const TAB_CARD_FILTER: Record<
  Exclude<WorkspaceTab, 'calendar' | 'overview'>,
  Set<DashboardCardKind>
> = {
  tasks: new Set(['today-tasks', 'quick-start', 'workspace-progress']),
  notes: new Set(['recent-notes', 'ai-assistant']),
  files: new Set(['recent-activity', 'folders']),
  activity: new Set(['recent-activity', 'stats', 'workspace-progress'])
}

// Per-project dashboard with workspace header.
//
// Architecture: ProjectDashboard renders the WorkspaceHeader (title +
// Private chip + Members + Share + tabs), then a single <Dashboard>
// scoped to this project. When the user clicks a non-Overview tab, the
// Dashboard is re-rendered with a `cardFilter` prop that restricts which
// cards display. Clicking Overview restores the user's full layout.
export default function ProjectDashboard({ projectId }: Props): JSX.Element {
  const project = useNodeStore((s) => s.nodes.find((n) => n.id === projectId)) ?? null
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview')

  if (!project) {
    return (
      <PlaceholderView
        icon="folder_off"
        title="Project not found"
        blurb="This project may have been deleted. Pick another from the sidebar."
      />
    )
  }

  const cardFilter =
    activeTab === 'overview' || activeTab === 'calendar'
      ? null
      : TAB_CARD_FILTER[activeTab]

  return (
    <div className="h-full overflow-auto flex flex-col">
      <WorkspaceHeader
        project={project}
        scope="project"
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <div className="flex-1 min-h-0">
        <Dashboard
          scope={{ kind: 'project', projectId }}
          title={project.title}
          icon="folder_open"
          subtitle="Project dashboard"
          hideHeader
          cardFilter={cardFilter}
        />
      </div>
    </div>
  )
}
