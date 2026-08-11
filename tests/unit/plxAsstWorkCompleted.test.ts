// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { generateWorkCompleted, classifyEvent } from '../../src/main/assistant/workCompleted'

// The Work-Completed engine is the workspace-wide, look-back half of the assistant
// catch-up duo. These lock its guarantees: it reports ONLY real logged completions
// (no fabricated "done"), scopes correctly by actor/org, and advances the cursor
// incrementally exactly like Resume.

function setup() {
  const db = memSqlDb()
  const es = createEventStore(db)
  return { db, es }
}
// Minimal event; override actor/org/desk per case.
function ev(
  objectId: string,
  type: string,
  over: { actor?: string; organisationId?: string; deskId?: string } = {}
) {
  return {
    eventType: type,
    category: 'user' as const,
    actor: over.actor ?? 'user:sam',
    organisationId: over.organisationId ?? 'org',
    deskId: over.deskId ?? null,
    objectId,
    changeSummary: `${type} ${objectId}`
  }
}

describe('classifyEvent', () => {
  it('maps event-type substrings to change kinds', () => {
    expect(classifyEvent('TaskCompleted')).toBe('completed')
    expect(classifyEvent('DeskCreated')).toBe('created')
    expect(classifyEvent('DocUpdated')).toBe('updated')
    expect(classifyEvent('WidgetDeleted')).toBe('deleted')
    expect(classifyEvent('PresenceChanged')).toBe('other')
  })
})

describe('generateWorkCompleted', () => {
  it('reports only completions, with context counts for other changes', () => {
    const { db, es } = setup()
    es.append(ev('t1', 'TaskCompleted'))
    es.append(ev('t2', 'TaskCompleted'))
    es.append(ev('d1', 'DeskCreated'))
    es.append(ev('doc1', 'DocumentUpdated'))
    es.append(ev('w1', 'WidgetDeleted'))
    const d = generateWorkCompleted(db, { sinceCursor: -1, scope: { kind: 'all' } })
    expect(d.completed.map((c) => c.objectId).sort()).toEqual(['t1', 't2'])
    expect(d.createdCount).toBe(1)
    expect(d.updatedCount).toBe(1)
    expect(d.deletedCount).toBe(1)
    expect(d.summaryLine).toContain('2 tasks completed')
  })

  it('never invents a completion — empty window says so honestly', () => {
    const { db } = setup()
    const d = generateWorkCompleted(db, { sinceCursor: -1, scope: { kind: 'all' } })
    expect(d.completed).toEqual([])
    expect(d.summaryLine).toBe('Nothing new since the last digest.')
  })

  it('personal scope only counts my completions', () => {
    const { db, es } = setup()
    es.append(ev('t1', 'TaskCompleted', { actor: 'user:sam' }))
    es.append(ev('t2', 'TaskCompleted', { actor: 'user:ben' }))
    const mine = generateWorkCompleted(db, { sinceCursor: -1, scope: { kind: 'personal', actor: 'user:sam' } })
    expect(mine.completed.map((c) => c.objectId)).toEqual(['t1'])
  })

  it('team scope counts the whole org, across members', () => {
    const { db, es } = setup()
    es.append(ev('t1', 'TaskCompleted', { actor: 'user:sam', organisationId: 'orgA' }))
    es.append(ev('t2', 'TaskCompleted', { actor: 'user:ben', organisationId: 'orgA' }))
    es.append(ev('t3', 'TaskCompleted', { actor: 'user:zoe', organisationId: 'orgB' }))
    const team = generateWorkCompleted(db, { sinceCursor: -1, scope: { kind: 'team', organisationId: 'orgA' } })
    expect(team.completed.map((c) => c.objectId).sort()).toEqual(['t1', 't2'])
  })

  it('is incremental: a second run from the prior toCursor sees only new completions', () => {
    const { db, es } = setup()
    es.append(ev('t1', 'TaskCompleted'))
    const first = generateWorkCompleted(db, { sinceCursor: -1, scope: { kind: 'all' } })
    expect(first.completed.map((c) => c.objectId)).toEqual(['t1'])
    es.append(ev('t2', 'TaskCompleted'))
    const second = generateWorkCompleted(db, { sinceCursor: first.toCursor, scope: { kind: 'all' } })
    expect(second.completed.map((c) => c.objectId)).toEqual(['t2'])
    expect(second.toCursor).toBeGreaterThan(first.toCursor)
  })

  it('ignores low-value event types', () => {
    const { db, es } = setup()
    es.append(ev('o1', 'ContextHealthChanged'))
    es.append(ev('o1', 'MaterialityScored'))
    es.append(ev('t1', 'TaskCompleted'))
    const d = generateWorkCompleted(db, { sinceCursor: -1, scope: { kind: 'all' } })
    expect(d.completed.map((c) => c.objectId)).toEqual(['t1'])
    expect(d.updatedCount).toBe(0)
  })

  it('respects the display limit without distorting counts', () => {
    const { db, es } = setup()
    for (let i = 0; i < 5; i++) es.append(ev(`t${i}`, 'TaskCompleted'))
    const d = generateWorkCompleted(db, { sinceCursor: -1, scope: { kind: 'all' }, limit: 2 })
    expect(d.completed).toHaveLength(2)
    expect(d.summaryLine).toContain('5 tasks completed')
  })
})
