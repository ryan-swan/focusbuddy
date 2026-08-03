import { create } from 'zustand'
import type { Pane, PaneCell, PaneSource, SplitRatios, SplitShape, SplitState } from '@shared/types'
import {
  addPaneTransition,
  removePaneTransition,
  defaultRatiosFor,
  findPaneForSource,
  MAX_PANES,
  MIN_RATIO
} from '../lib/splitGeometry'

// Session-local split state for Focus Mode (spec: docs/FOCUS-SPLIT-VIEW-SPEC.md).
// The store holds the LIVE arrangement; the deterministic geometry all lives in
// splitGeometry.ts (unit-tested) — this store is a thin, side-effecty wrapper
// that owns identity (pane ids), the active-pane pointer, and resize clamping.
//
// P1 exposes add/remove/setActive/reset so a temporary control can drive tiling
// before drag (P2) and resize (P3) land. `initFromWidget` seeds the first pane
// from whatever WidgetFocusMode currently focuses, so entering split is seamless.

function newPaneId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `pane-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

// Is the split "engaged"? A single pane is just today's plain focus view; two or
// more panes means the user is genuinely in split/fill mode. Kept as a derived
// helper so components don't re-derive the rule.
export function isSplitEngaged(state: SplitState): boolean {
  return state.panes.length >= 2
}

interface FocusSplitStore {
  state: SplitState
  // True once the user has entered split for the current focus session. Lets
  // WidgetFocusMode keep rendering its classic single-card path until the user
  // opts in (drags a 2nd tile / uses the temp control), then hand off to the grid.
  engaged: boolean

  // Seed pane 0 from the currently-focused widget (or any source). Idempotent for
  // the same source; resets ratios to single.
  initFromSource: (source: PaneSource) => void
  // Add a pane carrying `source`, optionally into a specific dropped cell. If the
  // source already occupies a pane (dup guard, spec §9.1) it's moved/activated,
  // not duplicated. No-op at MAX_PANES.
  addPane: (source: PaneSource, targetCell?: PaneCell) => void
  // Remove a pane by id; collapses the shape. Removing to 1 pane keeps the view
  // but marks it un-engaged (back to plain single).
  removePane: (paneId: string) => void
  // Focus a pane (keyboard target).
  setActivePane: (paneId: string) => void
  // Resize: set a divider ratio (clamped). `which` names the divider per shape.
  setRatio: (which: keyof SplitRatios, value: number) => void
  // Replace the whole state (used by saved-view load in P4).
  loadState: (shape: SplitShape, panes: Pane[], ratios: SplitRatios) => void
  // Tear down split (leaving focus mode / back to single).
  reset: () => void
}

const emptySingle: SplitState = { shape: 'single', panes: [], ratios: {}, activePaneId: '' }

export const useFocusSplitStore = create<FocusSplitStore>((set, get) => ({
  state: emptySingle,
  engaged: false,

  initFromSource: (source) => {
    const cur = get().state
    // If we already have exactly this single source, leave it (avoids churn on
    // every focus-mode re-render).
    if (
      cur.panes.length === 1 &&
      cur.panes[0].cell === 'C0' &&
      findPaneForSource(cur, source) === cur.panes[0].id
    ) {
      return
    }
    const id = newPaneId()
    set({
      state: {
        shape: 'single',
        panes: [{ id, cell: 'C0', source }],
        ratios: {},
        activePaneId: id
      },
      engaged: false
    })
  },

  addPane: (source, targetCell) => {
    const cur = get().state
    // Dup guard: a source already shown is moved/activated, not duplicated.
    const existing = findPaneForSource(cur, source)
    if (existing) {
      set({ state: { ...cur, activePaneId: existing } })
      return
    }
    // Seeding case: no panes yet → this becomes pane 0 (single).
    if (cur.panes.length === 0) {
      const id = newPaneId()
      set({
        state: { shape: 'single', panes: [{ id, cell: 'C0', source }], ratios: {}, activePaneId: id },
        engaged: false
      })
      return
    }
    if (cur.panes.length >= MAX_PANES) return
    const next = addPaneTransition(cur, source, newPaneId(), targetCell)
    set({ state: next, engaged: next.panes.length >= 2 })
  },

  removePane: (paneId) => {
    const cur = get().state
    const next = removePaneTransition(cur, paneId)
    set({ state: next, engaged: next.panes.length >= 2 })
  },

  setActivePane: (paneId) => {
    const cur = get().state
    if (!cur.panes.some((p) => p.id === paneId)) return
    set({ state: { ...cur, activePaneId: paneId } })
  },

  setRatio: (which, value) => {
    const cur = get().state
    const clamped = Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, value))
    set({ state: { ...cur, ratios: { ...cur.ratios, [which]: clamped } } })
  },

  loadState: (shape, panes, ratios) => {
    set({
      state: {
        shape,
        panes,
        ratios: defaultRatiosFor(shape, ratios),
        activePaneId: panes[0]?.id ?? ''
      },
      engaged: panes.length >= 2
    })
  },

  reset: () => set({ state: emptySingle, engaged: false })
}))
