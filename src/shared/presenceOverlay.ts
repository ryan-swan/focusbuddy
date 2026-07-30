// Presence overlay (spec §20.3, PLX-UX-023). Live Activity is an overlay modelled
// ORTHOGONALLY to Context Health: showing that someone is present on an Object never
// overwrites an Attention Required or Decision Risk state. Presence and health are
// two independent dimensions of the same Object.

import type { HealthState } from './contextHealth'

export interface ObjectSurfaceState {
  health: HealthState // the semantic state (may be attention-required / decision-risk)
  livePresent: boolean // the orthogonal presence overlay
}

// Applying presence changes only the overlay, never the health state (UX-023).
export function applyPresence(state: ObjectSurfaceState, present: boolean): ObjectSurfaceState {
  return { health: state.health, livePresent: present }
}

// Presence never suppresses an attention state: an Object that needs attention still
// reads as needing attention while someone is present on it.
export function healthWithPresence(state: ObjectSurfaceState): HealthState {
  return state.health // presence is orthogonal; it does not overwrite health
}
