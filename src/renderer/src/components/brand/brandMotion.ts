// The brand-motion policy as a pure state machine (Brand Motion mission,
// 2026-08-23). Caleb's ruling: the mark is STATIC at rest — it animates only
// at moments of meaning (one blink cycle on mount, motion while hovered) and
// never loops ambiently in chrome. The kit's 3.0s cycle opens and closes on
// the exact static logo, so the only correctness rule that matters here is:
// START anywhere, STOP only on a cycle boundary — then freezing is invisible.
//
// Pure functions so the policy is unit-testable without DOM or React; the
// PlexiiMark wrapper wires these to pointer events and one setTimeout.
// prefers-reduced-motion needs no handling here: the SVG's own CSS freezes it.

export const CYCLE_MS = 3000

export type BrandMotionMode =
  | 'off' // never animates (documents, exports, print)
  | 'once' // one cycle on mount, then frozen forever
  | 'hover' // frozen until hovered; runs whole cycles while hovered
  | 'once+hover' // both: the default for chrome marks
  | 'loop' // continuous (hero surfaces only — onboarding, sign-in)

export interface BrandMotionState {
  animating: boolean
  hovered: boolean
}

/** Timer request: run a cycle-boundary check after this many ms. */
export type Next = { state: BrandMotionState; timerMs: number | null }

const wantsOnce = (m: BrandMotionMode): boolean => m === 'once' || m === 'once+hover'
const wantsHover = (m: BrandMotionMode): boolean => m === 'hover' || m === 'once+hover'

export function initial(mode: BrandMotionMode): Next {
  if (mode === 'loop') return { state: { animating: true, hovered: false }, timerMs: null }
  if (wantsOnce(mode)) return { state: { animating: true, hovered: false }, timerMs: CYCLE_MS }
  return { state: { animating: false, hovered: false }, timerMs: null }
}

export function pointerEnter(s: BrandMotionState, mode: BrandMotionMode): Next {
  if (!wantsHover(mode)) return { state: s, timerMs: null }
  if (s.animating) return { state: { ...s, hovered: true }, timerMs: null } // ride the current cycle
  return { state: { animating: true, hovered: true }, timerMs: CYCLE_MS }
}

export function pointerLeave(s: BrandMotionState, mode: BrandMotionMode): Next {
  if (!wantsHover(mode)) return { state: s, timerMs: null }
  // Never stop mid-cycle: the running timer's boundary check does the freeze.
  return { state: { ...s, hovered: false }, timerMs: null }
}

/** The cycle-boundary check: keep rolling while hovered, else settle. */
export function cycleEnd(s: BrandMotionState, mode: BrandMotionMode): Next {
  if (mode === 'loop') return { state: s, timerMs: null }
  if (s.hovered && wantsHover(mode)) return { state: s, timerMs: CYCLE_MS }
  return { state: { ...s, animating: false }, timerMs: null }
}
