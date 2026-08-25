import { useEffect, useMemo, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useWorkItemStore } from '../../stores/workItems'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import Icon from '../Icon'
import { isTerminalState, itemReason, QUEUE_ICON } from '../../lib/attentionQueues'
import type { WidgetSize } from './homeWidgetDefs'

// The Attention widget family (S6, SPEC-014): the command center's face on the
// home canvas. Every widget REFERENCES items that live elsewhere — counts and
// top slices, click-through to the Attention page or the desk — never a second
// place work lives. Counts derive from work_item_state exclusively (F013).

const DAY = 24 * 60 * 60 * 1000

function useAttentionItems(): FbNode[] {
  const items = useWorkItemStore((s) => s.items)
  const loaded = useWorkItemStore((s) => s.loaded)
  const refresh = useWorkItemStore((s) => s.refresh)
  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])
  return items
}

function WidgetShell({
  icon,
  title,
  count,
  children,
  emptyLine
}: {
  icon: string
  title: string
  count: number
  children?: JSX.Element | null
  emptyLine: string
}): JSX.Element {
  const goAttention = useViewStore((s) => s.goAttention)
  return (
    <button
      onClick={goAttention}
      className="w-full h-full text-left flex flex-col p-3 fb-press"
      title="Open Attention"
    >
      <div className="flex items-center gap-2">
        <Icon name={icon} size={15} className="text-[var(--ink-40)]" />
        <span className="fb-t-label text-[var(--ink-70)] flex-1 truncate">{title}</span>
        <span className="fb-t-label text-[var(--ink-40)] fb-tabular">{count}</span>
      </div>
      <div className="mt-2 flex-1 min-h-0 overflow-hidden">
        {count === 0 ? (
          <div className="text-[11px] text-[var(--ink-30)]">{emptyLine}</div>
        ) : (
          children
        )}
      </div>
    </button>
  )
}

function ItemLines({ items, max }: { items: FbNode[]; max: number }): JSX.Element {
  const now = Date.now()
  return (
    <div className="flex flex-col gap-1.5">
      {items.slice(0, max).map((i) => {
        const reason = itemReason(i, now)
        return (
          <div key={i.id} className="min-w-0">
            <div className="text-[12px] text-[var(--ink-90)] truncate">{i.title}</div>
            {reason && <div className="text-[10px] text-[var(--ink-40)]">{reason}</div>}
          </div>
        )
      })}
    </div>
  )
}

function activeOf(items: FbNode[], queue: string): FbNode[] {
  const now = Date.now()
  return items
    .filter(
      (i) =>
        (i.intentClass ?? 'action') === queue &&
        !isTerminalState(i.workItemState) &&
        !(i.snoozeUntil != null && i.snoozeUntil > now) &&
        i.detachedFromId == null
    )
    .sort((a, b) => {
      const da = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY
      const db = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY
      return da - db || b.createdAt - a.createdAt
    })
}

export function AttentionQueueWidget({
  queue,
  title,
  emptyLine,
  size = 'sm'
}: {
  queue: string
  title: string
  emptyLine: string
  size?: WidgetSize
}): JSX.Element {
  const items = useAttentionItems()
  const active = useMemo(() => activeOf(items, queue), [items, queue])
  return (
    <WidgetShell
      icon={QUEUE_ICON[queue] ?? 'check_circle'}
      title={title}
      count={active.length}
      emptyLine={emptyLine}
    >
      <ItemLines items={active} max={size === 'sm' ? 2 : 5} />
    </WidgetShell>
  )
}

/** Upcoming dated work: everything with a due_at plus the scheduling queue —
 *  the calendar's attention slice, soonest first. */
