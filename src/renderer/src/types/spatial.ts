/**
 * Plexi Spatial — shared type vocabulary.
 *
 * These types describe the interaction model that the spatial visual identity
 * applies consistently across every component. Using a shared type means a
 * component's focus states are not invented per-file — they are positioned in
 * a named model that every developer and every future phase can reason about.
 */

// ── Interaction states ───────────────────────────────────────────────────────
// The eight states a spatial component can occupy. Most components only need
// rest/hover/focus/active; the others are used by canvas objects and voice UI.

export type SpatialInteractionState =
  | 'rest'      // Idle. Controls hidden. Minimal visual weight.
  | 'proximity' // Cursor approaching but not yet hovering (pointer-tracking opt-in).
  | 'hover'     // Cursor directly over. Controls begin to reveal. Slight lift.
  | 'focus'     // Keyboard or programmatic focus. Full control bloom.
  | 'active'    // Pressed / mid-activation. Scale down + shadow compress.
  | 'dragging'  // Being repositioned. Lifted off surface, shadow lengthens.
  | 'listening' // Voice/AI command targeting this element. Pulse ring.
  | 'placing'   // Dragged from an external source, hovering over drop target.
  | 'disabled'  // Not interactive. Opacity reduced. Pointer events off.

// ── Depth layers ─────────────────────────────────────────────────────────────
// Named z-order tiers so components declare their layer semantically instead
// of hardcoding numbers. Mirrors the --depth-* tokens in tokens.css.

export type SpatialDepthLayer =
  | 'environment' // Canvas background, desk surface (z-index: 0)
  | 'objectRest'  // Widgets at rest (z-index: 10)
  | 'objectFocus' // Focused widget lifts above peers (z-index: 20)
  | 'uiRest'      // Toolbars, docks, sidebar, breadcrumb (z-index: 30)
  | 'uiElevated'  // Floating panels, popovers, dropdowns (z-index: 40)
  | 'overlay'     // Modal sheets, dialogs (z-index: 50)
  | 'tooltip'     // Tooltips — always topmost (z-index: 60)

// ── Component behavior descriptor ────────────────────────────────────────────
// Optional interface components can implement to declare their spatial
// behavior profile. Not enforced at runtime — used as documentation and
// as a guide for implementation decisions in Phase 3+.

export interface SpatialComponentBehavior {
  /** How the component renders at each interaction state */
  states: Partial<Record<SpatialInteractionState, {
    opacity?: number
    scale?: number
    translateY?: number  // px — positive is down, negative is up (lift)
    shadowLevel?: 'none' | 'soft' | 'cast' | 'deep'
  }>>

  /** Which depth layer this component sits on at rest */
  depthLayer: SpatialDepthLayer

  /**
   * Whether nearby elements should soften when this component gains focus.
   * Canvas widgets implement this — when one is focused, others recede.
   */
  dimmingRadius?: 'none' | 'local' | 'ambient'

  /**
   * Whether this component participates in the attention-reveal pattern:
   * controls hidden at rest, revealed on hover/focus.
   */
  attentionReveal?: boolean
}

// ── Motion profile ────────────────────────────────────────────────────────────
// Which spring personality a component should use for its primary interaction
// animation. Components pick one profile; finer overrides stay in the component.

export type SpatialMotionProfile =
  | 'snap'   // Zero-overshoot decel — button release, modal dismiss
  | 'soft'   // Gentle overshoot — popover open, panel slide
  | 'glide'  // Long-form decel — theme switch, ambient transitions
  | 'crisp'  // Instant snap — toggle, chip, checkbox
  | 'stage'  // Apple Stage Manager rhythm — desk card, room card
  | 'lift'   // Widget hover rise — barely perceptible, light
  | 'enter'  // View enter — spatial zoom-in feel
