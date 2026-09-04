import { describe, it, expect } from 'vitest'
import { growTarget, GROW_MAX_HEIGHT } from '../../src/renderer/src/lib/useGrowToFit'

// The rule a widget uses to size itself to its own content. Extracted from
// StickyWidget, which was the only widget that did this, so every content
// widget can share it — and so the rules can actually be asserted.

describe('growTarget', () => {
  it('grows by exactly what overflows', () => {
    // 200 tall, content needs 320 → overflow 120 → 320.
    expect(growTarget(200, 320, 200, 640)).toBe(320)
  })

  it('never shrinks: content that fits leaves the widget alone', () => {
    expect(growTarget(400, 200, 400, 640)).toBeNull()
    expect(growTarget(400, 400, 400, 640)).toBeNull()
  })

  it('ignores sub-threshold overflow so a border does not nudge it', () => {
    expect(growTarget(200, 203, 200, 640)).toBeNull()
    expect(growTarget(200, 205, 200, 640)).toBe(205)
  })

  it('caps growth so a runaway paste cannot swallow the desk', () => {
    expect(growTarget(200, 99999, 200, 640)).toBe(640)
  })

  it('does nothing once the widget is already at or past the cap', () => {
    expect(growTarget(640, 99999, 640, 640)).toBeNull()
    // A user who resized beyond the cap keeps their size.
    expect(growTarget(900, 99999, 900, 640)).toBeNull()
  })

  it('refuses to measure an element that has not been laid out', () => {
    // clientHeight 0 would read as "the whole content overflows" and jump to the cap.
    expect(growTarget(200, 5000, 0, 640)).toBeNull()
  })

  it('returns whole pixels', () => {
    const t = growTarget(200, 320.6, 200.2, 640)
    expect(t).not.toBeNull()
    expect(Number.isInteger(t)).toBe(true)
  })

  it('uses each kind ceiling from the shared table', () => {
    expect(growTarget(200, 99999, 200, GROW_MAX_HEIGHT.sticky)).toBe(640)
    expect(growTarget(200, 99999, 200, GROW_MAX_HEIGHT.markdown)).toBe(900)
  })
})
