// The pure merge seam of cloud-document sync: a batch of server changes becomes
// local apply actions — tombstones delete, live docs upsert. The IO (network +
// store + localStorage) is exercised by the server flow test and manually.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { planFromChanges, cloudDocsEnabled, setCloudDocsEnabled } from '@renderer/lib/cloudDocsSync'
import type { CloudDocument } from '@renderer/lib/cloudDocsClient'

function doc(over: Partial<CloudDocument>): CloudDocument {
  return {
    id: 'd1',
    docType: 'doc',
    title: 'T',
    body: {},
    rev: 1,
    deleted: false,
    createdAt: 0,
    updatedAt: 1,
    ...over
  }
}

describe('planFromChanges', () => {
  it('maps a live document to an upsert', () => {
    const plan = planFromChanges([doc({ id: 'a', title: 'Hi' })])
    expect(plan).toEqual([{ kind: 'upsert', doc: doc({ id: 'a', title: 'Hi' }) }])
  })

  it('maps a tombstone to a delete (by id only)', () => {
    const plan = planFromChanges([doc({ id: 'b', deleted: true, rev: 3 })])
    expect(plan).toEqual([{ kind: 'delete', id: 'b' }])
  })

  it('preserves order and handles a mixed batch', () => {
    const plan = planFromChanges([
      doc({ id: 'a' }),
      doc({ id: 'b', deleted: true }),
      doc({ id: 'c', docType: 'sheet' })
    ])
    expect(plan.map((p) => p.kind)).toEqual(['upsert', 'delete', 'upsert'])
    expect(plan[1]).toEqual({ kind: 'delete', id: 'b' })
  })

  it('returns an empty plan for no changes', () => {
    expect(planFromChanges([])).toEqual([])
  })
})

// Default-ON with opt-out (flipped 2026-07-08 so the mobile web app sees
// personal documents without a desktop settings hunt). Absent flag = on; only
// an explicit '0' (the Settings toggle unticked) disables.
describe('cloudDocsEnabled default', () => {
  // The unit environment is node (no real localStorage); back it with a Map so
  // the flag logic is exercised exactly as written.
  const backing = new Map<string, string>()
  beforeEach(() => {
    backing.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, String(v)),
      removeItem: (k: string) => void backing.delete(k)
    })
  })

  it('is on when the flag has never been touched', () => {
    expect(cloudDocsEnabled()).toBe(true)
  })

  it('opts out when the settings toggle is unticked', () => {
    setCloudDocsEnabled(false)
    expect(cloudDocsEnabled()).toBe(false)
  })

  it('opts back in when re-ticked', () => {
    setCloudDocsEnabled(false)
    setCloudDocsEnabled(true)
    expect(cloudDocsEnabled()).toBe(true)
  })

  it('treats the legacy explicit "1" as on', () => {
    localStorage.setItem('fb.clouddocs.enabled', '1')
    expect(cloudDocsEnabled()).toBe(true)
  })
})
