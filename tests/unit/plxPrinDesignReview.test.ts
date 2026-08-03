import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// PLX-PRIN-006 — every feature design records which principles it advances and which
// it places under tension, with a mitigation for any under tension.
// PLX-UX-001 — every feature proposal states the cognitive load it removes, and one
// that adds capability without removing load is justified against §6 Philosophy 1.
// Both attach at design review, so both are gated on the design-review record.

const DOC = resolve(process.cwd(), 'docs/design-reviews.md')

// The features designed and reviewed this arc; each must carry a complete entry.
const REVIEWED = ['APP-012', 'APP-010 Phase 1', 'APP-010 Phase 2a']

describe('plx_prin_006 / plx_ux_001 — design reviews record principles + cognitive load', () => {
  it('test_plx_prin_006_record_exists_and_cites_both_requirements', () => {
    expect(existsSync(DOC)).toBe(true)
    const text = readFileSync(DOC, 'utf8')
    expect(text).toContain('PLX-PRIN-006')
    expect(text).toContain('PLX-UX-001')
  })

  it('test_plx_prin_006_each_reviewed_feature_records_principles_tension_and_mitigation', () => {
    const text = readFileSync(DOC, 'utf8')
    const sections = text.split(/\n## /).map((s, i) => (i === 0 ? s : '## ' + s))
    for (const feat of REVIEWED) {
      const section = sections.find((s) => s.split('\n')[0].includes(feat))
      expect(section, `no design-review entry for ${feat}`).toBeTruthy()
      const lower = section!.toLowerCase()
      expect(lower, `${feat}: no principles advanced`).toContain('principles advanced')
      expect(lower, `${feat}: no principle-under-tension + mitigation`).toContain('under tension')
      expect(lower, `${feat}: no mitigation`).toContain('mitigat')
    }
  })

  it('test_plx_ux_001_each_reviewed_feature_states_cognitive_load_removed', () => {
    const text = readFileSync(DOC, 'utf8')
    const sections = text.split(/\n## /).map((s, i) => (i === 0 ? s : '## ' + s))
    for (const feat of REVIEWED) {
      const section = sections.find((s) => s.split('\n')[0].includes(feat))!
      expect(section.toLowerCase(), `${feat}: no cognitive-load statement`).toContain('cognitive load')
    }
    // A capability-adding feature (Phase 2a) must carry the explicit Philosophy 1
    // justification UX-001 requires.
    const p2a = sections.find((s) => s.split('\n')[0].includes('Phase 2a'))!
    expect(p2a).toContain('Philosophy 1')
  })
})
