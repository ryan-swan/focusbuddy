import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// PLX-APP-001 — every native application build records an ADR answering §76.3,
// reviewed before implementation.
// PLX-PRIN-003 — the platform must not position itself as a replacement for
// specialist applications; native builds are justified against the §76
// build-versus-integrate test and recorded in an ADR.
// Both are satisfied by the same ADR, so this gate checks it answers all three
// §76.3 questions and records the positioning + the rejection of invalid reasons.

const ADR = resolve(process.cwd(), 'docs/adr/ADR-0007-native-applications-build-vs-integrate.md')

describe('plx_app_001 / plx_prin_003 — native-app build-versus-integrate ADR', () => {
  it('test_plx_app_001_adr_exists_and_cites_requirements', () => {
    expect(existsSync(ADR)).toBe(true)
    const text = readFileSync(ADR, 'utf8')
    expect(text).toContain('PLX-APP-001')
    expect(text).toContain('PLX-PRIN-003')
    expect(text).toContain('76.3')
  })

  it('test_plx_app_001_adr_answers_all_three_build_vs_integrate_questions', () => {
    const text = readFileSync(ADR, 'utf8').toLowerCase()
    // The three §76.3 questions.
    expect(text).toContain('contextual continuity') // Q1: events no external API exposes
    expect(text).toContain('first-class graph participant') // Q2: graph participation
    expect(text).toContain('absent from the market') // Q3: no integration target
    // At least one affirmative is recorded.
    expect(text).toContain('affirmative')
  })

  it('test_plx_prin_003_records_positioning_and_rejects_invalid_justifications', () => {
    const text = readFileSync(ADR, 'utf8').toLowerCase()
    expect(text).toContain('not position itself as a replacement')
    // §76.3 says cost / licensing / owning the surface are NOT valid; the ADR must
    // explicitly reject them.
    expect(text).toContain('cost')
    expect(text).toContain('licensing')
    expect(text).toContain('own the surface')
  })
})
