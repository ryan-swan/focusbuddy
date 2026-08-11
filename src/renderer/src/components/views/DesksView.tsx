import { useMemo, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useOrgStore, PERSONAL_ORG_ID } from '../../stores/org'
import { useViewStore } from '../../stores/view'
import { useDeskWidgets, realWidgetCount } from '../../lib/useDeskWidgets'
import { formatRelativeTime } from '../../lib/changelog'
import DeskMiniature from '../DeskMiniature'
import Icon from '../Icon'
import SharedBadge from '../SharedBadge'
import { promptText } from '../plexi/PromptDialog'
import { shareToOrgOrGroup } from '../../lib/shareScope'
import ShareDialog from '../ShareDialog'
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
  const update = useNodeStore((s) => s.update)
  const moveToOrg = useNodeStore((s) => s.moveToOrg)
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  // Select the stable orgs array and derive with useMemo — filtering inside the
  // selector returns a fresh array every render, which Zustand treats as a change
  // and re-renders forever (React #185).
  const orgs = useOrgStore((s) => s.orgs)
  // Sharing a desk = moving it into a team org (optionally narrowed to a group).
  // Only offered from the Personal workspace (desks already in a team org are
  // shared), and only when the user belongs to a team org. useMemo over the stable
  // orgs array — a filtering selector returns a new array each render (React #185).
  const sharedOrgs = useMemo(() => orgs.filter((o) => !o.personal), [orgs])
  const canShare = activeOrgId === PERSONAL_ORG_ID && sharedOrgs.length > 0
  const goTask = useViewStore((s) => s.goTask)
  const goRooms = useViewStore((s) => s.goRooms)
  // Public share-link target (a desk shared as a 'task' snapshot). Opens the
  // universal ShareDialog; null when closed.
  const [linkTarget, setLinkTarget] = useState<{ id: string; title: string } | null>(null)

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
    // Mark a desk shared with you by name, so it's obviously not one of your own and
    // you can see who shared it. Only live-shared desks (sharedRootId set) get this.
    badge: (d) =>
      d.sharedRootId ? (
        <SharedBadge
          handle={d.sharedFromHandle ?? '?'}
          label={d.sharedFromHandle ? `Shared by ${d.sharedFromHandle}` : 'Shared with you'}
        />
      ) : null,
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
    actions: (d) => (
      <>
        {canShare ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void shareToOrgOrGroup({
                name: d.title || 'this desk',
                kindLabel: 'desk and its widgets',
                sharedOrgs,
                move: (org, team) => moveToOrg(d.id, org, team)
              })
            }}
            title="Share with your team or a group"
            className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
          >
            <Icon name="group_add" size={14} />
          </button>
        ) : null}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setLinkTarget({ id: d.id, title: d.title || 'this desk' })
          }}
          title="Create a public link — anyone with it can view this desk"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
        >
          <Icon name="link" size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            void (async () => {
              const next = await promptText({
                title: 'Rename desk',
                label: 'Desk name',
                initial: d.title || '',
                confirmLabel: 'Rename'
              })
              const trimmed = next?.trim()
              if (trimmed && trimmed !== (d.title || '')) await update(d.id, { title: trimmed })
            })()
          }}
          title="Rename desk"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--surface-raised)]/90 border border-[var(--edge-firm)] text-[var(--ink-60)] hover:text-[var(--ink-100)]"
        >
          <Icon name="edit" size={14} />
        </button>
      </>
    ),
    headerActions: roomId ? (
      <button
        onClick={() => goRooms()}
        className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-[var(--edge-firm)] text-[12px] text-[var(--ink-70)] hover:text-[var(--ink-100)]"
      >
        <Icon name="arrow_back" size={15} /> All rooms
      </button>
    ) : undefined
  }

  return (
    <>
      <RoomsDesksIndex config={config} />
      {linkTarget && (
        <ShareDialog
          kind="task"
          entityId={linkTarget.id}
          label={linkTarget.title}
          onClose={() => setLinkTarget(null)}
        />
      )}
    </>
  )
}
