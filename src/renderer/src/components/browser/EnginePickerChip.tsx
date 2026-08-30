import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { useWebPanel } from '../../stores/webPanel'
import { SEARCH_ENGINES, type SearchEngineId } from '../../lib/omniIntent'

// The browser engine picker (A2, AI-02), model-picker style: a compact chip in
// the web panel's toolbar naming the pinned search engine, opening a menu of
// the engines browser mode can use free. The preference is the same one the
// omnibar's "Search the web" row already reads (stores/webPanel), so the chip
// and the palette can never disagree. Placement per Caleb's 2026-08-23 pick:
// the toolbar of the panel where searches actually render.
//
// Honesty note baked into the menu: Plexii's in-chat web answers stay on
// keyless DuckDuckGo until API keys exist for alternatives — the picker
// governs browser-mode searches, and the menu says so rather than implying
// a switch it does not have.

const ENGINE_BLURBS: Record<SearchEngineId, string> = {
  duckduckgo: 'Private and keyless — the default',
  google: 'Google results in the Plexii browser',
  bing: 'Bing results in the Plexii browser',
  brave: 'Independent index, no tracking',
  perplexity: 'AI answers with cited sources'
}

const MENU_WIDTH = 260

export default function EnginePickerChip(): React.JSX.Element {
  const engine = useWebPanel((s) => s.engine)
  const setEngine = useWebPanel((s) => s.setEngine)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  // The menu rides a body portal: the chip lives inside glass surfaces
  // (backdrop-filter = its own stacking context), where an absolute child
  // gets buried under sibling cards — Caleb hit exactly that on Home.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    if (!open) return
    const place = (): void => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      setMenuPos({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
      })
    }
    place()
    window.addEventListener('resize', place)
    function onPointerDown(e: PointerEvent): void {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])
  const active = SEARCH_ENGINES.find((s) => s.id === engine) ?? SEARCH_ENGINES[0]

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="web-panel-engine-toggle"
        aria-label="Choose search engine"
        aria-expanded={open}
        title={`Search engine — ${active.label}`}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono text-[var(--ink-60)] hover:text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors focus:outline-none"
      >
        <Icon name="search" size={11} className="shrink-0" />
        <span className="truncate max-w-[90px]">{active.label}</span>
        <Icon name="unfold_more" size={10} className="shrink-0" />
      </button>
      {open &&
        menuPos &&
        createPortal(
        <div
          ref={menuRef}
          data-testid="web-panel-engine-menu"
          className="fb-glass-panel rounded-[var(--radius-row)] fb-pop-in fixed z-[240] w-[260px] p-1"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {SEARCH_ENGINES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`web-panel-engine-${opt.id}`}
              onClick={() => {
                setEngine(opt.id)
                setOpen(false)
              }}
              className="w-full flex items-start gap-2 rounded-[var(--radius-chip)] px-2 py-1.5 text-left hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-[var(--ink-90)]">{opt.label}</span>
                <span className="block text-[10.5px] text-[var(--ink-50)] leading-snug">
                  {ENGINE_BLURBS[opt.id]}
                </span>
              </span>
              {opt.id === engine && (
                <Icon name="check" size={14} className="text-accent shrink-0 mt-0.5" />
              )}
            </button>
          ))}
          <div className="px-2 pt-1 pb-1 fb-t-caption text-[var(--ink-40)] leading-snug">
            Plexii&apos;s in-chat web answers stay on keyless DuckDuckGo until API keys exist.
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