export function AttentionCalendarWidget({ size = 'sm' }: { size?: WidgetSize }): JSX.Element {
  const items = useAttentionItems()
  const upcoming = useMemo(() => {
    const now = Date.now()
    return items
      .filter(
        (i) =>
          !isTerminalState(i.workItemState) &&
          i.detachedFromId == null &&
          (i.dueAt != null || (i.intentClass ?? '') === 'scheduling')
      )
      .sort((a, b) => {
        const da = a.dueAt ? Date.parse(a.dueAt) : now + 365 * DAY
        const db = b.dueAt ? Date.parse(b.dueAt) : now + 365 * DAY
        return da - db
      })
  }, [items])
  return (
    <WidgetShell
      icon="event"
      title="Coming up"
      count={upcoming.length}
      emptyLine="Nothing dated. Clear runway."
    >
      <ItemLines items={upcoming} max={size === 'sm' ? 2 : 5} />
    </WidgetShell>
  )
}

/** The closed-loop shelf: what got finished lately (dismissals excluded — this
 *  celebrates completion, it does not archive noise). */
export function AttentionCompletedWidget({ size = 'sm' }: { size?: WidgetSize }): JSX.Element {
  const items = useAttentionItems()
  const done = useMemo(() => {
    const cutoff = Date.now() - 7 * DAY
    return items
      .filter(
        (i) =>
          isTerminalState(i.workItemState) &&
          i.workItemState !== 'dismissed' &&
          i.workItemState !== 'reclassified' &&
          i.updatedAt > cutoff
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [items])
  return (
    <WidgetShell
      icon="task_alt"
      title="Completed"
      count={done.length}
      emptyLine="Loops close here as you finish things."
    >
      <ItemLines items={done} max={size === 'sm' ? 2 : 5} />
    </WidgetShell>
  )
}

/** System-origin items (DEC-016 Q7): agent escalations, parked-inbound rows,
 *  cost caps — excluded from the headline count, visible here. */
export function AttentionSystemWidget({ size = 'sm' }: { size?: WidgetSize }): JSX.Element {
  const items = useAttentionItems()
  const sys = useMemo(
    () =>
      items.filter(
        (i) => i.wiOrigin === 'system' && !isTerminalState(i.workItemState) && i.detachedFromId == null
      ),
    [items]
  )
  return (
    <WidgetShell
      icon="settings_suggest"
      title="System"
      count={sys.length}
      emptyLine="No system signals. All quiet."
    >
      <ItemLines items={sys} max={size === 'sm' ? 2 : 5} />
    </WidgetShell>
  )
}

/** Lifecycle L3's only consumer (F006): desks gone quiet while still open. */
export function StaleDesksWidget({ size = 'sm' }: { size?: WidgetSize }): JSX.Element {
  const [stale, setStale] = useState<
    Array<{ id: string; title: string; daysQuiet: number }>
  >([])
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)
  useEffect(() => {
    let alive = true
    void window.api.nodes
      .staleDesks()
      .then((rows) => {
        if (alive) setStale(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return (
    <div className="w-full h-full flex flex-col p-3">
      <div className="flex items-center gap-2">
        <Icon name="bedtime" size={15} className="text-[var(--ink-40)]" />
        <span className="fb-t-label text-[var(--ink-70)] flex-1 truncate">Stale desks</span>
        <span className="fb-t-label text-[var(--ink-40)] fb-tabular">{stale.length}</span>
      </div>
      <div className="mt-2 flex-1 min-h-0 overflow-hidden flex flex-col gap-1.5">
        {stale.length === 0 ? (
          <div className="text-[11px] text-[var(--ink-30)]">Every open desk has a pulse.</div>
        ) : (
          stale.slice(0, size === 'sm' ? 2 : 5).map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setActive(d.id)
                goTask(d.id)
              }}
              className="text-left min-w-0 fb-press"
            >
              <div className="text-[12px] text-[var(--ink-90)] truncate">{d.title}</div>
              <div className="text-[10px] text-[var(--ink-40)]">
                Quiet for {d.daysQuiet} day{d.daysQuiet === 1 ? '' : 's'}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
