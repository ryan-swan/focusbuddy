import { useState } from 'react'
import Icon from './Icon'
import { DashboardHeader, StatusPill, PLEXI_CARD } from './plexi'

// A real landing dashboard for a module, used in place of a blank "nothing
// selected" pane. It shows live stat tiles, a recent-items grid and a prominent
// create action, and it is configurable: the user can show or hide each optional
// section and the choice persists per module. Every number is derived from the
// items the caller passes, never invented; an empty module reads as honestly
// empty with a clear next step.

export interface ModuleStat {
  label: string
  value: number | string
  icon?: string
}

export interface ModuleItem {
  id: string
  title: string
  subtitle?: string
  meta?: string
  status?: { tone: 'accent' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'stone'; label: string }
  onOpen: () => void
}

export interface ModuleTip {
  icon: string
  text: string
}

interface ModuleHomeProps {
  moduleKey: string
  title: string
  subtitle: string
  icon: string
  accentClass: string // tailwind text colour for the module icon, e.g. "text-sky-500"
  stats: ModuleStat[]
  items: ModuleItem[]
  recentLabel?: string
  onCreate: () => void
  createLabel: string
  emptyHint: string
  tips?: ModuleTip[]
}

type SectionId = 'stats' | 'recent' | 'tips'

function loadHidden(key: string): Set<SectionId> {
  try {
    const raw = localStorage.getItem(`plexi.modulehome.${key}`)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as SectionId[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveHidden(key: string, hidden: Set<SectionId>): void {
  localStorage.setItem(`plexi.modulehome.${key}`, JSON.stringify([...hidden]))
}

export default function ModuleHome({
  moduleKey,
  title,
  subtitle,
  icon,
  accentClass,
  stats,
  items,
  recentLabel = 'Recent',
  onCreate,
  createLabel,
  emptyHint,
  tips
}: ModuleHomeProps): JSX.Element {
  const [hidden, setHidden] = useState<Set<SectionId>>(() => loadHidden(moduleKey))
  const [customizing, setCustomizing] = useState(false)

  function toggle(id: SectionId): void {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveHidden(moduleKey, next)
      return next
    })
  }

  const showStats = !hidden.has('stats') && stats.length > 0
  const showRecent = !hidden.has('recent')
  const showTips = !hidden.has('tips') && !!tips?.length

  const sectionOptions: { id: SectionId; label: string; available: boolean }[] = [
    { id: 'stats', label: 'Overview tiles', available: stats.length > 0 },
    { id: 'recent', label: recentLabel, available: true },
    { id: 'tips', label: 'What you can do here', available: !!tips?.length }
  ]

  return (
    <div className="flex-1 min-w-0 overflow-auto" data-testid={`module-home-${moduleKey}`}>
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 shrink-0">
              <Icon name={icon} size={22} className={accentClass} filled />
            </div>
            <DashboardHeader title={title} subtitle={subtitle} />
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setCustomizing((v) => !v)}
                data-testid={`module-home-customize-${moduleKey}`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--edge-soft)] text-[12.5px] text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]"
                title="Show or hide sections of this home"
              >
                <Icon name="tune" size={15} /> Customize
              </button>
              {customizing && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCustomizing(false)} />
                  <div className="absolute right-0 mt-1.5 z-20 w-56 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg p-2">
                    <p className="px-2 py-1 text-[11px] text-[var(--ink-50)]">Sections on this home</p>
                    {sectionOptions.filter((s) => s.available).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--surface-sunken)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!hidden.has(s.id)}
                          onChange={() => toggle(s.id)}
                          className="accent-[rgb(var(--accent))]"
                        />
                        <span className="text-[12.5px] text-[var(--ink-90)]">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onCreate}
              data-testid={`module-home-create-${moduleKey}`}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12.5px] font-medium hover:bg-[rgb(var(--accent-hover))]"
            >
              <Icon name="add" size={16} /> {createLabel}
            </button>
          </div>
        </div>

        {showStats && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className={`${PLEXI_CARD} p-3.5`}>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-70)]">
                  {s.icon && <Icon name={s.icon} size={13} className="text-[var(--ink-50)]" />}
                  {s.label}
                </div>
                <div className="mt-1 text-[22px] font-bold fb-tabular text-[var(--ink-100)] leading-none">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {showRecent && (
          <div className="mt-6">
            <h2 className="text-[12px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-2.5">{recentLabel}</h2>
            {items.length === 0 ? (
              <div className={`${PLEXI_CARD} px-4 py-10 text-center`}>
                <Icon name={icon} size={26} className="text-[var(--ink-30)]" />
                <p className="mt-2 text-[13px] text-[var(--ink-70)] max-w-sm mx-auto leading-relaxed">{emptyHint}</p>
                <button
                  onClick={onCreate}
                  className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[rgb(var(--accent))] text-white text-[12px] font-medium hover:bg-[rgb(var(--accent-hover))]"
                >
                  <Icon name="add" size={15} /> {createLabel}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((it) => (
                  <button
                    key={it.id}
                    onClick={it.onOpen}
                    data-testid={`module-home-item-${it.id}`}
                    className={`${PLEXI_CARD} p-3.5 text-left hover:border-[rgb(var(--accent)/0.40)] transition-colors`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[13.5px] font-semibold text-[var(--ink-100)] truncate">{it.title || 'Untitled'}</h3>
                      {it.status && <StatusPill tone={it.status.tone} label={it.status.label} dot={false} />}
                    </div>
                    {it.subtitle && <p className="mt-1 text-[12px] text-[var(--ink-70)] truncate">{it.subtitle}</p>}
                    {it.meta && <p className="mt-1.5 text-[11px] text-[var(--ink-50)] fb-tabular">{it.meta}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showTips && (
          <div className="mt-6">
            <h2 className="text-[12px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium mb-2.5">What you can do here</h2>
            <div className={`${PLEXI_CARD} p-4 space-y-2.5`}>
              {tips!.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Icon name={t.icon} size={16} className="text-[rgb(var(--accent))] mt-0.5 shrink-0" />
                  <p className="text-[12.5px] text-[var(--ink-90)] leading-relaxed">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
