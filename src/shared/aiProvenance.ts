// AI provenance and grounding (spec §32 aiMetadata, §70 AI Governance). Two hard
// rules run through the platform's use of AI. First, anything a model produces is
// permanently marked ai_generated and that mark can never be downgraded to human
// (PLX-DOM-014), and it must be distinguishable at every point of display and
// export (PLX-UX-062). Second, generated interpretation never stands on its own:
// it must reference the structured Events it was derived from, because structured
// truth precedes generated interpretation (PLX-INV-04).

export type Provenance = 'human' | 'ai_generated'

export interface AiMetadata {
  provenance: Provenance
  model: string | null
  promptVersion: string | null
  generatedAt: string | null
  // The structured Events this generated content is grounded in (PLX-INV-04).
  sourceEventIds: string[]
}

export function humanMetadata(): AiMetadata {
  return { provenance: 'human', model: null, promptVersion: null, generatedAt: null, sourceEventIds: [] }
}

export function isAiGenerated(meta: Pick<AiMetadata, 'provenance'>): boolean {
  return meta.provenance === 'ai_generated'
}

// Set provenance, enforcing the no-downgrade rule (PLX-DOM-014): once
// ai_generated, an entity can never be relabelled human by any later operation.
export function setProvenance(current: Provenance, next: Provenance): Provenance {
  if (current === 'ai_generated' && next === 'human') {
    throw new Error('aiMetadata.provenance MUST NOT be downgraded from ai_generated to human (PLX-DOM-014).')
  }
  return next
}

// Mark content ai_generated, carrying the model, prompt version, and the source
// Events that ground it. Refuses ungrounded generated content (PLX-INV-04).
export function markAiGenerated(input: {
  model: string
  promptVersion: string
  generatedAt: string
  sourceEventIds: string[]
}): AiMetadata {
  if (!input.sourceEventIds || input.sourceEventIds.length === 0) {
    throw new Error('AI-generated content MUST be grounded in structured Events (PLX-INV-04).')
  }
  return {
    provenance: 'ai_generated',
    model: input.model,
    promptVersion: input.promptVersion,
    generatedAt: input.generatedAt,
    sourceEventIds: [...input.sourceEventIds]
  }
}

// Assert a generated interpretation is grounded in the structure it claims to
// summarise: every source id it cites must be part of the structured input
// (PLX-INV-04). Catches a model that invented references not present in the data.
export function assertGroundedIn(structuredSourceEventIds: string[], generated: AiMetadata): void {
  const known = new Set(structuredSourceEventIds)
  const invented = generated.sourceEventIds.filter((id) => !known.has(id))
  if (invented.length > 0) {
    throw new Error(`AI output references Events not in the structured input: ${invented.join(', ')} (PLX-INV-04).`)
  }
}
