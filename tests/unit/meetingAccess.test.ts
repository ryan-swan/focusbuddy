import { describe, it, expect } from 'vitest'
import { accessToShare, MEETING_ACCESS_OPTIONS } from '../../src/renderer/src/lib/meetingAccess'

// The mapping from a meeting access level to the share scope + expiry that the
// artifact is shared at. These are the guarantees the meeting-sharing feature
// rests on, so they are pinned here.
describe('accessToShare', () => {
  const endsAt = 1_000_000_000_000

  it('view-once grants read-only that expires after the meeting', () => {
    const r = accessToShare('view-once', endsAt)
    expect(r.scope).toBe('view')
    // Expires after the meeting end, with a grace window (never before it).
    expect(r.expiresAt).not.toBeNull()
    expect(r.expiresAt as number).toBeGreaterThan(endsAt)
  })

  it('view-always grants read-only that never expires', () => {
    const r = accessToShare('view-always', endsAt)
    expect(r.scope).toBe('view')
    expect(r.expiresAt).toBeNull()
  })

  it('collaborate grants an editable copy that does not expire on its own', () => {
    const r = accessToShare('collaborate', endsAt)
    expect(r.scope).toBe('copy')
    expect(r.expiresAt).toBeNull()
  })

  it('offers exactly the three levels, each with a label and hint', () => {
    expect(MEETING_ACCESS_OPTIONS.map((o) => o.level)).toEqual(['view-once', 'view-always', 'collaborate'])
    for (const opt of MEETING_ACCESS_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0)
      expect(opt.hint.length).toBeGreaterThan(0)
    }
  })
})
