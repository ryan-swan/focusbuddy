// The assistant's context corpus is built once per change, not once per turn.
//
// collectExtraSources walked every node, ran one listRows query PER TABLE, read
// every widget, meeting transcript and six weeks of calendar, and did it again
// for every message — including "thanks". On a real workspace that is ~170
// nodes, 127 row queries, 880 widgets and 139 document extractions before the
// model sees a word.
//
// The corpus is query-independent, so it is cached against a signature of the
// data it was built from. These tests pin both halves of that: it does not
// rebuild when nothing changed, and it DOES rebuild when something did.
import { describe, it, expect, vi, beforeEach } from 'vitest'

let nodeReads = 0
let rowQueries = 0
// The fake database behind the signature. Moving `stamp` is what a real insert
// or update would do to MAX(updated_at).
let stamp = 100

vi.mock('../../src/main/db/database', () => ({
  getDb: () => ({
    prepare: () => ({ get: () => ({ n: 1, m: stamp }) })
  })
}))
vi.mock('../../src/main/db/activeOrg', () => ({ getActiveOrgId: () => 'personal' }))
vi.mock('../../src/main/db/nodes', () => ({
  listNodes: () => {
    nodeReads++
    return [{ id: 'n1', kind: 'task', title: 'Quarterly pricing review', description: 'decide the new tiers' }]
  }
}))
vi.mock('../../src/main/db/tables', () => ({
  listTables: () => [],
  listRows: () => {
    rowQueries++
    return []
  },
  listAllRowsByTable: () => new Map()
}))
vi.mock('../../src/main/db/widgets', () => ({ listWidgetsByKind: () => [] }))
vi.mock('../../src/main/db/meetings', () => ({ listMeetings: () => [] }))
vi.mock('../../src/main/db/timeBlocks', () => ({ listBlocksInRange: () => [] }))
vi.mock('../../src/main/db/decisionStore', () => ({ createDecisionStore: () => ({ all: () => [] }) }))

const { collectExtraSources, _resetExtrasCache } = await import('../../src/main/workspaceExtras')

beforeEach(() => {
  _resetExtrasCache()
  nodeReads = 0
  rowQueries = 0
  stamp = 100
})

describe('the context corpus is cached', () => {
  it('builds once and serves later turns from the cache', () => {
    collectExtraSources('pricing', 6)
    collectExtraSources('pricing again', 6)
    collectExtraSources('thanks', 6)
    // Three turns, one build. This is the whole point: a reply as slight as
    // "thanks" used to pay for the entire workspace.
    expect(nodeReads).toBe(1)
  })

  it('rebuilds when the workspace actually changes', () => {
    collectExtraSources('pricing', 6)
    expect(nodeReads).toBe(1)
    stamp = 200 // something was written
    collectExtraSources('pricing', 6)
    expect(nodeReads).toBe(2)
  })

  it('still answers the same question the same way from cache', () => {
    const first = collectExtraSources('quarterly pricing review', 6)
    const second = collectExtraSources('quarterly pricing review', 6)
    expect(first.map((s) => s.docId)).toEqual(second.map((s) => s.docId))
    expect(first.length).toBeGreaterThan(0)
  })

  it('never runs a query per table', () => {
    collectExtraSources('anything', 6)
    // listAllRowsByTable replaced the N+1; listRows must not be called at all.
    expect(rowQueries).toBe(0)
  })
})
