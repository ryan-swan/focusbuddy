import PlaceholderView from './PlaceholderView'
import { useViewStore } from '../../stores/view'

// Agents — a future home that lists the desk agents you have placed across your
// workspace. Desk agents today live as agent widgets on individual task
// canvases, and there is no cross-canvas index to read them from yet. Rather
// than invent a list of agents that do not exist, this is an honest placeholder
// until a real workspace-wide agent index lands. The CTA points to your desk,
// where agents are actually created and run.
export default function AgentsView(): JSX.Element {
  const goHome = useViewStore((s) => s.goHome)
  return (
    <PlaceholderView
      icon="smart_toy"
      title="Agents"
      blurb="Desk agents are standing AI workers you place on a desk and wire your widgets into. A single place to see every agent across your workspace is on the way. For now, open a desk to add and run one."
      cta={{ label: 'Open my desk', onClick: () => goHome() }}
    />
  )
}
