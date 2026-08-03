import type { PaneCell, Pane, SplitState, Widget } from '@shared/types'
import { gridTemplate, type PreviewLayout } from '../../lib/splitGeometry'
import FocusPane from './FocusPane'
import DropWell from './DropWell'

interface Props {
  state: SplitState
  widgets: Widget[]
  onActivatePane: (paneId: string) => void
  onClosePane: (paneId: string) => void
  onOpenWidget: (widgetId: string) => void
  // ── Make-room preview (ported from split-mock.html) ────────────────────────
  // When `preview` is provided (a drag is in progress inside the body and a well
  // exists) the grid renders the NEXT shape: existing panes remapped onto the
  // next shape's cells + empty DropWells in the freed cells. When absent, it's
  // the committed layout (`state`). Either way the grid's track sizes are set
  // DECLARATIVELY from gridTemplate() and a CSS transition (.fb-split-cluster)
  // springs them between layouts — the whole make-room animation, exactly like
  // the mock's `render(wellSide)` + `.cluster { transition: grid-template-* }`.
  // No JS writes tracks per frame (the old reflow-MotionValue approach desynced
  // from React on commit and stranded the 3rd/4th pane).
  preview?: PreviewLayout | null
  hoveredCell?: PaneCell | null
}

// Renders the tiled pane grid, faithful to split-mock.html. In committed mode it
// lays out `state`. In preview mode (during a make-room drag) it lays out the
// previewed next-shape (existing panes remapped + translucent DropWells in the
// freed cells). The grid's tracks are declarative; CSS springs them between the
// two — the existing content physically shrinks into its destination cell while
// a well grows in the freed cell. Panes are keyed by their stable id, so moving a
// pane between shapes moves its grid-area (never remounts it) — a live webview
// keeps its page/session, a doc keeps its editor state.
export default function SplitGrid({
  state,
  widgets,
  onActivatePane,
  onClosePane,
  onOpenWidget,
  preview,
  hoveredCell
}: Props): JSX.Element {
  const previewing = !!preview && preview.wells.length > 0
  // The shape actually rendered: the preview's next-shape while dragging, else
  // the committed shape. Tracks come from gridTemplate() for that shape — the
  // CSS transition on .fb-split-cluster animates from the previous render's
  // tracks to these, springing the room open (or closed on cancel/commit).
  const shape = previewing ? preview!.shape : state.shape
  const tpl = gridTemplate(shape, state.ratios)
  // Panes to render: the remapped preview panes while dragging, else committed.
  // Wells only exist in preview.
  const panes: Pane[] = previewing ? preview!.panes : state.panes
  const wells: PaneCell[] = previewing ? preview!.wells : []
  const showChrome = panes.length + wells.length > 1

  return (
    <div
      data-testid="focus-split-grid"
      data-shape={shape}
      data-previewing={previewing ? 'true' : 'false'}
      // Mission-Control feel: an even gap keeps a clean frame between tiles while
      // each pane fills its own tile. gap ≈ clamp(14–22px) — airy, not congested.
      // .fb-split-cluster carries the grid-template-* spring transition (mock).
      className="fb-split-cluster w-full h-full grid"
      style={{
        gap: 'clamp(14px, 1.6vw, 22px)',
        gridTemplateColumns: tpl.columns,
        gridTemplateRows: tpl.rows,
        gridTemplateAreas: tpl.areas
      }}
    >
      {panes.map((pane) => (
        // Cell wrapper fills its grid area (h-full + flex) so the pane fills the
        // tile edge-to-edge — no void. The grid `gap` keeps the frame between
        // tiles. Keyed by pane.id (stable across shape changes) so the pane node
        // — and any live <webview> inside it — is MOVED, never remounted.
        <div
          key={pane.id}
          data-split-cell={pane.cell}
          className="flex h-full min-w-0 min-h-0"
          style={{ gridArea: tpl.cellArea[pane.cell] }}
        >
          <FocusPane
            pane={pane}
            widgets={widgets}
            isActive={pane.id === state.activePaneId}
            showChrome={showChrome}
            onActivate={onActivatePane}
            onClose={onClosePane}
            onOpenWidget={onOpenWidget}
          />
        </div>
      ))}
      {wells.map((cell) => (
        <div
          key={`well-${cell}`}
          data-split-cell={cell}
          data-testid={`focus-dropwell-${cell}`}
          className="flex h-full min-w-0 min-h-0"
          style={{ gridArea: tpl.cellArea[cell] }}
        >
          <DropWell
            hovered={hoveredCell === cell}
            // A glyph only when there's a genuine cell CHOICE (3+ target shapes);
            // the lone 1→2 well stays label-free.
            showGlyph={wells.length + panes.length >= 3}
          />
        </div>
      ))}
    </div>
  )
}
