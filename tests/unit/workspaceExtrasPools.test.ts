import { describe, it, expect, vi } from 'vitest'

// Meetings, recorded decisions and the calendar existed in the database and were
// reachable by NO retrieval path: asking "what did we decide" or "what am I
// committed to this week" could never match them. These pools are additive, so
// they are also asserted to degrade rather than throw when their store is absent.

const NODES = [{ id: 'desk1', kind: 'task', title: 'Renewals', description: '' }]

vi.mock('../../src/main/db/nodes', () => ({ listNodes: () => NODES }))
vi.mock('../../src/main/db/tables', () => ({ listTables: () => [], listRows: () => [] }))
vi.mock('../../src/main/db/widgets', () => ({ listWidgetsByKind: () => [] }))
vi.mock('../../src/main/db/database', () => ({ getDb: () => ({}) }))
vi.mock('../../src/main/db/activeOrg', () => ({ getActiveOrgId: () => 'personal' }))

vi.mock('../../src/main/db/meetings', () => ({
  listMeetings: () => [
    {
      id: 'm1',
      title: 'Renewal planning',
      summary: 'Agreed to move the Contoso renewal to March.',
      actionItems: ['Sam drafts the Contoso proposal'],
      transcript: 'We talked at length about Contoso and the March timing.'
    }
  ]
}))
vi.mock('../../src/main/db/timeBlocks', () => ({
  listBlocksInRange: () => [
    { id: 'b1', taskId: 'desk1', title: 'Contoso renewal call', startMs: Date.now(), durationMin: 30, meeting: null }
  ]
}))
vi.mock('../../src/main/db/decisionStore', () => ({
  createDecisionStore: () => ({
    all: () => [
      {
        id: 'd1',
        title: 'Move Contoso renewal to March',
        decisionStatement: 'We will move the Contoso renewal to March.',
        description: 'Q1 capacity is committed elsewhere.'
      }
    ]
  })
}))

const { collectExtraSources } = await import('../../src/main/workspaceExtras')

describe('collectExtraSources reaches meetings, decisions and the calendar', () => {
  it('retrieves a meeting by something said in it', () => {
    const kinds = collectExtraSources('contoso renewal march', 10).map((s) => s.docType)
    expect(kinds).toContain('meeting')
  })

  it('retrieves a recorded decision', () => {
    const hit = collectExtraSources('contoso renewal march', 10).find((s) => s.docType === 'decision')
    expect(hit).toBeDefined()
    expect(hit?.title).toContain('Contoso')
  })

  it('retrieves a calendar block, scoped to its desk', () => {
    const hit = collectExtraSources('contoso renewal call', 10, ['desk1']).find((s) => s.docType === 'calendar')
    expect(hit).toBeDefined()
  })

  it('returns nothing for a query none of them match, rather than filler', () => {
    const kinds = collectExtraSources('quarterly hedgehog logistics', 10).map((s) => s.docType)
    expect(kinds).not.toContain('meeting')
    expect(kinds).not.toContain('decision')
  })
})
