import { useEffect, useMemo, useRef, useState } from 'react'
import type { FbNode, Widget } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useFreeDesk } from '../../hooks/useFreeDesk'
import DeskMiniature from '../DeskMiniature'
import Icon from '../Icon'

export default function AllRoomsView(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goRoom = useViewStore((s) => s.goRoom)
  const goTask = useViewStore((s) => s.goTask)
  const { createFreeDesk, assignToRoom } = useFreeDesk()

  // Drag-and-drop: free desk → room card
  const draggingDeskIdRef = useRef<string | null>(null)
  const [roomDropTarget, setRoomDropTarget] = useState<string | null>(null)

  // "Add to room" dropdown state for a specific free desk
  const [roomPickerForDesk, setRoomPickerForDesk] = useState<string | null>(null)

  // Top-level folders = rooms
  const rooms = useMemo(
    () => nodes.filter((n) => !n.archived && n.kind === 'folder' && n.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt),
    [nodes]
  )

  // Free desks = standalone task nodes with no parent
  const freeDesks = useMemo(
    () => nodes.filter((n) => !n.archived && n.kind === 'task' && n.parentId === null)
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
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-semibold text-[var(--ink-100)] tracking-tight">Rooms</h1>
            <p className="text-[13px] text-[var(--ink-50)] mt-0.5">Your workspace rooms — each contains a collection of desks</p>
          </div>
          <button
            onClick={() => void createFreeDesk()}
            data-testid="rooms-new-free-desk"
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-[13px] font-medium border border-dashed border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-60)] hover:border-[rgb(var(--accent))]/50 hover:text-[rgb(var(--accent))] transition-colors"
          >
            <Icon name="note_add" size={15} />
            New Free Desk
          </button>
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
              const isRoomDropTarget = roomDropTarget === room.id

              return (
                <button
                  key={room.id}
                  onClick={() => openRoom(room)}
                  onDragOver={(e) => {
                    if (!draggingDeskIdRef.current) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setRoomDropTarget(room.id)
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null
                    if (related && (e.currentTarget as HTMLElement).contains(related)) return
                    setRoomDropTarget((prev) => (prev === room.id ? null : prev))
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const deskId = draggingDeskIdRef.current
                    draggingDeskIdRef.current = null
                    setRoomDropTarget(null)
                    if (deskId) void assignToRoom(deskId, room.id)
                  }}
                  className={[
                    'group text-left rounded-2xl overflow-hidden bg-[var(--surface-raised)] shadow-sm ring-1 transition-all duration-200',
                    isRoomDropTarget
                      ? 'ring-[rgb(var(--accent))] shadow-md scale-[1.02] bg-[rgb(var(--accent)/0.04)]'
                      : 'ring-black/[0.06] dark:ring-white/[0.06] hover:shadow-md hover:ring-[rgb(var(--accent)/0.4)]'
                  ].join(' ')}
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
                    {/* Drop indicator overlay */}
                    {isRoomDropTarget && (
                      <div className="absolute inset-0 bg-[rgb(var(--accent)/0.08)] border-2 border-[rgb(var(--accent))] rounded-2xl pointer-events-none flex items-center justify-center">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[rgb(var(--accent))] text-white text-[11px] font-semibold shadow">
                          <Icon name="move_to_inbox" size={12} />
                          Move here
                        </div>
                      </div>
                    )}
                    {/* Hover accent overlay */}
                    {!isRoomDropTarget && (
                      <div className="absolute inset-0 bg-[rgb(var(--accent)/0)] group-hover:bg-[rgb(var(--accent)/0.04)] transition-colors pointer-events-none" />
                    )}
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

        {/* ── FREE DESKS SECTION ───────────────────────────────────── */}
        {freeDesks.length > 0 && (
          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--ink-100)] tracking-tight">Free Desks</h2>
                <p className="text-[12px] text-[var(--ink-40)] mt-0.5">Not assigned to any room — drag onto a room above or use "Add to room"</p>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {freeDesks.map((desk) => {
                const isDragging = draggingDeskIdRef.current === desk.id
                const isPickerOpen = roomPickerForDesk === desk.id
                return (
                  <div
                    key={desk.id}
                    draggable
                    onDragStart={(e) => {
                      draggingDeskIdRef.current = desk.id
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', desk.id)
                    }}
                    onDragEnd={() => {
                      draggingDeskIdRef.current = null
                      setRoomDropTarget(null)
                    }}
                    style={{ opacity: isDragging ? 0.4 : 1, transition: 'opacity 80ms' }}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--surface-raised)] ring-1 ring-black/[0.05] dark:ring-white/[0.05] hover:ring-[rgb(var(--accent)/0.3)] transition-all cursor-grab active:cursor-grabbing"
                  >
                    <Icon name="sticky_note_2" size={16} className="text-[var(--ink-40)] shrink-0" />
                    <button
                      onClick={() => {
                        setActive(desk.id)
                        goTask(desk.id)
                      }}
                      className="flex-1 text-left text-[13px] font-medium text-[var(--ink-90)] hover:text-[var(--ink-100)] truncate"
                    >
                      {desk.title || 'Untitled'}
                    </button>
                    {/* Add to room button */}
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRoomPickerForDesk(isPickerOpen ? null : desk.id)
                        }}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] font-medium text-[var(--ink-50)] hover:text-[rgb(var(--accent))] hover:bg-[var(--surface-sunken)] transition-colors opacity-0 group-hover:opacity-100"
                        title="Add to a room"
                      >
                        <Icon name="move_to_inbox" size={13} />
                        Add to room
                      </button>
                      {/* Room picker dropdown */}
                      {isPickerOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-[49]"
                            onClick={() => setRoomPickerForDesk(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-[190px] max-h-[240px] rounded-xl overflow-hidden bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-[0_8px_32px_rgba(0,0,0,0.22)] z-[50] flex flex-col">
                            <div className="px-3 pt-2 pb-1">
                              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-40)] font-semibold">Move to room</span>
                            </div>
                            <div className="flex-1 overflow-auto">
                              {rooms.length === 0 ? (
                                <div className="px-3 py-2 text-[12px] text-[var(--ink-50)]">No rooms yet</div>
                              ) : (
                                rooms.map((room) => (
                                  <button
                                    key={room.id}
                                    onClick={() => {
                                      void assignToRoom(desk.id, room.id)
                                      setRoomPickerForDesk(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--ink-80)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-100)] transition-colors text-left"
                                  >
                                    <Icon name="workspaces" size={13} className="text-[var(--ink-40)] shrink-0" />
                                    <span className="truncate">{room.title || 'Untitled Room'}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
