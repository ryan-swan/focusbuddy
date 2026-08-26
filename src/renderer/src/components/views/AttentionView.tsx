import { useEffect, useMemo, useState } from 'react'
import type { FbNode } from '@shared/types'
import { useWorkItemStore } from '../../stores/workItems'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useCaptureConsole } from '../../stores/captureConsole'
import { promptText } from '../plexi/PromptDialog'
import Icon from '../Icon'
import {
  groupIntoQueues,
  groupByDue,
  groupByOrigin,
  recentlyClosed,
  archivedItems,
  detachedItems,
  itemReason,
  PRIMARY_ACTION,
  QUEUE_ICON
} from '../../lib/attentionQueues'
import {
  feederSignals,
  loadMutes,
  saveMutes,
  mutedCountOfKind,
  KIND_MUTE_OFFER_THRESHOLD,
  type FeederSignal
} from '../../lib/attentionFeeders'

// The Attention surface (S6, SPEC-017). Every work item that needs the person,
// in purpose-built queues with the class-appropriate closing verb — a LENS
// over items that live with their desks, never a second workspace. Snoozed
// items hide until they return; the Detached shelf (F-M6) holds park-local
// items whose desk was purged or moved, with MOVE as the recovery.

const CLASS_CHOICES = [
  { value: 'action', label: 'Task', hint: 'Something to do' },
  { value: 'review', label: 'Review', hint: 'Needs judgment or sign-off' },
  { value: 'scheduling', label: 'Scheduling', hint: 'Time and calendar' },
  { value: 'fyi', label: 'FYI', hint: 'Worth knowing' },
  { value: 'acknowledgment', label: 'Acknowledgment', hint: 'Needs only receipt' },
  { value: 'discussion', label: 'Discussion', hint: 'Talk it through live' },
  { value: 'loose_thought', label: 'Loose thought', hint: 'Idle capture, may fade' }
]

