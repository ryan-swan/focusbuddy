// The floating-menu material vocabulary, in a PLAIN module on purpose
// (Edges 1c): Fast Refresh cannot hold a module that mixes component and
// constant exports, so while these lived in floatingMenu.tsx every save of
// that file forced a full app reload under the dev server. Components and
// the width hook stay in floatingMenu.tsx; it re-exports these so existing
// imports keep working (the AI lane migrates its own on its cadence).
import type React from 'react'

// Material, not outline (Edges + Glass, 2026-08-23): the card sits on the
// radius law (--radius-card, like every other outer card) and its edge comes
// from FLOATING_MENU_STYLE's light recipe, not a 1px border. The menus are
// deliberately NOT glass: the dock column reserves their width, so nothing
// ever moves behind them and translucency would have nothing to reveal
// (APPLE-DOCTRINE R1.3; the glass law lives in tokens.css).
export const FLOATING_MENU_ASIDE =
  'fb-floating-chrome h-full w-full flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-raised)] text-[var(--ink-100)]'

// Same floating card, but the card itself scrolls. Used by the fixed-width
// segment and office menus whose whole body scrolls as one column (the rounded
// corners still clip the scrolled content because overflow is not visible).
export const FLOATING_MENU_ASIDE_SCROLL =
  'fb-floating-chrome h-full w-full flex flex-col overflow-auto rounded-[var(--radius-card)] bg-[var(--surface-raised)]'

// The glass variant (Edges + Glass Phase 1b, the full-bleed spike). Used ONLY
// while the desk canvas runs beneath the dock column: then content really
// does move behind the menu, which is the one condition under which the
// chrome glass tier earns its blur (R1.3). The tier's own border is the rim.
export const FLOATING_MENU_ASIDE_GLASS =
  'fb-floating-chrome h-full w-full flex flex-col overflow-hidden rounded-[var(--radius-card)] fb-glass-chrome border text-[var(--ink-100)]'
export const FLOATING_MENU_GLASS_STYLE: React.CSSProperties = {
  boxShadow: 'var(--shadow-cast), var(--shadow-inset-highlight)'
}

// The fb-card material recipe (globals.css): an alpha hairline ring so the
// card never melts into a same-luminance surface, the cast shadow for
// elevation, and the inset top highlight that reads as light striking the
// material. Applied inline because Tailwind arbitrary values can't compose
// a box-shadow list out of custom properties. Gemstone's own !important
// aside treatment still wins over this, by design.
export const FLOATING_MENU_STYLE: React.CSSProperties = {
  boxShadow: '0 0 0 1px var(--edge-hairline), var(--shadow-cast), var(--shadow-inset-highlight)'
}

// The inset that detaches the card from the window edges. Used as padding on the
// dock column so the desk surface shows through the gap around the card.
export const FLOATING_MENU_INSET = 'fb-floating-inset pl-[10px] py-[10px] pr-[8px]'

// The same inset mirrored for a card docked on the RIGHT of the content, so the
// larger gap (10px) always faces the window edge and the smaller one (8px) faces
// the content. Used by the assistant panel; any future right-hand floating
// surface should use this rather than re-deriving the numbers.
export const FLOATING_MENU_INSET_RIGHT = 'fb-floating-inset pr-[10px] py-[10px] pl-[8px]'

// Resizable main sidebar width bounds, in px, measured on the dock column.
export const SIDEBAR_MIN = 232
export const SIDEBAR_MAX = 480
