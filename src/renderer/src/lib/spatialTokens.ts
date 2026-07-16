/**
 * Plexi Spatial — JS-side token constants.
 *
 * These values mirror (and extend) the CSS custom properties in tokens.css.
 * CSS vars are the single source of truth for rendering; these constants
 * exist so Framer Motion animations, inline style calculations, and
 * conditional logic can reference the same vocabulary without magic numbers.
 *
 * Rule: if you add a value here, add the corresponding --spatial-* token
 * to tokens.css. If you add a --dur-* or --depth-* token to tokens.css,
 * mirror it here. The two files travel together.
 */

// ── Motion durations (ms) ─────────────────────────────────────────────────
// Mirrors --dur-* in tokens.css, plus the two spatial-specific additions.
//
// Use these as the `duration` param in Framer Motion variants rather than
// inline numbers, so timing changes propagate everywhere at once.

export const MOTION = {
  instant:    80,   // --dur-instant  — micro-feedback: checkbox, chip toggle
  quick:      160,  // --dur-quick    — button press, icon swap
  base:       240,  // --dur-base     — default: tooltip, badge
  slow:       420,  // --dur-slow     — panel slide, drawer
  cinematic:  720,  // --dur-cinematic — splash, onboarding
  spatial:    360,  // --dur-spatial  — primary spatial transitions: view enter, desk zoom
  slowReveal: 520,  // --dur-slow-reveal — environment reveal, ambient fade
} as const

// ── CSS easing strings ────────────────────────────────────────────────────
// Mirrors --ease-spring-* in tokens.css.
// Use these when applying transitions via inline `style` or non-Framer code.

export const EASING = {
  snap:  'cubic-bezier(0.32, 0.72, 0, 1)',    // --ease-spring-snap
  soft:  'cubic-bezier(0.34, 1.56, 0.64, 1)', // --ease-spring-soft
  glide: 'cubic-bezier(0.22, 1, 0.36, 1)',    // --ease-spring-glide
  crisp: 'cubic-bezier(0.45, 0, 0.15, 1)',    // --ease-spring-crisp
} as const

// Array form for Framer Motion's `ease` prop — same curves as EASING but as
// [x1, y1, x2, y2] bezier control points, which is what Framer Motion accepts.
export const EASING_FM = {
  snap:  [0.32, 0.72, 0, 1]    as [number, number, number, number],
  soft:  [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  glide: [0.22, 1, 0.36, 1]    as [number, number, number, number],
  crisp: [0.45, 0, 0.15, 1]    as [number, number, number, number],
} as const

// ── Framer Motion spring configs ──────────────────────────────────────────
// Pass these as `transition` in Framer Motion variants.
// Spring physics feel more natural than duration-based easing for spatial UI
// because they respond to interruption (a drag released mid-flight settles
// smoothly rather than jumping to the end position).

export const SPRING = {
  // Zero-overshoot decel — modal dismiss, toolbar collapse, button release
  snap: {
    type: 'spring' as const,
    stiffness: 320,
    damping: 32,
    mass: 1,
  },
  // Gentle overshoot — popover open, drawer slide, panel entrance
  soft: {
    type: 'spring' as const,
    stiffness: 280,
    damping: 22,
    mass: 1,
  },
  // Long-form decel — theme switch, ambient transitions, slow reveals
  glide: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 28,
    mass: 1.2,
  },
  // Instant snap — chip toggle, checkbox, icon swap
  crisp: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 36,
    mass: 0.8,
  },
  // Apple Stage Manager rhythm — desk card lift, room card hover
  // Source: StageManagerStrip.tsx, measured from Archeon research
  stage: {
    type: 'spring' as const,
    stiffness: 158,
    damping: 25,
    mass: 1,
  },
  // Widget hover lift — barely perceptible, light touch
  // The "object is aware of you" feeling. Fast in, fast out.
  lift: {
    type: 'spring' as const,
    stiffness: 340,
    damping: 30,
    mass: 0.85,
  },
  // View enter — zoom-in feel when entering a desk from the home page
  // Slightly slower than snap to give the spatial traversal weight.
  enter: {
    type: 'spring' as const,
    stiffness: 240,
    damping: 26,
    mass: 1,
  },
} as const

// ── Spatial color palette ─────────────────────────────────────────────────
// The Plexi Spatial environment palette. Mirrors --spatial-* in tokens.css.
// Hex values are for reference / Canvas/WebGL contexts.
// CSS contexts: use var(--spatial-blue), var(--spatial-cyan), etc.
// rgb() contexts: use var(--spatial-blue-rgb) for `rgb(var(--spatial-blue-rgb) / 0.1)`.

export const SPATIAL_COLOR = {
  // Dark navy environment — the desk surface and canvas ground
  environment:    '#070A12',
  environmentRgb: '7 10 18',

  // Electric blue — active state, focused objects, interactive accents
  activeBlue:    '#69B7FF',
  activeBlueRgb: '105 183 255',

  // Active cyan — secondary active accent, highlight, glow rings
  activeCyan:    '#7EF4FF',
  activeCyanRgb: '126 244 255',

  // Text ramp on dark environment
  textPrimary:   'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.58)',
  textMuted:     'rgba(255,255,255,0.32)',

  // Semantic — not accent-dependent, safe on any spatial surface
  success: '#34D399',
  warning: '#F5A623',
  danger:  '#F87171',
} as const

// ── Depth z-order layers ──────────────────────────────────────────────────
// Named z-index values so components declare their layer semantically.
// Mirrors --depth-* in tokens.css.
// Use these in inline style z-index props, not Tailwind z-* classes,
// so the layer system stays single-source.

export const DEPTH = {
  environment: 0,   // canvas background, desk surface
  objectRest:  10,  // widgets at rest on the canvas
  objectFocus: 20,  // focused / hovered widget lifts above peers
  uiRest:      30,  // sidebar, toolbar, breadcrumb, docks
  uiElevated:  40,  // floating panels, popovers, dropdowns
  overlay:     50,  // modal sheets, dialogs
  tooltip:     60,  // tooltips — always topmost
} as const

// ── Framer Motion variant helpers ─────────────────────────────────────────
// Pre-built initial/animate/exit variant sets for common spatial patterns.
// Use these directly in AnimatePresence wrappers rather than reinventing
// the animation per component.

export const VARIANTS = {
  // Standard view enter/exit (Phase 5 — routing layer)
  viewEnter: {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1, transition: SPRING.enter },
    exit:    { opacity: 0, scale: 0.97, transition: { ...SPRING.snap, duration: MOTION.quick / 1000 } },
  },

  // Widget hover lift (Phase 3 — WidgetFrame)
  widgetLift: {
    rest:  { y: 0,   scale: 1,     transition: SPRING.lift },
    hover: { y: -2,  scale: 1.004, transition: SPRING.lift },
    drag:  { y: -6,  scale: 1.02,  transition: SPRING.snap },
  },

  // Attention-reveal: element fades in from below on mount, slides out up on exit
  attentionReveal: {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0, transition: SPRING.soft },
    exit:    { opacity: 0, y: -2, transition: { ...SPRING.crisp, duration: MOTION.quick / 1000 } },
  },

  // Panel slide-in from right (popovers, side panels)
  slideInRight: {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0, transition: SPRING.soft },
    exit:    { opacity: 0, x: 8, transition: SPRING.snap },
  },
} as const
