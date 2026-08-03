import { describe, it, expect, beforeEach } from 'vitest'

// In-memory localStorage shim (the test env has none).
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0
} as Storage

import { recordViewVisit, recentModuleKeys, recencyRank } from '../../src/renderer/src/lib/viewRecency'

// Recency drives which modules the command palette promotes: most-recent first,
// deduped, and only real module kinds (never an entity view like a task).

beforeEach(() => store.clear())

describe('viewRecency', () => {
  it('records module visits most-recent-first and dedupes', () => {
    recordViewVisit('reports')
    recordViewVisit('flows')
    recordViewVisit('reports') // revisit moves it back to front
    expect(recentModuleKeys()).toEqual(['reports', 'flows'])
  })
  it('ignores non-module (entity) view kinds', () => {
    recordViewVisit('task')
    recordViewVisit('document')
    recordViewVisit('project-dashboard')
    expect(recentModuleKeys()).toEqual([])
  })
  it('reports a recency rank, -1 when unseen', () => {
    recordViewVisit('forms')
    recordViewVisit('files')
    expect(recencyRank('files')).toBe(0) // most recent
    expect(recencyRank('forms')).toBe(1)
    expect(recencyRank('mail')).toBe(-1)
  })
})
