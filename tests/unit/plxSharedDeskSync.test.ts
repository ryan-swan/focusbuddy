// The security-critical seams of per-desk shared sync, tested pure (the DB half —
// collectPendingShared / applyRemoteShared / stampSharedDesk — is exercised by the
// two-account e2e). sharedApplyVerdict is what stops a shared desk item from ever
// overwriting the recipient's own content or another desk's; rootsToPrune is what
// drops a desk after its access is revoked.

import { describe, it, expect } from 'vitest'
import { sharedApplyVerdict, rootsToPrune } from '../../src/main/db/workspaceSync'

describe('sharedApplyVerdict', () => {
  it('applies a brand-new item (no local row)', () => {
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: false, localRootId: null, localRev: null, incomingRev: 1 })
    ).toBe('apply')
  })

  it('applies a newer rev for an item already in the same desk', () => {
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: true, localRootId: 'D1', localRev: 3, incomingRev: 4 })
    ).toBe('apply')
  })

  it('REFUSES an item whose id collides with the recipient\'s own personal row', () => {
    // Local row exists but has no desk tag (personal content) — a crafted id must
    // never clobber it.
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: true, localRootId: null, localRev: 9, incomingRev: 99 })
    ).toBe('skip-foreign')
  })

  it('REFUSES an item that belongs to a DIFFERENT desk locally', () => {
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: true, localRootId: 'D2', localRev: 1, incomingRev: 50 })
    ).toBe('skip-foreign')
  })

  it('refuses an item that names no desk at all', () => {
    expect(
      sharedApplyVerdict({ incomingRootId: null, localExists: false, localRootId: null, localRev: null, incomingRev: 1 })
    ).toBe('skip-foreign')
  })

  it('suppresses an echo (local rev at or ahead of incoming) for the same desk', () => {
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: true, localRootId: 'D1', localRev: 5, incomingRev: 5 })
    ).toBe('skip-echo')
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: true, localRootId: 'D1', localRev: 6, incomingRev: 5 })
    ).toBe('skip-echo')
  })

  it('treats a null local rev as never-synced (applies)', () => {
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: true, localRootId: 'D1', localRev: null, incomingRev: 1 })
    ).toBe('apply')
  })

  it('foreign check wins over echo check (a colliding id at a higher rev is still refused)', () => {
    // Even though the incoming rev is lower, the row belongs to another desk, so it
    // must be refused as foreign, not silently echo-skipped.
    expect(
      sharedApplyVerdict({ incomingRootId: 'D1', localExists: true, localRootId: 'D2', localRev: 100, incomingRev: 1 })
    ).toBe('skip-foreign')
  })
})

describe('rootsToPrune', () => {
  it('prunes desks no longer in the granted set (a revoke)', () => {
    expect(rootsToPrune(['D1', 'D2', 'D3'], ['D1', 'D3'])).toEqual(['D2'])
  })
  it('keeps everything when the grant set still covers it', () => {
    expect(rootsToPrune(['D1', 'D2'], ['D1', 'D2', 'D9'])).toEqual([])
  })
  it('prunes all when access is fully revoked', () => {
    expect(rootsToPrune(['D1', 'D2'], [])).toEqual(['D1', 'D2'])
  })
  it('ignores empty/falsey local ids', () => {
    expect(rootsToPrune(['', 'D1'], [])).toEqual(['D1'])
  })
})
