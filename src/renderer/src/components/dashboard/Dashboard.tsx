import { useEffect, useMemo, useState } from 'react'
import type { DashboardCardKind } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import {
  DEFAULT_LAYOUT,
  useDashboardLayoutStore
} from '../../stores/dashboardLayouts'
import { taskIdsInScope, type DashboardScope } from '../../lib/dashboardScope'
import StatsCard from './StatsCard'
import QuickStartCard from './QuickStartCard'
import TodayTasksCard from './TodayTasksCard'
import RecentActivityCard from './RecentActivityCard'
import FoldersCard from './FoldersCard'
import WorkspaceProgressCard from './WorkspaceProgressCard'
import WorkspaceHealthCard from './WorkspaceHealthCard'
import FocusSessionCard from './FocusSessionCard'
import AIAssistantCard from './AIAssistantCard'
import RecentNotesCard from './RecentNotesCard'
import Icon from '../Icon'

interface Props {
  scope: DashboardScope
  title: string
  icon: string
  subtitle?: string
  // When true, the Dashboard skips rendering its own header bar — useful
  // when a parent view (e.g. ProjectDashboard) renders its own workspace
  // header above us.
  hideHeader?: boolean
  // When set, only render cards whose kind is in this set. Used by the
  // WorkspaceHeader tabs (Tasks / Notes / Files / Activity) to filter the
  // dashboard down to a relevant subset. null = no filter (default).
  cardFilter?: Set<DashboardCardKind> | null
}

// 'garden' and 'energy' deprecated from the UI — see POSITIONING.md §11.5 (dopamine
// reframe). DB + types retained for forward-compat; just not surfaced in the palette.
const CARD_META: Record<
  Exclude<DashboardCardKind, 'garden' | 'energy'>,
  { label: string; icon: string; description: string }
> = {
  'quick-start': {
    label: 'Quick Start',
    icon: 'bolt',
    description: 'One-tap 5-min on the highest-priority task in scope'
  },
  stats: {
    label: 'Today',
    icon: 'today',
    description: 'Sessions, focused minutes, and tasks done today'
  },
  'today-tasks': {
    label: 'Open Tasks',
    icon: 'checklist',
    description: 'Open tasks in scope — overdue, today, upcoming'
  },
  'recent-activity': {
    label: 'Recent Activity',
    icon: 'history',
    description: 'Last 24h of widget adds, browses, sessions, chats'
  },
  folders: {
    label: 'Folders',
    icon: 'folder_open',
    description: 'Active / Closed / Archived folders — quick navigate, archive, restore'
  },
  'workspace-progress': {
    label: 'This Week',
    icon: 'trending_up',
    description: 'Completion ring + weekly delta + focus minutes — momentum at a glance'
  },
  'workspace-health': {
    label: 'Workspace Health',
    icon: 'health_and_safety',
    description: 'Local heuristics + optional AI analysis — surfaces stale folders, overdue tasks, momentum signals'
  },
  'focus-session': {
    label: 'Focus Session',
    icon: 'hourglass_empty',
    description: 'Big 25:00 timer with one-tap start — runs the existing focus session engine'
  },
  'ai-assistant': {
    label: 'AI Assistant',
    icon: 'auto_awesome',
    description: 'Quick-ask card with one-tap suggestions and free-form chat — uses your Anthropic key'
  },
  'recent-notes': {
    label: 'Recent Notes',
    icon: 'sticky_note_2',
    description: 'Last six edited sticky / note / page widgets across the workspace'
  }
}

// Build a stable key for the dashboard's layout — 'home' for global, project id otherwise
function dashboardKeyOf(scope: DashboardScope): string {
  return scope.kind === 'global' ? 'home' : scope.projectId
}

