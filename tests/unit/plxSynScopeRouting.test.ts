import { describe, it, expect } from 'vitest'
import { crdtScopeSuffix } from '../../src/renderer/src/lib/syncFlags'

// WS01 cross-account substrate — the pure scope-routing decision. The renderer is
// single-org-at-a-time, so the active workspace alone determines an object's
// partition: a real org routes to the shared org partition (all members converge),
// personal routes to the account's own devices. A bug here would mis-route data
// across scopes, so it is pinned directly.

describe('plx_syn — cross-account scope routing', () => {
  it('a real active org routes to the org scope (shared across members)', () => {
    expect(crdtScopeSuffix('org_abc', 'acct_1')).toBe('org:org_abc')
    // The prefix the engine prepends makes e.g. w:org:org_abc — the same partition
    // every member of org_abc joins.
  })

  it('the personal workspace routes to the account scope (this account only)', () => {
    expect(crdtScopeSuffix('personal', 'acct_1')).toBe('acct:acct_1')
  })

  it('null / undefined active org falls back to the account scope', () => {
    expect(crdtScopeSuffix(null, 'acct_1')).toBe('acct:acct_1')
    expect(crdtScopeSuffix(undefined, 'acct_1')).toBe('acct:acct_1')
  })

  it('two accounts in the same org share ONE partition; personal stays isolated', () => {
    // Cross-account convergence: A and B (different accounts) in org_x land on the
    // same room, so their edits meet.
    expect(crdtScopeSuffix('org_x', 'acct_A')).toBe(crdtScopeSuffix('org_x', 'acct_B'))
    // But their personal scopes never collide.
    expect(crdtScopeSuffix('personal', 'acct_A')).not.toBe(crdtScopeSuffix('personal', 'acct_B'))
  })
})
