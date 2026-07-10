import { useMemo } from 'react'
import type { FbNode, Widget } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useMessagingStore } from '../../stores/messaging'
import { useDeskWidgets } from '../../lib/useDeskWidgets'
import { formatRelativeTime } from '../../lib/changelog'
import RoomThumb from '../RoomThumb'
import Icon from '../Icon'
import { promptText } from '../plexi/PromptDialog'
import RoomsDesksIndex, { type IndexConfig } from './RoomsDesksIndex'

// The All Rooms index. A Room is a folder node — a place desks live. Clicking a
// room opens its scoped Desks index (the "expand to show my desks" gesture). A
// Room that is also a Plan (is_plan) is badged, but still shows here as a room.

function rel(ms: number): string {
  return formatRelativeTime(new Date(ms).toISOString())
}

export default function RoomsView(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const move = useNodeStore((s) => s.move)
  const create = useNodeStore((s) => s.create)
  const update = useNodeStore((s) => s.update)
  const goDesks = useViewStore((s) => s.goDesks)
  const openObjectChannel = useMessagingStore((s) => s.openObjectChannel)

  const rooms = useMemo(
    () => nodes.filter((n) => n.kind === 'folder' && !n.archived),
    [nodes]
  )
  const roomTitleById = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rooms) m.set(r.id, r.title || 'Untitled room')
    return m
  }, [rooms])

  // Direct child desks per room (for the thumbnail composite + counts). Sub-rooms
  // are counted separately.
  const childDesksByRoom = useMemo(() => {
    const m = new Map<string, FbNode[]>()
    for (const n of nodes) {
      if (n.kind === 'task' && !n.archived && n.parentId) {
        const arr = m.get(n.parentId) ?? []
        arr.push(n)
        m.set(n.parentId, arr)
      }
    }
    return m
  }, [nodes])

  const subRoomCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of nodes) {
      if (n.kind === 'folder' && !n.archived && n.parentId) {
        m.set(n.parentId, (m.get(n.parentId) ?? 0) + 1)
      }
    }
    return m
  }, [nodes])

  // Load widgets for the first few desks of every room so the composite icon has
  // real content to draw. Cap per room to keep the fetch bounded.
  const previewDeskIds = useMemo(() => {
    const ids: string[] = []
    for (const r of rooms) {
      const desks = childDesksByRoom.get(r.id) ?? []
      for (const d of desks.slice(0, 4)) ids.push(d.id)
    }
    return ids
  }, [rooms, childDesksByRoom])
  const widgetsByDesk = useDeskWidgets(previewDeskIds)

  function roomDeskSets(r: FbNode): Widget[][] {
    const desks = (childDesksByRoom.get(r.id) ?? []).slice(0, 4)
    return desks.map((d) => widgetsByDesk[d.id] ?? [])
  }

  const config: IndexConfig<FbNode> = {
    storageKey: 'rooms-index',
    title: 'All rooms',
    subtitle: 'Rooms are where your desks live. Open a room to see the desks inside it.',
    items: rooms,
    idOf: (r) => r.id,
    titleOf: (r) => r.title || 'Untitled room',
    searchText: (r) => `${r.title} ${r.description}`,
    thumb: (r) => <RoomThumb deskWidgetSets={roomDeskSets(r)} width={320} height={144} />,
    smallIcon: (r) => (
      <div className="h-full w-full">
        <RoomThumb deskWidgetSets={roomDeskSets(r)} width={32} height={32} />
      </div>
    ),
    metaLine: (r) => {
      const desks = childDesksByRoom.get(r.id)?.length ?? 0
      const subs = subRoomCount.get(r.id) ?? 0
      const parts = [
        `${desks} ${desks === 1 ? 'desk' : 'desks'}`,
        subs ? `${subs} sub-${subs === 1 ? 'room' : 'rooms'}` : null,
        r.isPlan ? 'Plan' : null
      ].filter(Boolean)
      return parts.join(' · ')
    },
    columns: [
      {
        key: 'desks',
        label: 'Desks',
        align: 'right',
        render: (r) => childDesksByRoom.get(r.id)?.length ?? 0
      },
      {
        key: 'subrooms',
        label: 'Sub-rooms',
        align: 'right',
        render: (r) => subRoomCount.get(r.id) ?? 0
      },
      { key: 'type', label: 'Type', render: (r) => (r.isPlan ? 'Plan' : 'Room') },
      {
        key: 'parent',
        label: 'In room',
        render: (r) => (r.parentId ? roomTitleById.get(r.parentId) ?? '—' : 'Top level')
      },
      { key: 'updated', label: 'Updated', align: 'right', render: (r) => rel(r.updatedAt) }
    ],
    groups: [
      {
        key: 'type',
        label: 'Type',
        groupOf: (r) => ({
          id: r.isPlan ? 'plan' : 'room',
          label: r.isPlan ? 'Plans' : 'Rooms',
          order: r.isPlan ? 1 : 0
        })
      },
      {
        key: 'parent',
        label: 'Parent room',
        groupOf: (r) => ({
          id: r.parentId ?? 'top',
          label: r.parentId ? roomTitleById.get(r.parentId) ?? 'Unknown room' : 'Top level',
          order: r.parentId ? 1 : 0
        })
      }
    ],
    filters: [
      { key: 'rooms', label: 'Rooms only', predicate: (r) => !r.isPlan },
      { key: 'plans', label: 'Plans only', predicate: (r) => r.isPlan },
      { key: 'top', label: 'Top level', predicate: (r) => r.parentId == null }
    ],
    timelineDate: (r) => r.createdAt,
    onOpen: (r) => goDesks(r.id),
    newLabel: 'New room',
    onNew: () => {
      void (async () => {
        try {
          const node = await create({ parentId: null, kind: 'folder', title: 'New room' })
          goDesks(node.id)
        } catch {
          /* create() surfaces its own limit prompt */
        }
      })()
    },
    onReorder: (ids) => {
      void (async () => {
        for (const id of ids) {
          const node = rooms.find((r) => r.id === id)
          if (node) await move(id, node.parentId, null)
        }
      })()
    },
    actions: (r) => (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            void openObjectChannel('room', r.id, r.title || 'Room')
          }}
          title="Chat about this room"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
        >
          <Icon name="forum" size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            void (async () => {
              const next = await promptText({
                title: 'Rename room',
                label: 'Room name',
                initial: r.title || '',
                confirmLabel: 'Rename'
              })
              const trimmed = next?.trim()
              if (trimmed && trimmed !== (r.title || '')) await update(r.id, { title: trimmed })
            })()
          }}
          title="Rename room"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
        >
          <Icon name="edit" size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            void update(r.id, { isPlan: !r.isPlan })
          }}
          title={r.isPlan ? 'Make this a plain room (removes it from Plans)' : 'Make this a plan (adds it to the Plans timeline)'}
          className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
        >
          <Icon name={r.isPlan ? 'layers_clear' : 'account_tree'} size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            goDesks(r.id)
          }}
          title="Open this room's desks"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
        >
          <Icon name="chevron_right" size={15} />
        </button>
      </div>
    )
  }

  return <RoomsDesksIndex config={config} />
}
