import { describe, it, expect } from 'vitest'
import { plexiId, isUuidV7, timestampOf } from '../../src/shared/plexiId'

// PLX-DOM-010: entity ids MUST be client-generable and time-ordered (UUIDv7),
// not v4. These tests are the traceability anchor for plx_dom_010 (DoD gate 13).

describe('plx_dom_010 — time-ordered UUIDv7 ids', () => {
  it('test_plx_dom_010_format: mints well-formed v7 (version 7, variant 8..b)', () => {
    for (let i = 0; i < 200; i++) {
      const id = plexiId()
      expect(isUuidV7(id)).toBe(true)
      expect(id[14]).toBe('7') // version nibble
      expect(['8', '9', 'a', 'b']).toContain(id[19].toLowerCase()) // variant
    }
  })

  it('test_plx_dom_010_unique: no collisions across a burst', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) seen.add(plexiId())
    expect(seen.size).toBe(5000)
  })

  it('test_plx_dom_010_time_ordered: lexicographic order matches mint order across ms', () => {
    const ids = [1000, 1001, 1002, 1500, 9_999_999, 1_800_000_000_000].map((ms) => plexiId(ms))
    const sorted = [...ids].sort()
    expect(sorted).toEqual(ids)
  })

  it('test_plx_dom_010_monotonic_within_ms: same-ms ids stay ordered via the counter', () => {
    const ms = 1_800_000_000_123
    const ids = Array.from({ length: 50 }, () => plexiId(ms))
    const sorted = [...ids].sort()
    expect(sorted).toEqual(ids)
    expect(new Set(ids).size).toBe(50)
  })

  it('test_plx_dom_010_timestamp: embeds the millisecond it was minted at', () => {
    const ms = 1_800_000_000_456
    expect(timestampOf(plexiId(ms))).toBe(ms)
  })

  it('test_plx_dom_010_rejects_v4: the old random-UUID shape is not a valid v7', () => {
    expect(isUuidV7('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(false)
  })
})
