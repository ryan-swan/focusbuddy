import { useEffect, useMemo, useState } from 'react'
import type { FbNode, Widget } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import DeskMiniature from '../DeskMiniature'
import Icon from '../Icon'

interface Props {
  roomId: string
}

// RoomView — the intermediate navigation layer between home and a canvas.
// Clicking a Room in the sidebar brings you here: a card gallery of every
// Desk that lives inside that Room. Click a Desk card to open its canvas.
export default function RoomView({ roomId }: Props): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const nodesLoaded = useNodeStore((s) => s.loaded)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const goHome = useViewStore((s) => s.goHome)
  const [widgetsByDesk, setWidgetsByDesk] = useState<Record<string, Widget[]>>({})

  const room = useMemo(() => nodes.find((n) => n.id === roomId), [nodes, roomId])

  const desks = useMemo(
    () =>
      nodes
        .filter((n) => n.parentId === roomId && !n.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt),
    [nodes, roomId]
  )
  const deskIdsKey = desks.map((d) => d.id).join(',')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        desks.map(async (d) => {
          try {
            return [d.id, await window.api.widgets.listByTask(d.id)] as const
          } catch {
            return [d.id, [] as Widget[]] as const
          }
        })
      )
      if (!cancelled) setWidgetsByDesk(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskIdsKey])

  function openDesk(n: FbNode): void {
    setActive(n.id)
    if (n.kind === 'folder') goProject(n.id)
    else goTask(n.id)
  }

  function newDesk(): void {
    window.dispatchEvent(new CustomEvent('fb:command-new-task'))
  }

  if (!nodesLoaded) return <div className="h-full desk-paper" />

  if (!room) {
    return (
      <div className="h-full flex items-center justify-center desk-paper">
        <div className="text-center">
          <p className="text-[var(--ink-50)] text-sm">Room not found.</p>
          <button onClick={goHome} className="mt-2 text-[13px] text-accent hover:underline">
            Go home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto desk-paper" data-testid="room-view">
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        {/* Breadcrumb back to home */}
        <button
          onClick={goHome}
          className="inline-flex items-center gap-1 text-[12px] text-[var(--ink-50)] hover:text-[var(--ink-80)] mb-6 transition-colors"
        >
          <Icon name="home" size={14} />
          <Icon name="chevron_right" size={14} />
          <span className="font-medium text-[var(--ink-80)]">{room.title || 'Room'}</span>
        </button>

        <h1 className="text-2xl font-semibold text-[var(--ink-100)] mb-1">
          {room.title || 'Untitled Room'}
        </h1>
        <p className="text-[13px] text-[var(--ink-50)] mb-8">
          {desks.length === 0
            ? 'No desks yet — create one to get started.'
            : `${desks.length} desk${desks.length === 1 ? '' : 's'}`}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {desks.map((d) => {
            const ws = widgetsByDesk[d.id] ?? []
            const count = ws.filter(
              (w) => !w.archived && !w.pinned && w.parentSectionId === null && w.kind !== 'minimap'
            ).length
            return (
              <button
                key={d.id}
                onClick={() => openDesk(d)}
                data-testid={`room-desk-card-${d.id}`}
                className="group text-left rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] overflow-hidden hover:border-[rgb(var(--accent)/0.5)] hover:shadow-md transition-all duration-150"
              >
                {/* Thumbnail */}
                <div className="h-36 flex items-center justify-center overflow-hidden bg-[var(--surface-sunken)] border-b border-[var(--edge-soft)]">
                  {ws.length > 0 ? (
                    <DeskMiniature widgets={ws} width={320} height={144} silhouette />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-[var(--ink-30)]">
                      <Icon name="desk" size={22} />
                      <span className="text-[10px] uppercase tracking-widest">Empty</span>
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <Icon
                    name="grid_view"
                    size={15}
                    filled
                    className="text-[rgb(var(--accent)/0.7)] shrink-0"
                  />
                  <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-[var(--ink-100)]">
                    {d.title || 'Untitled desk'}
                  </span>
                  <span className="text-[11px] text-[var(--ink-40)] shrink-0 tabular-nums">
                    {count === 0 ? '—' : count}
                  </span>
                </div>
              </button>
            )
          })}

          <button
            onClick={newDesk}
            data-testid="room-desk-card-new"
            className="rounded-xl border border-dashed border-[var(--edge-firm)] flex flex-col items-center justify-center gap-2 min-h-[180px] text-[var(--ink-50)] hover:border-[rgb(var(--accent)/0.5)] hover:text-[rgb(var(--accent))] transition-all duration-150"
          >
            <Icon name="add" size={22} />
            <span className="text-[13px] font-medium">New desk</span>
          </button>
        </div>
      </div>
    </div>
  )
}
