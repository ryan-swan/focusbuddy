import { useMemo } from 'react'
import type { FbNode } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useDeskWidgets, realWidgetCount } from '../../lib/useDeskWidgets'
import { formatRelativeTime } from '../../lib/changelog'
import DeskMiniature from '../DeskMiniature'
import Icon from '../Icon'
import RoomsDesksIndex, { type IndexConfig } from './RoomsDesksIndex'

// The All Desks index. A Desk is a task node (a canvas). Optionally scoped to a
// single Room via roomId, in which case only that room's descendant desks show.

const STATUS_LABEL: Record<FbNode['status'], string> = {
  open: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  parked: 'Parked'
}
const STATUS_ORDER: Record<FbNode['status'], number> = {
  open: 0,
  in_progress: 1,
  parked: 2,
  done: 3
}

function rel(ms: number): string {
  return formatRelativeTime(new Date(ms).toISOString())
}

export default function DesksView({ roomId }: { roomId?: string }): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const move = useNodeStore((s) => s.move)
  const setActive = useNodeStore((s) => s.setActive)
  const create = useNodeStore((s) => s.create)
  const goTask = useViewStore((s) => s.goTask)
  const goRooms = useViewStore((s) => s.goRooms)

  const roomTitleById = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of nodes) if (n.kind === 'folder') m.set(n.id, n.title || 'Untitled room')
    return m
  }, [nodes])

  // The set of room ids in-scope: the room itself plus every descendant folder,
  // so a desk nested in a sub-room of the scoped room still counts.
  const scopeRoomIds = useMemo(() => {
    if (!roomId) return null
    const set = new Set<string>([roomId])
    let grew = true
    while (grew) {
      grew = false
      for (const n of nodes) {
        if (n.kind === 'folder' && n.parentId && set.has(n.parentId) && !set.has(n.id)) {
          set.add(n.id)
          grew = true
        }
      }
    }
    return set
  }, [nodes, roomId])

  const desks = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.kind === 'task' &&
          !n.archived &&
          (!scopeRoomIds || (n.parentId != null && scopeRoomIds.has(n.parentId)))
      ),
    [nodes, scopeRoomIds]
  )

  const widgetsByDesk = useDeskWidgets(useMemo(() => desks.map((d) => d.id), [desks]))

  function deskThumb(d: FbNode, w: number, h: number): JSX.Element {
    const ws = widgetsByDesk[d.id]
    if (!ws) {
      return <Icon name="task_alt" size={Math.min(w, h) * 0.4} className="text-[var(--ink-30)]" />
    }
    return <DeskMiniature widgets={ws} width={w} height={h} />
  }

  const scopeTitle = roomId ? roomTitleById.get(roomId) : null

  const config: IndexConfig<FbNode> = {
    storageKey: 'desks-index',
    title: scopeTitle ? `Desks in ${scopeTitle}` : 'All desks',
    subtitle: scopeTitle
      ? 'Every canvas that lives in this room. Open one to bring its notes, files and tools to the surface.'
      : 'Every canvas across your rooms. Open one to bring its notes, files and tools to the surface.',
    items: desks,
    idOf: (d) => d.id,
    titleOf: (d) => d.title || 'Untitled desk',
    searchText: (d) => `${d.title} ${d.description}`,
    thumb: (d) => (
      <div className="h-full w-full flex items-center justify-center">{deskThumb(d, 320, 144)}</div>
    ),
    smallIcon: (d) => <div className="h-full w-full">{deskThumb(d, 32, 32)}</div>,
    metaLine: (d) => {
      const room = d.parentId ? roomTitleById.get(d.parentId) : null
      const count = widgetsByDesk[d.id] ? realWidgetCount(widgetsByDesk[d.id]) : null
      return [room, STATUS_LABEL[d.status], count == null ? null : count === 0 ? 'empty' : `${count} items`]
        .filter(Boolean)
        .join(' · ')
    },
    columns: [
      {
        key: 'room',
        label: 'Room',
        render: (d) => (d.parentId ? roomTitleById.get(d.parentId) ?? '—' : 'Top level')
      },
      { key: 'status', label: 'Status', render: (d) => STATUS_LABEL[d.status] },
      {
        key: 'items',
        label: 'Items',
        align: 'right',
        render: (d) => (widgetsByDesk[d.id] ? realWidgetCount(widgetsByDesk[d.id]) : '—')
      },
      { key: 'updated', label: 'Updated', align: 'right', render: (d) => rel(d.updatedAt) }
    ],
    groups: [
      {
        key: 'status',
        label: 'Status',
        groupOf: (d) => ({
          id: d.status,
          label: STATUS_LABEL[d.status],
          order: STATUS_ORDER[d.status]
        })
      },
      {
        key: 'room',
        label: 'Room',
        groupOf: (d) => ({
          id: d.parentId ?? 'top',
          label: d.parentId ? roomTitleById.get(d.parentId) ?? 'Unknown room' : 'Top level',
          order: 0
        })
      }
    ],
    filters: (['open', 'in_progress', 'done', 'parked'] as FbNode['status'][]).map((s) => ({
      key: s,
      label: STATUS_LABEL[s],
      predicate: (d) => d.status === s
    })),
    timelineDate: (d) => d.updatedAt,
    onOpen: (d) => {
      setActive(d.id)
      goTask(d.id)
    },
    newLabel: 'New desk',
    onNew: () => {
      void (async () => {
        try {
          const node = await create({ parentId: roomId ?? null, kind: 'task', title: 'New desk' })
          setActive(node.id)
          goTask(node.id)
        } catch {
          /* create() surfaces its own limit prompt */
        }
      })()
    },
    onReorder: (ids) => {
      // Persist the new order by re-appending each desk to the end of its parent
      // in the chosen sequence; done in order, the final sortOrder matches ids.
      void (async () => {
        for (const id of ids) {
          const node = desks.find((d) => d.id === id)
          if (node) await move(id, node.parentId, null)
        }
      })()
    },
    headerActions: roomId ? (
      <button
        onClick={() => goRooms()}
        className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-[var(--edge-firm)] text-[12px] text-[var(--ink-70)] hover:text-[var(--ink-100)]"
      >
        <Icon name="arrow_back" size={15} /> All rooms
      </button>
    ) : undefined
  }

  return <RoomsDesksIndex config={config} />
}
