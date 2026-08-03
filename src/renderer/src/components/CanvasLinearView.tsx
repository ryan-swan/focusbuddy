import type { Widget } from '@shared/types'

// Screen-reader linear representation of the spatial Canvas (PLX-A11Y-003). The
// canvas is a 2D plane a screen reader cannot traverse spatially, so this renders an
// equivalent non-spatial, ordered, keyboard-navigable list of the desk's objects in
// a visually-hidden landmark. Each entry is a real focusable control that opens the
// object, so a screen-reader or keyboard-only user reaches every object without the
// spatial canvas. It is sr-only (no visual footprint) but fully in the a11y tree.

interface Props {
  widgets: Widget[]
  onOpen: (id: string) => void
  deskTitle: string | null
}

// A human label for an object: its title, else a readable form of its kind.
function objectLabel(w: Widget): string {
  if (w.title && w.title.trim()) return w.title.trim()
  return w.kind.replace(/[-_]/g, ' ')
}

export default function CanvasLinearView({ widgets, onOpen, deskTitle }: Props): JSX.Element {
  const visible = widgets.filter((w) => !w.archived)
  return (
    <nav className="sr-only" aria-label={`Desk contents${deskTitle ? `: ${deskTitle}` : ''}, list view`} data-testid="canvas-linear-view">
      <h2>Objects on this desk ({visible.length})</h2>
      {visible.length === 0 ? (
        <p>This desk has no objects yet.</p>
      ) : (
        <ol>
          {visible.map((w) => (
            <li key={w.id}>
              <button type="button" onClick={() => onOpen(w.id)} data-linear-object={w.id}>
                {objectLabel(w)} ({w.kind.replace(/[-_]/g, ' ')})
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  )
}
