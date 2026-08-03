// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import {
  generateResume,
  withAiSummary,
  diffResume,
  removeNoise,
  estimateCatchup,
  collectEvents,
  type ResumeEventLike
} from '../../src/main/resume/resume'

// Resume Engine (spec §39, §52, §81). Deterministic, source-traceable,
// incremental, model-optional.

function setup() {
  const db = memSqlDb()
  const es = createEventStore(db)
  return { db, es }
}
function ev(objectId: string, type: string) {
  return { eventType: type, category: 'user' as const, actor: 'user:sam', organisationId: 'org', objectId, changeSummary: `${type} ${objectId}` }
}

describe('plx_res_002 — every Resume assertion is traceable to Events', () => {
  it('test_plx_res_002_changes_carry_source_event_ids', () => {
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskCreated'))
    es.append(ev('desk-1', 'DeskUpdated'))
    const r = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1 })
    expect(r.sourceEventIds.length).toBe(2)
    for (const g of r.groups) for (const c of g.changes) expect(c.eventIds.length).toBeGreaterThan(0)
  })
})

describe('plx_res_010 — generation is incremental against a cursor', () => {
  it('test_plx_res_010_only_events_after_cursor', () => {
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskCreated'))
    const first = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1 })
    // Next Resume starts from the prior toCursor — the first event is not reprocessed.
    es.append(ev('desk-1', 'DeskUpdated'))
    const second = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: first.toCursor })
    expect(second.sourceEventIds.length).toBe(1)
    expect(second.fromCursor).toBe(first.toCursor)
  })
})

describe('plx_res_011 / plx_res_013 / plx_res_021 — complete without a model', () => {
  it('test_plx_res_021_structured_resume_needs_no_model', () => {
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskUpdated'))
    const r = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1 })
    // A full, renderable Resume with no AI stage run.
    expect(r.aiSummary).toBeNull()
    expect(r.summary.length).toBeGreaterThan(0)
    expect(r.groups.length).toBe(1)
    expect(r.recommendedActions.length).toBeGreaterThan(0)
  })
  it('test_plx_res_013_ai_summary_is_additive_only', () => {
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskUpdated'))
    const base = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1 })
    const augmented = withAiSummary(base, 'You picked up where the pricing work left off.')
    // Structure is untouched; only aiSummary is added.
    expect(augmented.aiSummary).toContain('pricing')
    expect(augmented.summary).toBe(base.summary)
    expect(augmented.groups).toEqual(base.groups)
  })
})

describe('plx_res_023 — noise removal is reversible', () => {
  it('test_plx_res_023_removed_events_are_retained_not_discarded', () => {
    const events: ResumeEventLike[] = [
      { id: 'e1', eventType: 'DeskUpdated', objectId: 'd1', changeSummary: null, recordedAt: '', rowid: 1 },
      { id: 'e2', eventType: 'ContextHealthChanged', objectId: 'd1', changeSummary: null, recordedAt: '', rowid: 2 }
    ]
    const { kept, removedEventIds } = removeNoise(events)
    expect(kept.map((e) => e.id)).toEqual(['e1'])
    expect(removedEventIds).toEqual(['e2']) // reachable via the disclosure path, not gone
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskUpdated'))
    es.append(ev('desk-1', 'ContextHealthChanged'))
    const r = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1 })
    expect(r.removedEventIds.length).toBe(1)
    expect(r.sourceEventIds.length).toBe(1)
  })
})

describe('plx_res_003 — catch-up is a range with a stated basis', () => {
  it('test_plx_res_003_catchup_is_a_band_not_a_point', () => {
    const events: ResumeEventLike[] = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`, eventType: 'DeskUpdated', objectId: 'd1', changeSummary: null, recordedAt: '', rowid: i + 1
    }))
    const c = estimateCatchup(events)!
    expect(c.lowerBound).toBeLessThan(c.point)
    expect(c.upperBound).toBeGreaterThan(c.point)
    expect(c.basis).toBe('heuristic')
    expect(estimateCatchup([])).toBeNull()
  })
})

describe('plx_res_020 — stages are independently testable', () => {
  it('test_plx_res_020_stage1_collect_is_isolable', () => {
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskCreated'))
    es.append(ev('desk-2', 'DeskCreated'))
    // Stage 1 alone, scoped to one object, from the beginning.
    const collected = collectEvents(db, ['desk-1'], -1)
    expect(collected).toHaveLength(1)
    expect(collected[0].objectId).toBe('desk-1')
  })
})

describe('plx_res_001 — Resumes are diffable across versions', () => {
  it('test_plx_res_001_diff_reports_new_and_resolved', () => {
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskUpdated'))
    const v1 = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1', 'desk-2'], sinceCursor: -1 })
    es.append(ev('desk-2', 'DeskUpdated'))
    const v2 = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1', 'desk-2'], sinceCursor: v1.toCursor })
    const d = diffResume(v1, v2)
    expect(d.newObjectIds).toContain('desk-2') // desk-2 changed only in v2
    expect(d.resolvedObjectIds).toContain('desk-1') // desk-1 had no new events after the cursor
  })
})

describe('stage 4 — decisions are identified and drive recommendations', () => {
  it('test_plx_res_decisions_surface_in_actions', () => {
    const { db, es } = setup()
    es.append(ev('desk-1', 'DeskUpdated'))
    const r = generateResume(db, {
      deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1,
      decisionsForObject: (id) => (id === 'desk-1' ? ['dec-1'] : [])
    })
    expect(r.decisionIds).toContain('dec-1')
    expect(r.recommendedActions.some((a) => a.toLowerCase().includes('decision'))).toBe(true)
  })
})