export default function Dashboard({
  scope,
  title,
  icon,
  subtitle,
  hideHeader,
  cardFilter
}: Props): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const taskIds = useMemo(() => taskIdsInScope(nodes, scope), [nodes, scope])

  const dashboardKey = dashboardKeyOf(scope)
  const loadLayout = useDashboardLayoutStore((s) => s.load)
  const setLayout = useDashboardLayoutStore((s) => s.set)
  const resetLayout = useDashboardLayoutStore((s) => s.reset)
  const layoutFromStore = useDashboardLayoutStore((s) => s.layouts[dashboardKey])

  useEffect(() => {
    void loadLayout(dashboardKey)
  }, [dashboardKey, loadLayout])

  const cardIdsRaw =
    layoutFromStore && layoutFromStore.length > 0 ? layoutFromStore : DEFAULT_LAYOUT
  // Filter out deprecated kinds so saved layouts containing 'garden' don't crash
  const cardIdsAll = cardIdsRaw.filter(
    (c): c is Exclude<DashboardCardKind, 'garden' | 'energy'> =>
      c !== 'garden' && c !== 'energy'
  )
  // Apply tab-driven filter from the parent (Workspace Header tabs).
  const cardIds = cardFilter
    ? cardIdsAll.filter((c) => cardFilter.has(c))
    : cardIdsAll

  // Garden was deprecated — exclude it everywhere
  type ActiveCard = Exclude<DashboardCardKind, 'garden' | 'energy'>

  const [editing, setEditing] = useState(false)
  const [dragId, setDragId] = useState<ActiveCard | null>(null)
  const [dropBefore, setDropBefore] = useState<ActiveCard | null>(null)

  const hidden: ActiveCard[] = (
    Object.keys(CARD_META) as ActiveCard[]
  ).filter((k) => !cardIds.includes(k))

  function moveCard(dragged: ActiveCard, before: ActiveCard | null): void {
    const without = cardIds.filter((c) => c !== dragged)
    if (before === null) {
      void setLayout(dashboardKey, [...without, dragged])
    } else {
      const idx = without.indexOf(before)
      const safeIdx = idx >= 0 ? idx : without.length
      void setLayout(dashboardKey, [
        ...without.slice(0, safeIdx),
        dragged,
        ...without.slice(safeIdx)
      ])
    }
  }

  function addCard(card: ActiveCard): void {
    if (cardIds.includes(card)) return
    void setLayout(dashboardKey, [...cardIds, card])
  }

  function removeCard(card: ActiveCard): void {
    void setLayout(dashboardKey, cardIds.filter((c) => c !== card))
  }

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div className="h-full overflow-auto desk-paper no-tod">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* Header — suppressed when the parent view renders its own */}
        {!hideHeader && (
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 shadow-sm shrink-0">
            <Icon name={icon} size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100 truncate">
              {title}
            </h1>
            <p className="text-[12px] text-stone-500 dark:text-stone-400 truncate">
              {subtitle ?? todayLabel}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editing && (
              <button
                onClick={() => {
                  if (confirm('Reset this dashboard to the default layout?')) {
                    void resetLayout(dashboardKey)
                    setEditing(false)
                  }
                }}
                className="btn-ghost"
                title="Restore default layout"
              >
                <Icon name="restart_alt" size={14} />
                <span>Reset</span>
              </button>
            )}
            <button
              onClick={() => setEditing((v) => !v)}
              className={`btn-ghost ${editing ? '!text-accent' : ''}`}
              title={editing ? 'Done customizing' : 'Customize this dashboard'}
            >
              <Icon name={editing ? 'check' : 'tune'} size={14} />
              <span>{editing ? 'Done' : 'Customize'}</span>
            </button>
          </div>
        </div>
        )}

        {/* Cards (in order) */}
        {cardIds.map((cardId) => {
          const isDragging = dragId === cardId
          const isDropTarget = dropBefore === cardId
          return (
            <div
              key={cardId}
              style={{
                opacity: isDragging ? 0.45 : 1,
                borderTop:
                  isDropTarget && editing
                    ? '3px solid rgb(var(--accent))'
                    : '3px solid transparent',
                transition: 'border-color 80ms'
              }}
              onDragOver={
                editing
                  ? (e) => {
                      if (!dragId || dragId === cardId) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDropBefore(cardId)
                    }
                  : undefined
              }
              onDrop={
                editing
                  ? (e) => {
                      e.preventDefault()
                      if (dragId && dragId !== cardId) moveCard(dragId, cardId)
                      setDragId(null)
                      setDropBefore(null)
                    }
                  : undefined
              }
            >
              {editing && (
                <CardEditChrome
                  cardKind={cardId}
                  onRemove={() => removeCard(cardId)}
                  onDragStart={() => setDragId(cardId)}
                  onDragEnd={() => {
                    setDragId(null)
                    setDropBefore(null)
                  }}
                />
              )}
              <CardBody
                cardKind={cardId}
                taskIds={taskIds}
                editing={editing}
              />
            </div>
          )
        })}

        {/* Drop-at-end zone in edit mode */}
        {editing && cardIds.length > 0 && (
          <div
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropBefore(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId) moveCard(dragId, null)
              setDragId(null)
              setDropBefore(null)
            }}
            style={{
              height: 12,
              borderTop: dropBefore === null && dragId
                ? '3px solid rgb(var(--accent))'
                : '3px solid transparent',
              transition: 'border-color 80ms'
            }}
          />
        )}

        {/* Add-card palette (edit mode only) */}
        {editing && (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold mb-2">
              {hidden.length === 0 ? 'All cards added' : 'Add a card'}
            </div>
            {hidden.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Every available card is on this dashboard. Drag to reorder, click × to remove.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {hidden.map((k) => {
                  const meta = CARD_META[k]
                  return (
                    <button
                      key={k}
                      onClick={() => addCard(k)}
                      className="flex items-start gap-2 p-2 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-accent hover:bg-accent/5 transition-colors text-left"
                    >
                      <Icon
                        name={meta.icon}
                        size={16}
                        className="text-accent shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-stone-900 dark:text-stone-100">
                          {meta.label}
                        </div>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug">
                          {meta.description}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state — user removed every card */}
        {!editing && cardIds.length === 0 && (
          <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 backdrop-blur p-6 text-center">
            <Icon
              name="dashboard_customize"
              size={28}
              className="text-stone-400 dark:text-stone-500 mx-auto mb-2"
            />
            <p className="text-sm text-stone-600 dark:text-stone-300 mb-3">
              This dashboard is empty. Click <strong>Customize</strong> to add cards back.
            </p>
            <button onClick={() => setEditing(true)} className="btn-primary mx-auto">
              <Icon name="tune" size={14} />
              <span>Customize</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Renders the actual card body — same components used before, just keyed by id
function CardBody({
  cardKind,
  taskIds
}: {
  cardKind: Exclude<DashboardCardKind, 'garden' | 'energy'>
  taskIds: Set<string>
  editing: boolean
}): JSX.Element | null {
  const nodes = useNodeStore((s) => s.nodes)
  switch (cardKind) {
    case 'quick-start':
      return <QuickStartCard taskIds={taskIds} nodes={nodes} />
    case 'stats':
      return <StatsCard taskIds={taskIds} nodes={nodes} />
    case 'today-tasks':
      return <TodayTasksCard taskIds={taskIds} nodes={nodes} />
    case 'recent-activity':
      return <RecentActivityCard taskIds={taskIds} />
    case 'folders':
      return <FoldersCard nodes={nodes} />
    case 'workspace-progress':
      return <WorkspaceProgressCard taskIds={taskIds} nodes={nodes} />
    case 'workspace-health':
      return <WorkspaceHealthCard taskIds={taskIds} nodes={nodes} />
    case 'focus-session':
      return <FocusSessionCard nodes={nodes} />
    case 'ai-assistant':
      return <AIAssistantCard />
    case 'recent-notes':
      return <RecentNotesCard taskIds={taskIds} />
    default:
      return null
  }
}

// Edit-mode chrome: drag handle + label + remove button. Appears ABOVE each card.
function CardEditChrome({
  cardKind,
  onRemove,
  onDragStart,
  onDragEnd
}: {
  cardKind: Exclude<DashboardCardKind, 'garden' | 'energy'>
  onRemove: () => void
  onDragStart: () => void
  onDragEnd: () => void
}): JSX.Element {
  const meta = CARD_META[cardKind]
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/fb-card', cardKind)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2 px-3 py-1.5 rounded-t-xl border border-b-0 border-accent/40 bg-accent/5 text-accent text-[11px] font-medium cursor-grab active:cursor-grabbing select-none"
    >
      <Icon name="drag_indicator" size={14} />
      <Icon name={meta.icon} size={12} />
      <span className="flex-1">{meta.label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-accent/20"
        title="Remove from this dashboard"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}
