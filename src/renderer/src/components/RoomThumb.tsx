import type { Widget } from '@shared/types'
import DeskMiniature from './DeskMiniature'
import Icon from './Icon'

// A Room's icon is a composite of its desks' miniatures — a 2x2 contact sheet of
// the room's first few desks, so a Room reads at a glance as "the place these
// desks live". Empty rooms fall back to a plain room glyph. This is the room
// counterpart to DeskMiniature (which draws a single desk's canvas).
interface Props {
  deskWidgetSets: Widget[][]
  width: number
  height: number
}

export default function RoomThumb({ deskWidgetSets, width, height }: Props): JSX.Element {
  const nonEmpty = deskWidgetSets.filter((ws) =>
    ws.some((w) => !w.archived && !w.pinned && w.parentSectionId === null && w.kind !== 'minimap')
  )

  if (nonEmpty.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[var(--ink-40)]">
        <Icon name="folder" size={Math.min(width, height) * 0.4} filled />
      </div>
    )
  }

  // One desk fills the frame; two or more tile as a 2x2 grid (up to four).
  const tiles = nonEmpty.slice(0, 4)
  if (tiles.length === 1) {
    return <DeskMiniature widgets={tiles[0]} width={width} height={height} padding={4} />
  }
  const gap = 2
  const cols = 2
  const rows = tiles.length > 2 ? 2 : 1
  const tw = (width - gap) / cols
  const th = (height - gap * (rows - 1)) / rows
  return (
    <div
      className="h-full w-full grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap
      }}
    >
      {tiles.map((ws, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-[3px] bg-[var(--surface-sunken)] ring-1 ring-[var(--edge-hairline)]"
        >
          <DeskMiniature widgets={ws} width={Math.max(1, tw)} height={Math.max(1, th)} padding={3} />
        </div>
      ))}
    </div>
  )
}
