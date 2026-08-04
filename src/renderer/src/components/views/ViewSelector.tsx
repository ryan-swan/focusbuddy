import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import { useDeskViewStore, type DeskViewMode } from '../../stores/deskView'

// Spec §3.4 — a dedicated Views control that shows a visual PREVIEW per view
// (not a text-only menu), names each one, marks the active one, supports keyboard
// navigation, and lets the user pin a per-desk DEFAULT (§3.3). Previews are inline
// SVG (CSP-safe, theme-aware) rather than image files. Only views that actually
// exist are listed — no "coming soon" placeholders. As real views are added
// (Kanban, Table, Timeline, …) they slot into VIEWS and appear here automatically.

interface ViewDef {
  mode: DeskViewMode
  label: string
  icon: string
  Preview: () => JSX.Element
}

function CanvasPreview(): JSX.Element {
  return (
    <svg viewBox="0 0 80 52" className="w-full h-full" aria-hidden="true">
      <rect x="6" y="8" width="26" height="16" rx="3" className="fill-[var(--surface-sunken)] stroke-[var(--edge-firm)]" strokeWidth="1" />
      <rect x="40" y="6" width="20" height="12" rx="3" className="fill-[var(--surface-sunken)] stroke-[var(--edge-firm)]" strokeWidth="1" />
      <rect x="14" y="30" width="22" height="14" rx="3" className="fill-[var(--surface-sunken)] stroke-[var(--edge-firm)]" strokeWidth="1" />
      <rect x="46" y="26" width="24" height="18" rx="3" className="fill-[rgb(var(--accent))]/20 stroke-[rgb(var(--accent))]" strokeWidth="1" />
    </svg>
  )
}

function ColumnsPreview(): JSX.Element {
  return (
    <svg viewBox="0 0 80 52" className="w-full h-full" aria-hidden="true">
      {[6, 30, 54].map((x, i) => (
        <g key={x}>
          <rect x={x} y="6" width="20" height="40" rx="3" className="fill-[var(--surface-sunken)] stroke-[var(--edge-firm)]" strokeWidth="1" />
          <rect x={x + 3} y="10" width="14" height="7" rx="2" className={i === 2 ? 'fill-[rgb(var(--accent))]/30' : 'fill-[var(--edge-firm)]'} />
          <rect x={x + 3} y="20" width="14" height="7" rx="2" className="fill-[var(--edge-firm)]" />
          {i !== 1 && <rect x={x + 3} y="30" width="14" height="7" rx="2" className="fill-[var(--edge-firm)]" />}
        </g>
      ))}
    </svg>
  )
}

const VIEWS: ViewDef[] = [
  { mode: 'canvas', label: 'Free canvas', icon: 'dashboard', Preview: CanvasPreview },
  { mode: 'columns', label: 'Columns', icon: 'view_column', Preview: ColumnsPreview }
]

export default function ViewSelector({ taskId }: { taskId: string }): JSX.Element {
  const modes = useDeskViewStore((s) => s.modes)
  const defaults = useDeskViewStore((s) => s.defaults)
  const setMode = useDeskViewStore((s) => s.set)
  const setDefault = useDeskViewStore((s) => s.setDefault)
  const active: DeskViewMode = modes[taskId] ?? defaults[taskId] ?? 'canvas'
  const current = VIEWS.find((v) => v.mode === active) ?? VIEWS[0]

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Arrow-key navigation across the option cards (spec §3.4 keyboard support).
  function onMenuKey(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const idx = VIEWS.findIndex((v) => v.mode === active)
    const next = e.key === 'ArrowRight' ? (idx + 1) % VIEWS.length : (idx - 1 + VIEWS.length) % VIEWS.length
    setMode(taskId, VIEWS[next].mode)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="view-selector-btn"
        title="Change how this desk is shown"
        aria-haspopup="menu"
        aria-expanded={open}
        className="fb-glass-chrome inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12px] text-[var(--ink-70)] hover:text-[rgb(var(--accent))] shadow-[0_2px_10px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
      >
        <Icon name={current.icon} size={14} />
        {current.label}
        <Icon name="expand_more" size={14} className="text-[var(--ink-40)]" />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="view-selector-menu"
          onKeyDown={onMenuKey}
          className="absolute left-0 top-10 z-[95] w-[260px] rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-xl p-2"
        >
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-50)] font-semibold px-1 pb-1.5">
            Views
          </div>
          <div className="grid grid-cols-2 gap-2">
            {VIEWS.map((v) => {
              const isActive = v.mode === active
              const isDefault = defaults[taskId] === v.mode
              return (
                <div key={v.mode} className="relative">
                  <button
                    onClick={() => {
                      setMode(taskId, v.mode)
                      setOpen(false)
                    }}
                    data-testid={`view-opt-${v.mode}`}
                    title={v.label}
                    className={`w-full rounded-lg border p-1.5 text-left transition-colors ${
                      isActive
                        ? 'border-accent bg-accent/10'
                        : 'border-[var(--edge-soft)] hover:bg-[var(--surface-sunken)]'
                    }`}
                  >
                    <div className="h-[52px] w-full rounded-md overflow-hidden bg-[var(--surface)] border border-[var(--edge-soft)]">
                      <v.Preview />
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      {isActive && <Icon name="check" size={12} className="text-accent" />}
                      <span className="text-[11.5px] text-[var(--ink-90)]">{v.label}</span>
                    </div>
                  </button>
                  {/* Pin this view as the desk's default (§3.3). */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDefault(taskId, v.mode)
                    }}
                    data-testid={`view-default-${v.mode}`}
                    title={isDefault ? 'Default view for this desk' : 'Set as default view for this desk'}
                    className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded-md bg-[var(--surface-raised)]/80 backdrop-blur text-[var(--ink-40)] hover:text-amber-500"
                  >
                    <Icon name={isDefault ? 'star' : 'star_border'} size={14} className={isDefault ? 'text-amber-500' : ''} />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-1.5 px-1 text-[10.5px] text-[var(--ink-40)]">
            The star pins a default view for this desk.
          </div>
        </div>
      )}
    </div>
  )
}
