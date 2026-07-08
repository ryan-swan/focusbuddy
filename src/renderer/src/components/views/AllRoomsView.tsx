import { useEffect, useMemo, useState } from 'react'
import type { FbNode, Widget } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import DeskMiniature from '../DeskMiniature'
import Icon from '../Icon'

export default function AllRoomsView(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goRoom = useViewStore((s) => s.goRoom)

  // Top-level folders = rooms
  const rooms = useMemo(
    () => nodes.filter((n) => !n.archived && n.kind === 'folder' && n.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt),
    [nodes]
  )

  // Load widgets for each room's desks for thumbnail previews
  const [widgetsByRoom, setWidgetsByRoom] = useState<Record<string, Widget[]>>({})
  const roomIdsKey = rooms.map((r) => r.id).join(',')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        rooms.map(async (r) => {
          // get child desks of this room
          const desks = nodes.filter((n) => n.parentId === r.id && !n.archived)
          const allWidgets: Widget[] = []
          for (const d of desks.slice(0, 4)) {
            try {
              const ws = await window.api.widgets.listByTask(d.id)
              allWidgets.push(...ws)
            } catch { /* ignore */ }
          }
          return [r.id, allWidgets] as const
        })
      )
      if (!cancelled) setWidgetsByRoom(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdsKey])

  function openRoom(room: FbNode): void {
    setActive(null)
    goRoom(room.id)
  }

  return (
    <div className="h-full overflow-auto bg-[var(--surface-base)]">
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold text-[var(--ink-100)] tracking-tight">Rooms</h1>
          <p className="text-[13px] text-[var(--ink-50)] mt-0.5">Your workspace rooms — each contains a collection of desks</p>
        </div>

        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Icon name="workspaces" size={40} className="text-[var(--ink-20)] mb-4" />
            <p className="text-[14px] text-[var(--ink-50)]">No rooms yet</p>
            <p className="text-[12px] text-[var(--ink-30)] mt-1">Create a room from the sidebar to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {rooms.map((room) => {
              const deskCount = nodes.filter((n) => n.parentId === room.id && !n.archived).length
              const widgets = widgetsByRoom[room.id] ?? []
              const hasContent = widgets.filter((w) => !w.archived).length > 0

              return (
                <button
                  key={room.id}
                  onClick={() => openRoom(room)}
                  className="group text-left rounded-2xl overflow-hidden bg-[var(--surface-raised)] shadow-sm hover:shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.06] hover:ring-[rgb(var(--accent)/0.4)] transition-all duration-200"
                >
                  {/* Thumbnail */}
                  <div className="h-[120px] bg-[var(--surface-sunken)] flex items-center justify-center overflow-hidden relative">
                    {hasContent ? (
                      <DeskMiniature widgets={widgets} width={220} height={120} silhouette />
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Icon name="workspaces" size={28} className="text-[var(--ink-20)]" />
                        <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--ink-30)] font-medium">
                          Empty room
                        </span>
                      </div>
                    )}
                    {/* Hover accent overlay */}
                    <div className="absolute inset-0 bg-[rgb(var(--accent)/0)] group-hover:bg-[rgb(var(--accent)/0.04)] transition-colors pointer-events-none" />
                  </div>

                  {/* Caption */}
                  <div className="px-3 py-2.5 bg-[var(--surface-raised)]">
                    <div className="text-[13px] font-semibold text-[var(--ink-100)] truncate group-hover:text-[rgb(var(--accent))] transition-colors">
                      {room.title || 'Untitled Room'}
                    </div>
                    <div className="text-[11px] text-[var(--ink-40)] mt-0.5">
                      {deskCount === 0 ? 'No desks' : `${deskCount} desk${deskCount === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
