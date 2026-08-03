// Coverage guarantee for multi-workspace sync: every org membership syncs every
// cycle regardless of which workspace is active. The original implementation
// synced ONLY the active scope, which stranded desks in any workspace the user
// had not opened since sync shipped — other devices and the mobile web app saw
// an incomplete workspace.

import { describe, it, expect } from 'vitest'
import { orgSyncOrder } from '@renderer/lib/workspaceSync'

describe('orgSyncOrder', () => {
  it('includes every member org when personal is active', () => {
    expect(orgSyncOrder('personal', ['personal', 'org-a', 'org-b'])).toEqual(['org-a', 'org-b'])
  })

  it('puts the active org first, followed by the rest', () => {
    expect(orgSyncOrder('org-b', ['personal', 'org-a', 'org-b', 'org-c'])).toEqual(['org-b', 'org-a', 'org-c'])
  })

  it('never includes the personal pseudo-org (it has its own loop)', () => {
    expect(orgSyncOrder('personal', ['personal'])).toEqual([])
  })

  it('drops an active org the account no longer belongs to', () => {
    expect(orgSyncOrder('org-gone', ['personal', 'org-a'])).toEqual(['org-a'])
  })

  it('handles empty membership', () => {
    expect(orgSyncOrder('personal', [])).toEqual([])
  })
})
