import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectionFingerprint } from '../../src/renderer/src/lib/useLiveDeskPublisher'

// A published desk climbed ten revisions every twenty seconds with nobody
// touching the app.
//
// Two causes, one symptom. The resolver object was rebuilt on every render, so
// the `build` callback was a new function every render, so the publish effect
// re-ran, set state, and re-rendered -- a loop running as fast as React would
// let it. And nothing compared the result: buildProjection stamps a fresh
// `publishedAt` every time, so even an identical desk serialised differently
// and looked like a change.

describe('projectionFingerprint', () => {
  const base = {
    schema: 'plexi.public-desk',
    version: 1,
    deskId: 'd1',
    title: 'Desk',
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    widgets: [],
    links: [],
    assets: []
  }

  it('ignores the publish timestamp, which changes on every build', () => {
    expect(projectionFingerprint({ ...base, publishedAt: 1 })).toBe(
      projectionFingerprint({ ...base, publishedAt: 999_999 })
    )
  })

  it('ignores the revision, which is the server\'s to assign', () => {
    expect(projectionFingerprint({ ...base, revision: 1 })).toBe(
      projectionFingerprint({ ...base, revision: 226 })
    )
  })

  it('still notices a real change', () => {
    const a = projectionFingerprint({ ...base, publishedAt: 1 })
    const b = projectionFingerprint({ ...base, publishedAt: 2, title: 'Renamed' })
    expect(a).not.toBe(b)
  })

  it('notices a widget edit', () => {
    const w = (body: string): unknown => ({
      ...base,
      publishedAt: 1,
      widgets: [{ id: 'w1', render: { type: 'text', body, format: 'plain' } }]
    })
    expect(projectionFingerprint(w('before'))).not.toBe(projectionFingerprint(w('after')))
  })

  it('is empty for nothing, rather than throwing', () => {
    expect(projectionFingerprint(null)).toBe('')
  })
})

describe('the publisher does not loop', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'src', 'renderer', 'src', 'lib', 'useLiveDeskPublisher.ts'),
    'utf8'
  )

  it('memoises the resolvers so `build` keeps its identity', () => {
    // A fresh object literal here is what started the loop.
    expect(src).toContain('return useMemo(')
    expect(src).toContain('[cache]')
  })

  it('skips a republish when the desk has not changed', () => {
    expect(src).toContain('if (fingerprint === lastSentRef.current) return')
  })

  it('still lets an explicit "Publish now" through', () => {
    const publishNow = src.slice(src.indexOf('publishNow: async () => {'))
    expect(publishNow.slice(0, 400)).toContain('lastSentRef.current = projectionFingerprint(projection)')
  })
})
