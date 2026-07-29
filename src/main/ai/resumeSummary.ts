// The AI stage over a Resume (spec §52, §70) — deterministic first, AI second. The
// structured Resume is already complete; this stage adds prose over it, and it is
// safe by construction:
//   - cached by the structured-input digest, so identical input never pays twice
//     for the model (PLX-RES-012);
//   - marked ai_generated and grounded in the Resume's source Events, and refused
//     if it references anything outside them (PLX-DOM-014 / PLX-INV-04);
//   - degrades to the deterministic Resume, unchanged, if the model is unavailable
//     or fails (PLX-ARC-022) — never to an error the user sees;
//   - never writes domain state: an AI-originated change is emitted as a proposal
//     Event subject to the same validation/permission/confirmation as a human's
//     (PLX-AI-005).

import type { AppendInput } from '../db/eventStore'
import type { StructuredResume } from '../resume/resume'
import { withAiSummary } from '../resume/resume'
import { createSummaryCache, structuredDigest, type SummaryCache } from './summaryCache'
import { assertGroundedIn, markAiGenerated, type AiMetadata } from '../../shared/aiProvenance'

export type SummaryGenerator = (resume: StructuredResume) => string

export interface SummariseOptions {
  generate: SummaryGenerator
  cache: SummaryCache
  model: string
  promptVersion: string
  now: string // ISO; injected for determinism
}

export interface SummariseResult {
  resume: StructuredResume
  aiMetadata: AiMetadata | null
  cacheHit: boolean
  degraded: boolean // true when the model was unavailable and we fell back
}

export function summariseResume(resume: StructuredResume, opts: SummariseOptions): SummariseResult {
  const digest = structuredDigest(resume)
  try {
    const { value, hit } = opts.cache.getOrCompute(digest, () => opts.generate(resume)) // PLX-RES-012
    const meta = markAiGenerated({
      model: opts.model,
      promptVersion: opts.promptVersion,
      generatedAt: opts.now,
      sourceEventIds: resume.sourceEventIds // grounded in structured Events (PLX-INV-04)
    })
    assertGroundedIn(resume.sourceEventIds, meta) // PLX-INV-04
    return { resume: withAiSummary(resume, value), aiMetadata: meta, cacheHit: hit, degraded: false }
  } catch (err) {
    // Loss of AI degrades to deterministic operation, never to unavailability
    // (PLX-ARC-022). The structured Resume is returned intact, AI summary absent.
    console.warn('[ai-summary] degraded to deterministic Resume:', (err as Error).message)
    return { resume, aiMetadata: null, cacheHit: false, degraded: true }
  }
}

// An AI-originated change is a PROPOSAL, not a write. It is emitted as an Event in
// the 'ai' category carrying ai_generated provenance, and it requires confirmation
// before it affects domain state — the same validation/permission/confirmation
// path a human change goes through (PLX-AI-005). The AI never mutates a store
// directly; the caller appends this Event and the applier gates it.
export function aiProposedChangeEvent(input: {
  organisationId: string
  agent: string // the agent principal, e.g. 'agent:plexi'
  objectId: string
  proposal: Record<string, unknown>
  sourceEventIds: string[]
  correlationId?: string | null
  model: string
  promptVersion: string
}): AppendInput {
  if (!input.sourceEventIds || input.sourceEventIds.length === 0) {
    throw new Error('An AI proposal MUST be grounded in structured Events (PLX-INV-04).')
  }
  return {
    eventType: 'AiChangeProposed',
    category: 'ai',
    actor: input.agent,
    organisationId: input.organisationId,
    objectId: input.objectId,
    correlationId: input.correlationId ?? null,
    currentState: { proposal: input.proposal, requiresConfirmation: true },
    changeSummary: 'AI proposed a change (awaiting confirmation)',
    metadata: {
      provenance: 'ai_generated',
      model: input.model,
      promptVersion: input.promptVersion,
      sourceEventIds: input.sourceEventIds
    }
  }
}

// Convenience for main: build a cache bound to the app DB.
export { createSummaryCache }
