import Icon from '../Icon'

// A "segment" is one of the four top-level areas (PlexiDesk, PlexiPeople,
// PlexiBrain, and PlexiOffice which keeps its own richer content). The global
// sidebar is now the single persistent menu, so a segment no longer carries its
// own side menu. This component renders the CONTENT of a segment only: either the
// active app's view, or the segment home of app tiles when no app is selected.
// The active app is driven by the current view (view.app); selecting a tile
// navigates through the view store so the persistent sidebar highlights the app.

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
  // The wordmark shown at the top of the segment home (e.g. "PLEXIDESK").
  wordmark: string
  title: string
  subtitle: string
  icon: string
  apps: SegmentApp[]
  proLabel?: string
}

// Render a segment's content. `activeApp` is the app key to show, or null/undefined
// for the segment home of tiles. `onOpenApp` navigates to a specific app (it should
// update the view store so the persistent sidebar stays in sync).
export default function SegmentShell({
  def,
  activeApp,
  onOpenApp
}: {
  def: SegmentDef
  activeApp?: string | null
  onOpenApp: (app: string) => void
}): JSX.Element {
  const active = activeApp ? def.apps.find((a) => a.key === activeApp) ?? null : null

  return (
    <div
      className="h-full bg-[var(--surface-base)] text-[var(--ink-100)] overflow-hidden"
      data-testid={`segment-${def.wordmark.toLowerCase()}`}
    >
      {active ? (
        <div className="h-full overflow-auto" data-testid={`segment-content-${active.key}`}>
          {active.render()}
        </div>
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
                  onClick={() => onOpenApp(a.key)}
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
  )
}
