import { create } from 'zustand'

// A registry of the floating menus and popovers that are open right now: the
// desk control pill's fly-out, the canvas context menu, and any other menu that
// opts in. Two parts of the app read it.
//
// The canvas edge-pan reads whether ANY menu is open and stands down entirely
// while one is, so the camera never scrolls out from under a menu the user is
// reaching for. Pointer-over suppression alone was not enough, because a menu
// that sits near a screen edge is reached by moving the cursor toward that edge,
// which is exactly what used to start the pan.
//
// Menu placement reads the other open menus' rects so a newly opened menu can
// keep clear of them (the "anti-magnetic" behaviour: menus avoid overlapping
// each other) instead of stacking on top.
//
// Each menu registers on open with a stable id and its on-screen rect, refreshes
// the rect as it moves or resizes, and unregisters on close. Unregistering from
// a useEffect cleanup is the guard against a menu that unmounts without firing a
// close handler leaving edge-pan stuck off.

export interface MenuRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface OverlayStore {
  menus: Record<string, MenuRect | null>
  openMenu: (id: string, rect?: MenuRect | null) => void
  closeMenu: (id: string) => void
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  menus: {},
  openMenu: (id, rect = null) =>
    set((s) => ({ menus: { ...s.menus, [id]: rect } })),
  closeMenu: (id) =>
    set((s) => {
      if (!(id in s.menus)) return s
      const next = { ...s.menus }
      delete next[id]
      return { menus: next }
    })
}))

// True when at least one menu is open. This is the input the edge-pan disable
// reads, so it re-renders only when the open/closed state actually flips.
export const selectAnyMenuOpen = (s: OverlayStore): boolean => Object.keys(s.menus).length > 0

// The rects of every open menu except the one asking (used to avoid overlap).
export function otherMenuRects(menus: Record<string, MenuRect | null>, exceptId: string): MenuRect[] {
  const out: MenuRect[] = []
  for (const [id, rect] of Object.entries(menus)) {
    if (id === exceptId || !rect) continue
    out.push(rect)
  }
  return out
}
