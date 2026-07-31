import { describe, it, expect } from 'vitest'
import { ASSISTANT_CAPABILITIES } from '../../src/renderer/src/lib/assistantCapabilities'

// The capability row's honesty contract (P8). The primary lock is the type
// system — `kinds` is typed against the ActionProposal union, so an invented
// kind fails typecheck. These tests lock the runtime shape: no capability
// without at least one real backing kind, no kind claimed twice, no duplicate
// labels.

describe('ASSISTANT_CAPABILITIES — honest, backed, non-duplicated', () => {
  it('every capability is backed by at least one real proposal kind', () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      expect(c.kinds.length, `"${c.label}" claims no backing kinds`).toBeGreaterThan(0)
      expect(c.label.trim().length).toBeGreaterThan(0)
      expect(c.icon.trim().length).toBeGreaterThan(0)
    }
  })

  it('no proposal kind is claimed by two capabilities', () => {
    const seen = new Map<string, string>()
    for (const c of ASSISTANT_CAPABILITIES) {
      for (const k of c.kinds) {
        expect(seen.has(k), `kind "${k}" claimed by both "${seen.get(k)}" and "${c.label}"`).toBe(
          false
        )
        seen.set(k, c.label)
      }
    }
  })

  it('labels are unique', () => {
    const labels = ASSISTANT_CAPABILITIES.map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
