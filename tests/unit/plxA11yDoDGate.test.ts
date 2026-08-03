import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// PLX-A11Y-008 — accessibility review is a blocking item in the Definition of Done
// (§74); a feature MUST NOT be marked done with an open Level AA defect. The gate is
// two-part: the DoD records accessibility as blocking, AND the automated AA check it
// points at actually exists and enforces zero serious/critical, so the block is real
// rather than a written promise.

const DOD = resolve(process.cwd(), 'docs/definition-of-done.md')
const AXE_GATE = resolve(process.cwd(), 'tests/e2e/plxA11yWcagZoom.spec.ts')

describe('plx_a11y_008 — accessibility is a blocking Definition-of-Done item', () => {
  it('test_plx_a11y_008_dod_records_accessibility_as_blocking', () => {
    expect(existsSync(DOD)).toBe(true)
    const text = readFileSync(DOD, 'utf8').toLowerCase()
    expect(text).toContain('blocking')
    expect(text).toContain('accessibility')
    expect(text).toContain('level aa defect')
  })

  it('test_plx_a11y_008_automated_aa_gate_exists_and_enforces_zero_serious_critical', () => {
    // The DoD's block is only real if the automated check it names exists and fails
    // on serious/critical AA violations.
    expect(existsSync(AXE_GATE)).toBe(true)
    const gate = readFileSync(AXE_GATE, 'utf8')
    expect(gate).toContain('serious')
    expect(gate).toContain('critical')
    expect(gate.toLowerCase()).toContain('wcag')
  })
})
