import { useNodeStore } from '../../stores/nodes'
import Dashboard from '../dashboard/Dashboard'
import PlaceholderView from './PlaceholderView'

interface Props {
  projectId: string
}

// Per-project dashboard — same Dashboard component as Home, scoped to this project's subtree
// (descendant sub-projects + their tasks). Phase 6 will let the user customize the layout
// per project independently.
export default function ProjectDashboard({ projectId }: Props): JSX.Element {
  const project = useNodeStore((s) => s.nodes.find((n) => n.id === projectId)) ?? null

  if (!project) {
    return (
      <PlaceholderView
        icon="folder_off"
        title="Project not found"
        blurb="This project may have been deleted. Pick another from the sidebar."
      />
    )
  }

  return (
    <Dashboard
      scope={{ kind: 'project', projectId }}
      title={project.title}
      icon="folder_open"
      subtitle="Project dashboard"
    />
  )
}
