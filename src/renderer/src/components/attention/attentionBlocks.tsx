import { useEffect, useMemo } from 'react'
import type { FbNode } from '@shared/types'
import { useWorkItemStore } from '../../stores/workItems'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useAssistantChrome } from '../../stores/assistantChrome'
import Icon from '../Icon'
import { QUEUE_COLOR, QUEUE_ICON, queueOf, queueTint } from '../../lib/attentionQueues'
import {
  pulseCounts,
  overdueRadar,
  agendaItems,
  activityFeed,
  statusBreakdown,
  trendLines,
  startRecommendations
} from '../../lib/attentionAnalytics'
import { startPromptForItem } from '../../lib/startPrompt'

// DEC-048 — the command-center blocks. ONE component per widget with a
// `variant` prop (compact | full) — never a compact fork and a full fork.
// Same data, same styles, branching only where the display genuinely
// differs, so a fix propagates to every surface (the Attention page, the
// home dashboard, the desk widget) and the variants cannot drift.
//
// Every block reads the ATTENTION layer (useWorkItemStore) — these replace
// the home widgets that were wired to the legacy desk-task data.

export type BlockVariant = 'compact' | 'full'

export function useAttentionData(): FbNode[] {
  const items = useWorkItemStore((s) => s.items)
  const loaded = useWorkItemStore((s) => s.loaded)
  const refresh = useWorkItemStore((s) => s.refresh)
  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])
  return items
}

