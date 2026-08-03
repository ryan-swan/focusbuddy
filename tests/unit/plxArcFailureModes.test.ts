import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// PLX-ARC-021 — every service documents its failure modes and recovery procedures
// before production deployment (§73). This is the maintainable gate: it fails if
// the doc goes missing, or if any of the real services loses its failure-mode or
// recovery coverage, so the documentation cannot silently rot.

const DOC = resolve(process.cwd(), 'docs/ops/failure-modes-and-recovery.md')

// The services that make up the local-first product and its sync surface.
const SERVICES = [
  'Event Store',
  'Workspace sync',
  'AI orchestrator',
  'Desk layout overlay',
  'Resume engine',
  'Context engine',
  'Presence'
]

describe('plx_arc_021 — failure modes and recovery are documented per service', () => {
  it('test_plx_arc_021_doc_exists_and_cites_the_requirement', () => {
    expect(existsSync(DOC)).toBe(true)
    const text = readFileSync(DOC, 'utf8')
    expect(text).toContain('PLX-ARC-021')
    expect(text.toLowerCase()).toContain('recovery')
  })

  it('test_plx_arc_021_every_service_has_failure_modes_and_recovery', () => {
    const text = readFileSync(DOC, 'utf8')
    // Split into `## ` sections and index them by heading.
    const sections = text.split(/\n## /).map((s, i) => (i === 0 ? s : '## ' + s))
    for (const svc of SERVICES) {
      const section = sections.find((s) => s.split('\n')[0].includes(svc))
      expect(section, `missing section for service: ${svc}`).toBeTruthy()
      expect(section!.toLowerCase(), `${svc}: no failure modes`).toContain('failure mode')
      expect(section!.toLowerCase(), `${svc}: no recovery`).toContain('recovery')
    }
  })
})
