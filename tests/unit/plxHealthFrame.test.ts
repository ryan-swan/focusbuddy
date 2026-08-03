import { describe, it, expect } from 'vitest'
import { healthFrameStyle } from '../../src/renderer/src/lib/healthFrame'

// Per-widget Context Health frame mapping (plexi-4.0, UX-022 at the Object level).
// A widget's frame colour escalates by state, and a decision-risk frame names the
// decision(s) it endangers. `current` shows no frame so a calm widget is undecorated.

describe('plx_ux_022 — per-widget context-health frame mapping', () => {
  it('test_plx_ux_022_current_has_no_frame', () => {
    expect(healthFrameStyle('current')).toBeNull()
  })

  it('test_plx_ux_022_frame_escalates_by_state', () => {
    const changed = healthFrameStyle('changed')!
    const attention = healthFrameStyle('attention-required')!
    const risk = healthFrameStyle('decision-risk')!
    // Distinct colour per state, matching the ContextHealthBadge palette.
    expect(changed.border).toContain('sky')
    expect(attention.border).toContain('amber')
    expect(risk.border).toContain('rose')
    // Every state carries a non-empty label (the non-colour cue for A11Y-004).
    for (const s of [changed, attention, risk]) expect(s.label.length).toBeGreaterThan(0)
  })

  it('test_plx_ux_022_decision_risk_names_the_decisions', () => {
    const named = healthFrameStyle('decision-risk', ['Q3 pricing', 'Vendor choice'])!
    expect(named.label).toContain('Q3 pricing')
    expect(named.label).toContain('Vendor choice')
    // More than two decisions collapse to a count rather than an endless list.
    const many = healthFrameStyle('decision-risk', ['A', 'B', 'C', 'D'])!
    expect(many.label).toContain('and 2 more')
    // Non-risk states ignore decision titles.
    expect(healthFrameStyle('changed', ['A']).label).not.toContain('A')
  })
})
