// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { generateResume } from '../../src/main/resume/resume'
import { createSummaryCache, structuredDigest } from '../../src/main/ai/summaryCache'
import { summariseResume, aiProposedChangeEvent } from '../../src/main/ai/resumeSummary'
import { setProvenance, markAiGenerated, assertGroundedIn, isAiGenerated } from '../../src/shared/aiProvenance'

// AI governance (spec §32, §52, §70). Deterministic first, AI second — provenance,
// grounding, caching, degradation, and proposal-not-write.

function resumeWithEvents(objectId = 'desk-1', n = 2) {
  const db = memSqlDb()
  const es = createEventStore(db)
  for (let i = 0; i < n; i++) es.append({ eventType: i === 0 ? 'DeskCreated' : 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'o', objectId, changeSummary: `c${i}` })
  const resume = generateResume(db, { deskId: objectId, forUserId: 'sam', objectIds: [objectId], sinceCursor: -1 })
  return { db, resume }
}

describe('plx_dom_014 — provenance is set and never downgraded', () => {
  it('test_plx_dom_014_no_downgrade_ai_to_human', () => {
    expect(setProvenance('human', 'ai_generated')).toBe('ai_generated')
    expect(setProvenance('ai_generated', 'ai_generated')).toBe('ai_generated')
    expect(() => setProvenance('ai_generated', 'human')).toThrow(/PLX-DOM-014/)
  })
})

describe('plx_inv_04 — AI never bypasses structured data (grounding)', () => {
  it('test_plx_inv_04_generated_content_must_be_grounded', () => {
    expect(() => markAiGenerated({ model: 'm', promptVersion: 'p', generatedAt: 't', sourceEventIds: [] })).toThrow(/PLX-INV-04/)
    const meta = markAiGenerated({ model: 'm', promptVersion: 'p', generatedAt: 't', sourceEventIds: ['e1', 'e2'] })
    expect(isAiGenerated(meta)).toBe(true)
    // Referencing an Event not in the structured input is rejected.
    expect(() => assertGroundedIn(['e1'], meta)).toThrow(/PLX-INV-04/)
    expect(() => assertGroundedIn(['e1', 'e2', 'e3'], meta)).not.toThrow()
  })
})

describe('plx_res_012 — AI outputs cached by structured input digest', () => {
  it('test_plx_res_012_identical_input_hits_cache_once', () => {
    const { db, resume } = resumeWithEvents()
    const cache = createSummaryCache(db)
    let calls = 0
    const generate = (): string => { calls++; return 'A concise catch-up.' }
    const opts = { generate, cache, model: 'claude-sonnet-5', promptVersion: 'resume-1', now: '2026-07-30T00:00:00Z' }
    const first = summariseResume(resume, opts)
    const second = summariseResume(resume, opts)
    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true) // identical structured input -> cache hit
    expect(calls).toBe(1) // model invoked exactly once
    expect(second.resume.aiSummary).toBe('A concise catch-up.')
    // The digest is over structure, not the AI prose.
    expect(structuredDigest(first.resume)).toBe(structuredDigest(second.resume))
  })
})

describe('plx_arc_022 — loss of AI degrades to deterministic, not to failure', () => {
  it('test_plx_arc_022_generator_failure_returns_structured_resume', () => {
    const { db, resume } = resumeWithEvents()
    const cache = createSummaryCache(db)
    const generate = (): string => { throw new Error('model unavailable') }
    const r = summariseResume(resume, { generate, cache, model: 'm', promptVersion: 'p', now: 't' })
    expect(r.degraded).toBe(true)
    expect(r.aiMetadata).toBeNull()
    expect(r.resume.aiSummary).toBeNull() // structured Resume intact, no AI prose
    expect(r.resume.summary.length).toBeGreaterThan(0) // still fully renderable
  })
})

describe('plx_ai_005 — AI changes are proposed as Events, never direct writes', () => {
  it('test_plx_ai_005_proposal_is_an_event_requiring_confirmation', () => {
    const { db, resume } = resumeWithEvents()
    const es = createEventStore(db)
    const evt = es.append(
      aiProposedChangeEvent({
        organisationId: 'o',
        agent: 'agent:plexi',
        objectId: 'desk-1',
        proposal: { setStatus: 'done' },
        sourceEventIds: resume.sourceEventIds,
        model: 'claude-sonnet-5',
        promptVersion: 'p'
      })
    )
    expect(evt.eventType).toBe('AiChangeProposed')
    expect(evt.category).toBe('ai')
    expect((evt.currentState as { requiresConfirmation: boolean }).requiresConfirmation).toBe(true)
    // Ungrounded proposal is refused (PLX-INV-04).
    expect(() =>
      aiProposedChangeEvent({ organisationId: 'o', agent: 'agent:plexi', objectId: 'd', proposal: {}, sourceEventIds: [], model: 'm', promptVersion: 'p' })
    ).toThrow(/PLX-INV-04/)
  })
})
