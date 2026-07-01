import { useEffect, useState } from 'react'
import { useViewStore } from '../../stores/view'
import { promptUpgrade } from '../../stores/upgradePrompt'
import Icon from '../Icon'

// A reusable "segment" shell: a full-bleed area with its own dedicated side menu
// and a home of app tiles. Each segment (PlexiWork, PlexiConnect, PlexiFlow) is a
// thin definition of its apps; the apps reuse the existing views, rendered inline
// so the segment's side menu stays put while you move between them. This gives
// every part of the system the same organised, focused feel as PlexiOffice.

export interface SegmentApp {
  key: string
  label: string
  blurb: string
  icon: string
  // Tailwind background classes for the colored icon tile.
  tint: string
  render: () => JSX.Element
}

export interface SegmentDef {
  // The wordmark shown in the sidebar (e.g. "PLEXIWORK").
  wordmark: string
  title: string
  subtitle: string
  icon: string
  apps: SegmentApp[]
  proLabel?: string
}

export default function SegmentShell({ def, initialApp }: { def: SegmentDef; initialApp?: string }): JSX.Element {
  const goHome = useViewStore((s) => s.goHome)
  const [activeKey, setActiveKey] = useState<string | null>(initialApp ?? null)
  // Deep-link: when an entry point opens this segment with a specific app, switch
  // to it (the view object changes identity on each navigation).
  useEffect(() => {
    if (initialApp) setActiveKey(initialApp)
  }, [initialApp])
  const active = def.apps.find((a) => a.key === activeKey) ?? null

  return (
    <div className="h-full flex bg-[var(--surface-base)] text-[var(--ink-100)]" data-testid={`segment-${def.wordmark.toLowerCase()}`}>
      {/* Dedicated segment side menu */}
      <aside className="w-60 shrink-0 h-full overflow-auto border-r border-[var(--edge-soft)] bg-[var(--surface-raised)] flex flex-col" data-testid="segment-sidebar">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--edge-soft)]">
          <span className="text-[15px] font-bold tracking-[0.14em]">{def.wordmark}</span>
          <button onClick={goHome} className="ml-auto text-[var(--ink-50)] hover:text-[var(--ink-90)]" title="Back to PlexiDesk" data-testid="segment-exit">
            <Icon name="apps" size={18} />
          </button>
        </div>

        <nav className="px-2 py-3">
          <button
            onClick={() => setActiveKey(null)}
            data-testid="segment-nav-home"
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] mb-0.5 ${
              active === null ? 'bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))] font-medium' : 'text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]'
            }`}
          >
            <Icon name="home" size={17} />
            <span>Home</span>
          </button>
        </nav>

        <div className="px-4 pt-1 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-40)] font-semibold">Apps</div>
        <div className="px-2">
          {def.apps.map((a) => (
            <button
              key={a.key}
              onClick={() => setActiveKey(a.key)}
              data-testid={`segment-app-${a.key}`}
              className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[13px] mb-0.5 ${
                activeKey === a.key ? 'bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))] font-medium' : 'text-[var(--ink-80)] hover:bg-[var(--surface-sunken)]'
              }`}
            >
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-white ${a.tint}`}>
                <Icon name={a.icon} size={14} />
              </span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto p-3">
          <div className="rounded-xl border border-[rgb(var(--accent)/0.3)] bg-[rgb(var(--accent)/0.06)] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon name="auto_awesome" size={14} className="text-[rgb(var(--accent))]" />
              <span className="text-[12px] font-semibold">{def.proLabel ?? `${def.title} Pro`}</span>
            </div>
            <button onClick={() => promptUpgrade(def.proLabel ?? `${def.title} Pro`)} className="w-full h-7 rounded-lg bg-[rgb(var(--accent))] text-white text-[11.5px] font-medium">
              Upgrade Now
            </button>
          </div>
        </div>
      </aside>

      {/* Content: an app view inline, or the segment home of app tiles */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {active ? (
          <div className="h-full overflow-auto">{active.render()}</div>
        ) : (
          <div className="h-full overflow-auto">
            <div className="max-w-[1100px] mx-auto px-6 py-8">
              <div className="flex items-center gap-2.5 mb-1">
                <Icon name={def.icon} size={22} className="text-[rgb(var(--accent))]" />
                <h1 className="text-[22px] font-semibold">{def.title}</h1>
              </div>
              <p className="text-[13px] text-[var(--ink-50)] mb-6">{def.subtitle}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {def.apps.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setActiveKey(a.key)}
                    data-testid={`segment-tile-${a.key}`}
                    className="flex flex-col items-start gap-2.5 rounded-2xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-4 text-left hover:border-[rgb(var(--accent)/0.5)] hover:shadow-sm transition"
                  >
                    <span className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-white ${a.tint}`}>
                      <Icon name={a.icon} size={22} />
                    </span>
                    <span className="text-[14px] font-semibold">{a.label}</span>
                    <span className="text-[12px] text-[var(--ink-50)] leading-snug">{a.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
