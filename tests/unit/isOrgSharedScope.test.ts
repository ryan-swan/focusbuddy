// The routing predicate that decides whether opening a document goes through the
// CRDT co-editing path (org-shared) or the last-write-wins editor (personal). A
// wrong answer here is a data-safety bug: routing a personal doc as org-shared
// would create a live room under an org and expose it; routing an org doc as
// personal would reopen the clobber. Pure, so it is unit-tested directly.

import { describe, it, expect } from 'vitest'
import { isOrgSharedScope } from '@renderer/lib/docScope'
import { PERSONAL_ORG_ID } from '@renderer/stores/org'

describe('isOrgSharedScope', () => {
  it('treats a real org id as shared', () => {
    expect(isOrgSharedScope('org_abc123')).toBe(true)
  })

  it('treats the personal sentinel as not shared', () => {
    expect(isOrgSharedScope(PERSONAL_ORG_ID)).toBe(false)
  })

  it('treats null/undefined (legacy personal rows) as not shared', () => {
    expect(isOrgSharedScope(null)).toBe(false)
    expect(isOrgSharedScope(undefined)).toBe(false)
  })

  it('treats an empty string as not shared', () => {
    expect(isOrgSharedScope('')).toBe(false)
  })
})