function BlockShell({
  title,
  icon,
  tone,
  count,
  variant,
  children
}: {
  title: string
  icon: string
  /** A PlexiSuite-family hex (attentionQueues.QUEUE_COLOR values) — subtle. */
  tone: string
  count?: number
  variant: BlockVariant
  children: React.ReactNode
}): JSX.Element {
  return (
    <section
      className={`rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] ${
        variant === 'full' ? 'p-4' : 'p-3'
      } flex flex-col min-h-0`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-md shrink-0"
          style={{ backgroundColor: queueTint(tone, 0.12), color: tone }}
        >
          <Icon name={icon} size={14} />
        </span>
        <span className="fb-t-label text-[var(--ink-70)] flex-1 truncate">{title}</span>
        {count !== undefined && (
          <span className="fb-t-label text-[var(--ink-40)] fb-tabular">{count}</span>
        )}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  )
}

function MiniRow({ i, nowMs, onOpen }: { i: FbNode; nowMs: number; onOpen: () => void }): JSX.Element {
  const overdue = i.dueAt && Date.parse(i.dueAt) < nowMs
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-2 py-1 text-left fb-press min-w-0">
      <Icon
        name={QUEUE_ICON[queueOf(i)] ?? 'check_circle'}
        size={12}
        style={{ color: queueTint(QUEUE_COLOR[queueOf(i)] ?? '#64748b', 0.8) }}
        className="shrink-0"
      />
      <span className="text-[12px] text-[var(--ink-90)] truncate flex-1">{i.title}</span>
      {i.dueAt && (
        <span className={`text-[10.5px] shrink-0 ${overdue ? 'text-rose-500' : 'text-[var(--ink-40)]'}`}>
          {new Date(i.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
    </button>
  )
}

const useGoAttention = (): (() => void) => useViewStore((s) => s.goAttention)

// ── Pulse ───────────────────────────────────────────────────────────────────

export function AttentionPulseBlock({ variant }: { variant: BlockVariant }): JSX.Element {
  const items = useAttentionData()
  const goAttention = useGoAttention()
  const nowMs = Date.now()
  const p = useMemo(() => pulseCounts(items, nowMs), [items, nowMs])
  const stats = [
    { label: 'Open', value: p.open, tone: '#0ea5e9' },
    { label: 'Due today', value: p.dueToday, tone: '#f59e0b' },
    { label: 'Overdue', value: p.overdue, tone: '#ef4444' },
    { label: 'Closed · 7d', value: p.closed7d, tone: '#10b981' }
  ]
  const max = Math.max(1, ...p.closedByDay)
  return (
    <BlockShell title="Pulse" icon="monitoring" tone="#8b5cf6" variant={variant}>
      <div className={`grid gap-2 ${variant === 'full' ? 'grid-cols-4' : 'grid-cols-2'}`}>
        {stats.map((s) => (
          <button
            key={s.label}
            onClick={goAttention}
            className="rounded-lg px-2.5 py-2 text-left fb-press"
            style={{ backgroundColor: queueTint(s.tone, 0.08) }}
          >
            <div className="text-[16px] font-semibold fb-tabular text-[var(--ink-100)]">{s.value}</div>
            <div className="fb-t-caption text-[var(--ink-50)]">{s.label}</div>
          </button>
        ))}
      </div>
      {variant === 'full' && (
        <div className="mt-3">
          <div className="fb-t-caption text-[var(--ink-40)] mb-1">Closed per day · 2 weeks</div>
          <div className="flex items-end gap-[3px] h-10">
            {p.closedByDay.map((n, i) => (
              <div
                key={i}
                title={`${n} closed`}
                className="flex-1 rounded-sm"
                style={{
                  height: `${Math.max(8, (n / max) * 100)}%`,
                  backgroundColor: queueTint('#10b981', n === 0 ? 0.12 : 0.55)
                }}
              />
            ))}
          </div>
        </div>
      )}
    </BlockShell>
  )
}

// ── Overdue radar ───────────────────────────────────────────────────────────

export function OverdueRadarBlock({ variant }: { variant: BlockVariant }): JSX.Element {
  const items = useAttentionData()
  const goAttention = useGoAttention()
  const nowMs = Date.now()
  const { overdue, dueSoon } = useMemo(() => overdueRadar(items, nowMs), [items, nowMs])
  const shown = variant === 'full' ? 8 : 3
  return (
    <BlockShell title="Overdue radar" icon="priority_high" tone="#ef4444" count={overdue.length} variant={variant}>
      {overdue.length === 0 ? (
        <div className="text-[11.5px] text-[var(--ink-30)]">Nothing overdue. Empty is the goal.</div>
      ) : (
        <div className="flex flex-col">
          {overdue.slice(0, shown).map((i) => (
            <MiniRow key={i.id} i={i} nowMs={nowMs} onOpen={goAttention} />
          ))}
        </div>
      )}
      {variant === 'full' && dueSoon.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--edge-soft)]">
          <div className="fb-t-caption text-[var(--ink-40)] mb-0.5">Next 48 hours</div>
          {dueSoon.slice(0, 5).map((i) => (
            <MiniRow key={i.id} i={i} nowMs={nowMs} onOpen={goAttention} />
          ))}
        </div>
      )}
    </BlockShell>
  )
}

// ── Today's agenda ──────────────────────────────────────────────────────────

export function AgendaBlock({ variant }: { variant: BlockVariant }): JSX.Element {
  const items = useAttentionData()
  const goAttention = useGoAttention()
  const nowMs = Date.now()
  const agenda = useMemo(() => agendaItems(items, nowMs), [items, nowMs])
  const shown = variant === 'full' ? 8 : 4
  return (
    <BlockShell title="Today's agenda" icon="event" tone="#10b981" count={agenda.length} variant={variant}>
      {agenda.length === 0 ? (
        <div className="text-[11.5px] text-[var(--ink-30)]">Nothing dated through tomorrow.</div>
      ) : (
        <div className="flex flex-col">
          {agenda.slice(0, shown).map((i) => (
            <MiniRow key={i.id} i={i} nowMs={nowMs} onOpen={goAttention} />
          ))}
        </div>
      )}
    </BlockShell>
  )
}

// ── Recent activity ─────────────────────────────────────────────────────────

export function RecentActivityBlock({ variant }: { variant: BlockVariant }): JSX.Element {
  const items = useAttentionData()
  const goAttention = useGoAttention()
  const nowMs = Date.now()
  const feed = useMemo(() => activityFeed(items, nowMs, variant === 'full' ? 12 : 5), [items, nowMs, variant])
  return (
    <BlockShell title="Recent activity" icon="history" tone="#6366f1" variant={variant}>
      {feed.length === 0 ? (
        <div className="text-[11.5px] text-[var(--ink-30)]">Quiet week so far.</div>
      ) : (
        <div className="flex flex-col">
          {feed.map((e) => (
            <button
              key={`${e.kind}:${e.item.id}:${e.atMs}`}
              onClick={goAttention}
              className="w-full flex items-center gap-2 py-1 text-left fb-press min-w-0"
            >
              <Icon
                name={e.kind === 'closed' ? 'task_alt' : 'add_circle'}
                size={12}
                className={e.kind === 'closed' ? 'text-emerald-500' : 'text-[var(--ink-40)]'}
              />
              <span className="text-[12px] text-[var(--ink-80)] truncate flex-1">{e.item.title}</span>
              <span className="fb-t-caption text-[var(--ink-30)] shrink-0">
                {e.kind === 'closed' ? e.item.workItemState : 'new'}
              </span>
            </button>
          ))}
        </div>
      )}
    </BlockShell>
  )
}

// ── Analytics: breakdown + trends ───────────────────────────────────────────

export function AnalyticsBlock({ variant }: { variant: BlockVariant }): JSX.Element {
  const items = useAttentionData()
  const nowMs = Date.now()
  const rows = useMemo(() => statusBreakdown(items, nowMs), [items, nowMs])
  const trends = useMemo(() => trendLines(items, nowMs), [items, nowMs])
  const shown = variant === 'full' ? rows : rows.slice(0, 3)
  return (
    <BlockShell title="Analytics" icon="insights" tone="#0ea5e9" variant={variant}>
      {shown.length === 0 ? (
        <div className="text-[11.5px] text-[var(--ink-30)]">Numbers appear as items do.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.map((r) => {
            const activeN = r.notStarted + r.inProgress + r.waiting
            const denom = Math.max(1, activeN + r.done7d)
            const seg = (n: number): string => `${(n / denom) * 100}%`
            return (
              <div key={r.queue} className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="fb-t-caption text-[var(--ink-60)] w-20 truncate">{r.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-[var(--surface-sunken)]">
                    <div style={{ width: seg(r.done7d), backgroundColor: queueTint('#10b981', 0.7) }} />
                    <div style={{ width: seg(r.inProgress), backgroundColor: queueTint('#0ea5e9', 0.7) }} />
                    <div style={{ width: seg(r.waiting), backgroundColor: queueTint('#f59e0b', 0.6) }} />
                    <div style={{ width: seg(r.notStarted), backgroundColor: queueTint('#64748b', 0.35) }} />
                  </div>
                  <span className="fb-t-caption fb-tabular text-[var(--ink-40)] w-8 text-right">
                    {activeN}
                  </span>
                </div>
                {variant === 'full' && (
                  <div className="fb-t-caption text-[var(--ink-30)] ml-[88px]">
                    {r.done7d} done · {r.inProgress} in progress · {r.waiting} waiting · {r.notStarted} not started
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {trends.length > 0 && (
        <div className={`${variant === 'full' ? 'mt-3 pt-2 border-t border-[var(--edge-soft)]' : 'mt-2'} flex flex-col gap-1`}>
          {(variant === 'full' ? trends : trends.slice(0, 1)).map((t) => (
            <div key={t} className="flex items-start gap-1.5 text-[11.5px] text-[var(--ink-60)]">
              <Icon name="trending_up" size={12} className="mt-0.5 shrink-0 text-[var(--ink-30)]" />
              {t}
            </div>
          ))}
        </div>
      )}
    </BlockShell>
  )
}

// ── Start here — the recommendation strip ───────────────────────────────────

export function StartHereBlock({ variant }: { variant: BlockVariant }): JSX.Element {
  const items = useAttentionData()
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)
  const openAssistant = useAssistantChrome((s) => s.openPanel)
  const nowMs = Date.now()
  const recs = useMemo(
    () => startRecommendations(items, nowMs, variant === 'full' ? 3 : 2),
    [items, nowMs, variant]
  )
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const start = (i: FbNode): void => {
    const prompt = startPromptForItem(i, nodesById)
    if (i.parentId && nodes.some((n) => n.id === i.parentId && n.kind === 'task')) {
      setActive(i.parentId)
      goTask(i.parentId)
    }
    useAssistantChrome.getState().setTab('chat')
    openAssistant()
    const stage = (): void => {
      window.dispatchEvent(new CustomEvent('fb:composer-stage', { detail: prompt }))
    }
    stage()
    setTimeout(stage, 400)
  }

  return (
    <BlockShell title="Start here" icon="auto_awesome" tone="#f59e0b" variant={variant}>
      {recs.length === 0 ? (
        <div className="text-[11.5px] text-[var(--ink-30)]">Nothing needs you. Capture with ⌘K.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {recs.map((r, idx) => (
            <div key={r.item.id} className="flex items-center gap-2 min-w-0">
              <span className="fb-t-caption fb-tabular text-[var(--ink-30)] w-3 shrink-0">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-[var(--ink-90)] truncate">{r.item.title}</div>
                <div className="fb-t-caption text-[var(--ink-40)]">{r.reason}</div>
              </div>
              <button
                onClick={() => start(r.item)}
                title="Start it with Plexii — a chat prefilled from this capture"
                className="icon-btn !h-7 !w-7 shrink-0"
              >
                <Icon name="auto_awesome" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </BlockShell>
  )
}
