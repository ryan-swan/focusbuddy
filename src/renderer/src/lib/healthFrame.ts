import type { HealthState } from '../stores/contextHealth'

// Per-widget Context Health frame (plexi-4.0, realises UX-022 at the Object level).
// A widget wears a coloured frame reflecting how it changed since the user's last
// visit, escalating by materiality (importance) and turning red when the change
// puts a Decision at risk. The palette matches ContextHealthBadge exactly so the
// desk strip and the widget frames speak the same colour language:
//   changed            -> sky (a non-material change while away)
//   attention-required -> amber (a material change, scored important)
//   decision-risk      -> rose (the change endangers a linked Decision)
//   current            -> no frame (a calm widget is not decorated)
//
// Colour is never the only cue (PLX-A11Y-004): each frame carries a corner dot and
// a descriptive label/title, so the state is distinguishable without colour.

export interface HealthFrameStyle {
  // Tailwind border-colour class for the frame overlay ring.
  border: string
  // Tailwind background class for the corner dot.
  dot: string
  // Human, screen-reader label describing the state.
  label: string
}

const STYLES: Record<Exclude<HealthState, 'current'>, HealthFrameStyle> = {
  changed: {
    border: 'border-sky-400/70',
    dot: 'bg-sky-500',
    label: 'Changed since your last visit'
  },
  'attention-required': {
    border: 'border-amber-400/80',
    dot: 'bg-amber-500',
    label: 'Needs attention: a material change since your last visit'
  },
  'decision-risk': {
    border: 'border-rose-500/80',
    dot: 'bg-rose-500',
    label: 'Decision at risk: a linked change may invalidate a decision'
  }
}

// The frame style for a health state, or null for `current` (no frame). When one
// or more Decisions are named, the decision-risk label names them so the frame
// says which decision, not just that one exists.
export function healthFrameStyle(
  state: HealthState,
  decisionTitles: string[] = []
): HealthFrameStyle | null {
  if (state === 'current') return null
  const base = STYLES[state]
  if (state === 'decision-risk' && decisionTitles.length) {
    const named = decisionTitles.slice(0, 2).join(', ')
    const more = decisionTitles.length > 2 ? ` and ${decisionTitles.length - 2} more` : ''
    return { ...base, label: `Decision at risk: ${named}${more}` }
  }
  return base
}
