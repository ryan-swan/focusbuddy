// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { createSummaryCache } from '../../src/main/ai/summaryCache'
import { generateResume } from '../../src/main/resume/resume'
import { generateResumeSummaryLive, buildResumePrompt } from '../../src/main/ai/liveResume'

// Live resume-summary wiring (spec §52, §70). The model call is injected so the
// governance behaviour is unit-tested without a live key; the real seam is verified
// by the tester against Claude.

function resumeFixture() {
  const db = memSqlDb()
  const es = createEventStore(db)
  es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'desk-1', changeSummary: 'edited pricing' })
  const resume = generateResume(db, { deskId: 'desk-1', forUserId: 'sam', objectIds: ['desk-1'], sinceCursor: -1 })
  return { db, resume }
}

describe('live resume summary — governance behaviour', () => {
  it('test_plx_res_012_live_summary_caches_by_digest', async () => {
    const { db, resume } = resumeFixture()
    const cache = createSummaryCache(db)
    let calls = 0
    const invoke = async (): Promise<string> => { calls++; return 'You picked pricing back up.' }
    const opts = { cache, now: '2026-07-30T00:00:00Z', invoke, keyAvailable: () => true }
    const first = await generateResumeSummaryLive(resume, opts)
    const second = await generateResumeSummaryLive(resume, opts)
    expect(first.resume.aiSummary).toBe('You picked pricing back up.')
    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true) // identical structured input -> cache hit
    expect(calls).toBe(1) // the model is invoked once
  })

  it('test_plx_dom_014_live_summary_marked_and_grounded', async () => {
    const { db, resume } = resumeFixture()
    const r = await generateResumeSummaryLive(resume, { cache: createSummaryCache(db), now: 't', invoke: async () => 'summary', keyAvailable: () => true })
    expect(r.aiMetadata?.provenance).toBe('ai_generated')
    expect(r.aiMetadata?.sourceEventIds.length).toBeGreaterThan(0) // grounded in the Resume's Events
  })

  it('test_plx_arc_022_degrades_without_key', async () => {
    const { db, resume } = resumeFixture()
    const r = await generateResumeSummaryLive(resume, { cache: createSummaryCache(db), now: 't', invoke: async () => 'x', keyAvailable: () => false })
    expect(r.degraded).toBe(true)
    expect(r.resume.aiSummary).toBeNull() // deterministic Resume intact
    expect(r.resume.summary.length).toBeGreaterThan(0)
  })

  it('test_plx_arc_022_degrades_on_model_failure', async () => {
    const { db, resume } = resumeFixture()
    const r = await generateResumeSummaryLive(resume, { cache: createSummaryCache(db), now: 't', invoke: async () => { throw new Error('model down') }, keyAvailable: () => true })
    expect(r.degraded).toBe(true)
    expect(r.resume.aiSummary).toBeNull()
  })

  it('test_res_013_no_signal_stays_deterministic', async () => {
    const db = memSqlDb()
    createEventStore(db)
    const empty = generateResume(db, { deskId: 'd', forUserId: 'sam', objectIds: ['d'], sinceCursor: -1 })
    const r = await generateResumeSummaryLive(empty, { cache: createSummaryCache(db), now: 't', invoke: async () => 'should not be called', keyAvailable: () => true })
    expect(r.degraded).toBe(true) // no signal -> no model call
  })

  it('test_prompt_is_grounded_in_structure', () => {
    const { resume } = resumeFixture()
    const prompt = buildResumePrompt(resume)
    expect(prompt).toContain('Do not invent')
    expect(prompt).toContain('desk-1')
  })
})