function dueChip(i: FbNode, nowMs: number): JSX.Element | null {
  if (!i.dueAt) return null
  const overdue = Date.parse(i.dueAt) < nowMs
  const label = new Date(i.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[11px] ${
        overdue
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : 'bg-[var(--surface-sunken)] text-[var(--ink-50)]'
      }`}
    >
      <Icon name="schedule" size={11} /> {label}
    </span>
  )
}

export default function AttentionView(): JSX.Element {
  const items = useWorkItemStore((s) => s.items)
  const loaded = useWorkItemStore((s) => s.loaded)
  const refresh = useWorkItemStore((s) => s.refresh)
  const setState = useWorkItemStore((s) => s.setState)
  const reclassify = useWorkItemStore((s) => s.reclassify)
  const snooze = useWorkItemStore((s) => s.snooze)
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const openConsole = useCaptureConsole((s) => s.openConsole)
  const [nowMs, setNowMs] = useState(() => Date.now())
  // SPEC-017 lenses: the same active set through three groupings, persisted.
  const [lens, setLens] = useState<'queue' | 'due' | 'origin'>(
    () => (localStorage.getItem('attention.lens') as 'queue' | 'due' | 'origin') || 'queue'
  )
  const pickLens = (l: 'queue' | 'due' | 'origin'): void => {
    localStorage.setItem('attention.lens', l)
    setLens(l)
  }
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    void refresh()
    const t = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const queues = useMemo(
    () =>
      lens === 'due'
        ? groupByDue(items, nowMs)
        : lens === 'origin'
          ? groupByOrigin(items, nowMs)
          : groupIntoQueues(items, nowMs),
    [items, nowMs, lens]
  )
  const detached = useMemo(() => detachedItems(items), [items])
  const closed = useMemo(() => recentlyClosed(items, nowMs), [items, nowMs])
  // DEC-024: the Archived shelf — kept, out of the way, no clock.
  const archived = useMemo(() => archivedItems(items), [items])
  const [showArchived, setShowArchived] = useState(false)
  const total = queues.reduce((n, q) => n + q.items.length, 0)

  // S7 feeders: desk signals surfacing AS attention (computed, never owned).
  const [mutes, setMutes] = useState<Set<string>>(() => loadMutes())
  const [staleRows, setStaleRows] = useState<Array<{ id: string; title: string; daysQuiet: number }>>([])
  useEffect(() => {
    let alive = true
    void window.api.nodes
      .staleDesks()
      .then((rows) => {
        if (alive) setStaleRows(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const signals = useMemo(
    () => feederSignals(nodes, staleRows, nowMs, mutes),
    [nodes, staleRows, nowMs, mutes]
  )
  function muteSignal(s: FeederSignal): void {
    const next = new Set(mutes)
    next.add(s.key)
    // Δ10: repeated mutes of one kind quiet the whole source, on offer.
    if (mutedCountOfKind(next, s.kind) >= KIND_MUTE_OFFER_THRESHOLD) {
      void promptText({
        title: 'Quiet this whole source?',
        label: `You've muted several ${
          s.kind === 'desk-due' ? 'due-desk' : s.kind === 'plan-due' ? 'plan-due' : 'stale-desk'
        } nudges.`,
        choices: [
          { value: 'kind', label: 'Mute all of these', hint: 'This source stays quiet until you clear mutes' },
          { value: 'one', label: 'Just this one' }
        ]
      }).then((pick) => {
        if (pick === 'kind') next.add(`kind:${s.kind}`)
        setMutes(new Set(next))
        saveMutes(next)
      })
      return
    }
    setMutes(next)
    saveMutes(next)
  }

  async function snoozeTomorrow(id: string): Promise<void> {
    const d = new Date(nowMs)
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    await snooze(id, d.getTime())
    await refresh()
  }

  async function reclassifyItem(i: FbNode): Promise<void> {
    const next = await promptText({
      title: 'Reclassify',
      label: `Where does “${i.title}” belong?`,
      choices: CLASS_CHOICES.filter((c) => c.value !== i.intentClass)
    })
    if (next) await reclassify(i.id, next)
  }

  async function moveDetached(i: FbNode): Promise<void> {
    const desks = nodes.filter((n) => n.kind === 'task' && !n.archived).slice(0, 12)
    if (!desks.length) return
    const target = await promptText({
      title: 'Move to a desk',
      label: `Pick a new home for “${i.title}”`,
      choices: desks.map((d) => ({ value: d.id, label: d.title || 'Untitled desk' }))
    })
    if (target) {
      await window.api.nodes.move(i.id, target, null)
      await window.api.workItems.clearDetached(i.id)
      await refresh()
    }
  }

  function openSource(i: FbNode): void {
    if (i.parentId && nodes.some((n) => n.id === i.parentId && n.kind === 'task')) {
      setActive(i.parentId)
      goTask(i.parentId)
    }
  }

  function row(i: FbNode, inDetached: boolean): JSX.Element {
    const primary = PRIMARY_ACTION[i.intentClass ?? 'action'] ?? PRIMARY_ACTION.action
    const reason = itemReason(i, nowMs)
    const hasDesk = !!(i.parentId && nodes.some((n) => n.id === i.parentId))
    return (
      <div
        key={i.id}
        className="group flex items-center gap-3 px-4 py-2.5 bg-[var(--surface-raised)]"
      >
        <Icon
          name={QUEUE_ICON[i.intentClass ?? 'action'] ?? 'check_circle'}
          size={16}
          className="text-[var(--ink-30)] shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="fb-t-body font-medium text-[var(--ink-100)] truncate">{i.title}</span>
            {dueChip(i, nowMs)}
          </div>
          {reason && <div className="text-[11px] text-[var(--ink-40)] mt-0.5">{reason}</div>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {inDetached ? (
            <button
              onClick={() => void moveDetached(i)}
              className="h-7 px-2.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)]"
            >
              Move…
            </button>
          ) : (
            <>
              {hasDesk && (
                <button
                  onClick={() => openSource(i)}
                  title="Open its desk"
                  className="icon-btn !h-7 !w-7"
                >
                  <Icon name="desk" size={14} />
                </button>
              )}
              <button
                onClick={() => void snoozeTomorrow(i.id)}
                title="Snooze until tomorrow morning"
                className="icon-btn !h-7 !w-7"
              >
                <Icon name="snooze" size={14} />
              </button>
              <button
                onClick={() => void reclassifyItem(i)}
                title="This isn’t right — reclassify"
                className="icon-btn !h-7 !w-7"
              >
                <Icon name="swap_horiz" size={14} />
              </button>
              <button
                onClick={() => void setState(i.id, 'archived')}
                title="Archive — keep it, out of the way"
                className="icon-btn !h-7 !w-7"
              >
                <Icon name="archive" size={14} />
              </button>
              <button
                onClick={() => void setState(i.id, primary.state)}
                className="h-7 px-2.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-100)]"
              >
                {primary.label}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-base)] text-[var(--ink-100)]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="fb-t-title text-[var(--ink-90)]">Attention</h1>
            <p className="fb-t-body text-[var(--ink-50)] mt-1">
              Everything that needs you, filed by what it’s trying to do. Items live with their
              desks — this is the lens, not the drawer.
            </p>
          </div>
          <button
            onClick={() => openConsole()}
            className="inline-flex items-center gap-1.5 h-9 px-3 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] hover:text-[var(--ink-100)] shrink-0"
          >
            <Icon name="add" size={15} /> Capture
          </button>
        </div>
        <div className="mb-4 flex items-center gap-1">
          <span className="fb-t-label text-[var(--ink-40)] mr-1">Group by</span>
          {(
            [
              ['queue', 'Queue'],
              ['due', 'Due'],
              ['origin', 'Origin']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => pickLens(key)}
              className={`px-2.5 h-7 fb-t-label fb-press rounded-[var(--radius-field)] ${
                lens === key
                  ? 'bg-[var(--surface-sunken)] text-[var(--ink-100)]'
                  : 'text-[var(--ink-50)] hover:text-[var(--ink-100)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loaded && total === 0 && detached.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="check_circle" size={28} className="text-[var(--ink-30)] mb-3" />
            <div className="fb-t-label text-[var(--ink-50)]">Nothing needs you</div>
            <div className="fb-t-body text-[var(--ink-30)] mt-1">
              Capture anything with ⌘K → “Capture a work item”.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {queues.map((q) => (
              <section key={q.queue}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon name={QUEUE_ICON[q.queue] ?? 'label'} size={14} className="text-[var(--ink-40)]" />
                  <span className="fb-t-label text-[var(--ink-70)]">{q.label}</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{q.items.length}</span>
                </div>
                <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
                  {q.items.map((i) => row(i, false))}
                </div>
              </section>
            ))}
            {signals.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="desk" size={14} className="text-[var(--ink-40)]" />
                  <span className="fb-t-label text-[var(--ink-70)]">From your desks</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{signals.length}</span>
                </div>
                <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
                  {signals.map((s) => (
                    <div
                      key={s.key}
                      className="group flex items-center gap-3 px-4 py-2.5 bg-[var(--surface-raised)]"
                    >
                      <Icon
                        name={s.kind === 'desk-due' ? 'schedule' : s.kind === 'plan-due' ? 'account_tree' : 'bedtime'}
                        size={16}
                        className="text-[var(--ink-30)] shrink-0"
                      />
                      <button
                        onClick={() => {
                          if (s.target === 'plan') {
                            goProject(s.id)
                          } else {
                            setActive(s.id)
                            goTask(s.id)
                          }
                        }}
                        className="flex-1 min-w-0 text-left fb-press"
                      >
                        <span className="fb-t-body font-medium text-[var(--ink-100)] truncate block">
                          {s.title}
                        </span>
                        <span className="text-[11px] text-[var(--ink-40)]">{s.line}</span>
                      </button>
                      <button
                        onClick={() => muteSignal(s)}
                        title="Mute this nudge"
                        className="icon-btn !h-7 !w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icon name="notifications_off" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {detached.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="link_off" size={14} className="text-[var(--ink-40)]" />
                  <span className="fb-t-label text-[var(--ink-70)]">Detached</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{detached.length}</span>
                </div>
                <p className="text-[11px] text-[var(--ink-40)] mb-2">
                  Their desks were removed or moved — the items were kept. Give each a new home.
                </p>
                <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden">
                  {detached.map((i) => row(i, true))}
                </div>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <button
                  onClick={() => setShowClosed((v) => !v)}
                  className="flex items-center gap-2 mb-2 fb-press"
                >
                  <Icon
                    name={showClosed ? 'expand_more' : 'chevron_right'}
                    size={14}
                    className="text-[var(--ink-40)]"
                  />
                  <span className="fb-t-label text-[var(--ink-70)]">Recently closed</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{closed.length}</span>
                </button>
                {showClosed && (
                  <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden opacity-80">
                    {closed.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 px-4 py-2 bg-[var(--surface-raised)]">
                        <Icon name="task_alt" size={14} className="text-[var(--ink-30)] shrink-0" />
                        <span className="fb-t-body text-[var(--ink-50)] truncate flex-1">{i.title}</span>
                        <span className="text-[11px] text-[var(--ink-30)]">{i.workItemState}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {archived.length > 0 && (
              <section>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex items-center gap-2 mb-2 fb-press"
                >
                  <Icon
                    name={showArchived ? 'expand_more' : 'chevron_right'}
                    size={14}
                    className="text-[var(--ink-40)]"
                  />
                  <span className="fb-t-label text-[var(--ink-70)]">Archived</span>
                  <span className="fb-t-label text-[var(--ink-30)] fb-tabular">{archived.length}</span>
                </button>
                {showArchived && (
                  <div className="rounded-xl border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)] overflow-hidden opacity-80">
                    {archived.map((i) => (
                      <div
                        key={i.id}
                        className="group flex items-center gap-3 px-4 py-2 bg-[var(--surface-raised)]"
                      >
                        <Icon name="archive" size={14} className="text-[var(--ink-30)] shrink-0" />
                        <span className="fb-t-body text-[var(--ink-50)] truncate flex-1">{i.title}</span>
                        <button
                          onClick={() => void setState(i.id, 'open')}
                          title="Back to the queues"
                          className="h-7 px-2.5 fb-btn-surface fb-press fb-t-label text-[var(--ink-70)] hover:text-[var(--ink-100)] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Unarchive
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
