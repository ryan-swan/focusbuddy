import { useEffect, useMemo, useState } from 'react'
import type { FocusSession, EnergyLevel } from '@shared/types'
import { useNodeStore } from '../../stores/nodes'
import { useViewStore } from '../../stores/view'
import { useEnergyStore, energyFitForTask } from '../../stores/energy'
import {
  summarize,
  focusByHour,
  bestFocusHours,
  topTasksByFocus,
  hourLabel
} from '../../lib/focusInsights'
import Icon from '../Icon'

// Flow & focus insights — an honest reflection of the focus sessions you've
// actually run. Nothing here is fabricated: every number comes from real
// sessions, and each section shows an empty state until there's data to show.

const DAY = 86_400_000
const ENERGY_META: Record<EnergyLevel, { label: string; icon: string; tint: string }> = {
  low: { label: 'Low', icon: 'battery_2_bar', tint: 'text-amber-600 dark:text-amber-400' },
  medium: { label: 'Medium', icon: 'battery_4_bar', tint: 'text-sky-600 dark:text-sky-400' },
  high: { label: 'High', icon: 'battery_full', tint: 'text-emerald-600 dark:text-emerald-400' }
}

export default function InsightsView(): JSX.Element {
  const nodes = useNodeStore((s) => s.nodes)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)
  const energy = useEnergyStore((s) => s.current)
  const refreshEnergy = useEnergyStore((s) => s.refresh)
  const logEnergy = useEnergyStore((s) => s.log)

  const [sessions, setSessions] = useState<FocusSession[] | null>(null)
  const [windowDays, setWindowDays] = useState<7 | 30>(30)

  useEffect(() => {
    void refreshEnergy()
    let cancelled = false
    void window.api.focus.recent(1000).then((s) => {
      if (!cancelled) setSessions(s)
    })
    return () => {
      cancelled = true
    }
  }, [refreshEnergy])

  const titleFor = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n.title || '(untitled)']))
    return (id: string): string | null => map.get(id) ?? null
  }, [nodes])

  const sinceMs = Date.now() - windowDays * DAY
  const summary = useMemo(() => (sessions ? summarize(sessions, sinceMs) : null), [sessions, sinceMs])
  const byHour = useMemo(() => (sessions ? focusByHour(sessions, sinceMs) : []), [sessions, sinceMs])
  const bestHours = useMemo(() => bestFocusHours(byHour, 3), [byHour])
  const topTasks = useMemo(
    () => (sessions ? topTasksByFocus(sessions, sinceMs, titleFor, 5) : []),
    [sessions, sinceMs, titleFor]
  )
  const maxHour = Math.max(1, ...byHour)

  // "What to work on now" — open tasks whose lift matches your current energy.
  const suggestions = useMemo(() => {
    if (!energy) return []
    return nodes
      .filter((n) => n.kind === 'task' && !n.archived && n.status !== 'done')
      .filter((n) => energyFitForTask(n) === energy.level)
      .sort((a, b) => b.importance - a.importance || b.priority - a.priority)
      .slice(0, 3)
  }, [nodes, energy])

  const hasData = !!summary && summary.sessions > 0

  return (
    <div className="h-full overflow-auto desk-paper no-tod" data-testid="insights-view">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <header className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 shadow-sm shrink-0">
            <Icon name="insights" size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Focus insights</h1>
            <p className="text-[12px] text-stone-500 dark:text-stone-400">
              Built from your real focus sessions. The more you run, the clearer the picture.
            </p>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            {([7, 30] as const).map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d)}
                className={`px-2 py-1 rounded-md ${
                  windowDays === d
                    ? 'bg-accent text-white'
                    : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </header>

        {/* What to work on now — energy-matched suggestions */}
        <section className="mb-5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 p-4">
          <h2 className="text-[13px] font-semibold text-stone-800 dark:text-stone-200 mb-2 flex items-center gap-1.5">
            <Icon name="bolt" size={15} className="text-accent" /> What to work on now
          </h2>
          {!energy ? (
            <div className="text-[12px] text-stone-500 dark:text-stone-400">
              <p className="mb-2">Tell me your energy and I'll suggest tasks that fit it.</p>
              <div className="flex gap-1.5">
                {(['low', 'medium', 'high'] as EnergyLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => void logEnergy(lvl)}
                    className="chip-active chip-btn"
                  >
                    <Icon name={ENERGY_META[lvl].icon} size={14} className={ENERGY_META[lvl].tint} />
                    <span>{ENERGY_META[lvl].label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-[12px] text-stone-500 dark:text-stone-400">
              Energy is <strong>{ENERGY_META[energy.level].label.toLowerCase()}</strong>, but no open task fits
              it right now. <button onClick={() => void logEnergy('medium')} className="text-accent hover:underline">Update energy</button>.
            </p>
          ) : (
            <>
              <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-2">
                Your energy is{' '}
                <span className={`font-medium ${ENERGY_META[energy.level].tint}`}>
                  {ENERGY_META[energy.level].label.toLowerCase()}
                </span>{' '}
                — these fit:
              </p>
              <div className="space-y-1">
                {suggestions.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActive(t.id)
                      goTask(t.id)
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-stone-100/70 dark:hover:bg-stone-800/50"
                  >
                    <Icon name="task_alt" size={15} className="text-stone-400 shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] text-stone-800 dark:text-stone-100 truncate">
                      {t.title || '(untitled task)'}
                    </span>
                    <Icon name="chevron_right" size={15} className="text-stone-300 dark:text-stone-600 shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {!hasData ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
            <Icon name="timer" size={26} className="text-stone-400 dark:text-stone-500 mx-auto mb-2" />
            <p className="text-sm text-stone-600 dark:text-stone-300">No focus sessions in this window yet.</p>
            <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-1">
              Start a focus session from the Home dashboard or a task, and your patterns will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <section className="grid grid-cols-3 gap-2 mb-5">
              <Stat label="Focused time" value={fmtMinutes(summary!.focusedMinutes)} />
              <Stat label="Sessions" value={`${summary!.completed}/${summary!.sessions}`} hint="completed" />
              <Stat label="Typical session" value={`${summary!.medianMinutes}m`} hint="median" />
            </section>

            {/* When you focus */}
            <section className="mb-5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 p-4">
              <h2 className="text-[13px] font-semibold text-stone-800 dark:text-stone-200 mb-1 flex items-center gap-1.5">
                <Icon name="schedule" size={15} className="text-accent" /> When you focus
              </h2>
              {bestHours.length > 0 && (
                <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3">
                  You focus most around{' '}
                  <strong>{bestHours.map(hourLabel).join(', ')}</strong>.
                </p>
              )}
              <div className="flex items-end gap-[2px] h-24">
                {byHour.map((m, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${hourLabel(h)}: ${m}m`}>
                    <div
                      className={`w-full rounded-sm ${m > 0 ? 'bg-accent/70' : 'bg-stone-200 dark:bg-stone-800'}`}
                      style={{ height: `${m > 0 ? Math.max(4, (m / maxHour) * 88) : 2}px` }}
                    />
                    {h % 6 === 0 && (
                      <span className="text-[8px] text-stone-400 dark:text-stone-500">{hourLabel(h)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Top tasks */}
            {topTasks.length > 0 && (
              <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 p-4">
                <h2 className="text-[13px] font-semibold text-stone-800 dark:text-stone-200 mb-2 flex items-center gap-1.5">
                  <Icon name="trophy" size={15} className="text-accent" /> Where your focus went
                </h2>
                <div className="space-y-1">
                  {topTasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setActive(t.id)
                        goTask(t.id)
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-stone-100/70 dark:hover:bg-stone-800/50"
                    >
                      <span className="flex-1 min-w-0 text-[13px] text-stone-800 dark:text-stone-100 truncate">
                        {t.title}
                      </span>
                      <span className="text-[12px] tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                        {fmtMinutes(t.minutes)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 px-3 py-3 text-center">
      <div className="text-[18px] font-semibold text-stone-900 dark:text-stone-100 tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-stone-500 mt-0.5">{label}</div>
      {hint && <div className="text-[9px] text-stone-400 dark:text-stone-500">{hint}</div>}
    </div>
  )
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
