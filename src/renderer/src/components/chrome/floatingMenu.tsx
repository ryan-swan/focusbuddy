import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../Icon'

// ── Floating menu chrome ─────────────────────────────────────────────────────
// The shared look-and-behaviour for every primary side menu in the app: the
// global Desk sidebar, the segment (Desk / People / Brain) menus, and the
// PlexiOffice menu. Instead of a full-height docked panel welded to the window
// edge with a right border, each menu is a rounded card that floats above the
// desk surface with a small inset margin and a soft elevation, and each can be
// minimised to free the whole surface for the content beside it.
//
// Everything here is token-driven (var(--surface-raised), var(--edge-soft), the
// --shadow-cast elevation, the --radius-lg corner) so the menus adapt to light,
// dark, futuristic and atelier themes without per-theme styling.

// The floating card itself. Rounded on every corner, hairline edge all round
// (no more one-sided right border), and it clips its own content so the rounded
// corners read cleanly. Callers add the elevation via FLOATING_MENU_STYLE.
// The `fb-floating-chrome` marker is a stable, non-Tailwind class used purely as
// a hit-test hook: the canvas edge-pan (useEdgePan) suppresses panning when the
// pointer is over any floating menu, so hovering a menu that overlays the canvas
// no longer pushes the desk. Keep this class on every floating chrome surface.
export const FLOATING_MENU_ASIDE =
  'fb-floating-chrome h-full w-full flex flex-col overflow-hidden rounded-[14px] border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-100)]'

// Same floating card, but the card itself scrolls. Used by the fixed-width
// segment and office menus whose whole body scrolls as one column (the rounded
// corners still clip the scrolled content because overflow is not visible).
export const FLOATING_MENU_ASIDE_SCROLL =
  'fb-floating-chrome h-full w-full flex flex-col overflow-auto rounded-[14px] border border-[var(--edge-soft)] bg-[var(--surface-raised)]'

// The elevation and a hint of the inset highlight, applied inline because they
// reference CSS custom properties that Tailwind arbitrary values can't compose
// as a single box-shadow list.
export const FLOATING_MENU_STYLE: React.CSSProperties = {
  boxShadow: 'var(--shadow-cast)'
}

// The inset that detaches the card from the window edges. Used as padding on the
// dock column so the desk surface shows through the gap around the card.
export const FLOATING_MENU_INSET = 'fb-floating-inset pl-[10px] py-[10px] pr-[8px]'

// The same inset mirrored for a card docked on the RIGHT of the content, so the
// larger gap (10px) always faces the window edge and the smaller one (8px) faces
// the content. Used by the assistant panel; any future right-hand floating
// surface should use this rather than re-deriving the numbers.
export const FLOATING_MENU_INSET_RIGHT = 'fb-floating-inset pr-[10px] py-[10px] pl-[8px]'

// Resizable main sidebar width bounds, in px, measured on the dock column
// (card + inset). The MIN is deliberately generous so a narrowed menu still has
// room for a two-line label and can never be dragged down to where text clips
// to nothing. The MAX keeps the menu from eating the whole window.
export const SIDEBAR_MIN = 232
export const SIDEBAR_MAX = 480
export const SIDEBAR_DEFAULT = 272

const WIDTH_KEY = 'fb.sidebar.width'

function clampWidth(px: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, px))
}

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY)
    if (raw) {
      const n = Number(raw)
      if (Number.isFinite(n)) return clampWidth(n)
    }
  } catch {
    /* ignore */
  }
  return SIDEBAR_DEFAULT
}

// Drag-to-resize for the main sidebar. Returns the current column width, a
// setter used only by the drag handler, and a pointer-down handler to attach to
// the resize grip. The width is clamped to [MIN, MAX] and persisted so it
// survives reload. Uses pointer capture so the drag keeps tracking even when the
// cursor outruns the thin grip.
export function useSidebarWidth(): {
  width: number
  onResizeStart: (e: React.PointerEvent) => void
  nudge: (delta: number) => void
  resizing: boolean
} {
  const [width, setWidth] = useState<number>(() => loadWidth())
  const [resizing, setResizing] = useState(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      startX.current = e.clientX
      startW.current = width
      setResizing(true)
      const target = e.currentTarget as HTMLElement
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        /* not fatal — falls back to window listeners below */
      }
    },
    [width]
  )

  useEffect(() => {
    if (!resizing) return
    function onMove(e: PointerEvent): void {
      const next = clampWidth(startW.current + (e.clientX - startX.current))
      setWidth(next)
    }
    function onUp(): void {
      setResizing(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizing])

  // Persist whenever a drag settles.
  useEffect(() => {
    if (resizing) return
    try {
      localStorage.setItem(WIDTH_KEY, String(width))
    } catch {
      /* ignore */
    }
  }, [resizing, width])

  // Keyboard resize: arrow keys on the focused grip nudge the width. Persisted
  // by the effect above once the value settles.
  const nudge = useCallback((delta: number) => {
    setWidth((w) => clampWidth(w + delta))
  }, [])

  return { width, onResizeStart, nudge, resizing }
}

// Minimise / restore state for a menu, persisted per menu key so each surface
// remembers its own preference across reloads. When there is no stored
// preference the menu starts minimised on a small window so it does not cover
// the content, and open otherwise.
export function useMinimizable(
  key: string,
  opts: { responsiveBreakpoint?: number } = {}
): { minimized: boolean; minimize: () => void; restore: () => void; toggle: () => void } {
  const breakpoint = opts.responsiveBreakpoint ?? 860
  const [minimized, setMinimized] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === '1') return true
      if (raw === '0') return false
    } catch {
      /* ignore */
    }
    return typeof window !== 'undefined' && window.innerWidth < breakpoint
  })

  const persist = useCallback(
    (v: boolean) => {
      setMinimized(v)
      try {
        localStorage.setItem(key, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    [key]
  )

  return {
    minimized,
    minimize: () => persist(true),
    restore: () => persist(false),
    toggle: () => persist(!minimized)
  }
}

// The always-visible affordance shown when a menu is minimised. A small rounded
// pill that floats over the top-left of the content area; clicking it brings the
// menu back. Positioned absolutely, so its container must be relative.
export function MenuRestorePill({
  onClick,
  label = 'Menu',
  title = 'Show the menu'
}: {
  onClick: () => void
  label?: string
  title?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      data-testid="menu-restore-pill"
      className="fb-floating-chrome absolute top-[12px] left-[12px] z-20 inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-[12px] border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[12px] font-medium text-[var(--ink-80)] hover:text-[var(--ink-100)] hover:border-[rgb(var(--accent)/0.4)] transition-colors"
      style={FLOATING_MENU_STYLE}
    >
      <Icon name="menu" size={16} />
      <span>{label}</span>
    </button>
  )
}

// The minimise control that lives in a menu's header. A quiet icon button that
// collapses the menu to the restore pill.
export function MenuMinimizeButton({
  onClick,
  title = 'Minimise the menu'
}: {
  onClick: () => void
  title?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      data-testid="menu-minimize"
      className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-[var(--ink-40)] hover:text-[var(--ink-90)] hover:bg-[var(--surface-sunken)] transition-colors"
    >
      <Icon name="left_panel_close" size={16} />
    </button>
  )
}
