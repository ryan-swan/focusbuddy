// Agent governance (spec §78, §79, REQ-AGT). Agents act on behalf of a human and
// never exceed them: effective permissions are a subset of the principal's
// (AGT-001), every agent has exactly one accountable human (AGT-005), delegation
// never escalates (AGT-014). Every action is an attributed Event (AGT-002/013),
// agent-created Relationships are provisional (AGT-003), agents never assert
// ungrounded facts (AGT-004), inter-agent messages are schema-validated and pass
// context by reference (AGT-010/011/012), each agent holds one specialisation
// (AGT-015) and a declared, permission-checked tool set (AGT-020), external
// transmission is gated (AGT-021), and memory scope is enforced at retrieval
// (AGT-023).

import type { AppendInput } from '../db/eventStore'
import { validate, type JsonSchema } from '../db/eventSchemas'
import { assertGroundedIn } from '../../shared/aiProvenance'
import { withinCeiling, type CostCeiling } from './orchestrator'

export interface Agent {
  id: string
  specialisation: string // exactly one (AGT-015)
  actsOnBehalfOf: string // exactly one accountable human (AGT-005)
  permittedTools: string[] // declared tool set (AGT-020)
  memoryScope: 'desk' | 'organisation'
  memoryScopeId: string
}

// AGT-005 — an Agent must have exactly one accountable human principal.
export function assertAccountableHuman(agent: Agent): void {
  if (!agent.actsOnBehalfOf) throw new Error('An Agent MUST have exactly one accountable human principal (PLX-AGT-005).')
}

// AGT-015 — an Agent holds exactly one specialisation.
export function assertSingleSpecialisation(agent: Agent): void {
  if (!agent.specialisation || agent.specialisation.includes(',')) {
    throw new Error('An Agent MUST hold exactly one specialisation (PLX-AGT-015).')
  }
}

// AGT-001 — an Agent's effective permissions are the subset it shares with its
// principal; it can never hold a permission the principal lacks.
export function agentEffectivePermissions(agentPermissions: string[], principalPermissions: string[]): string[] {
  const principal = new Set(principalPermissions)
  return agentPermissions.filter((p) => principal.has(p))
}
export function assertWithinPrincipal(agentPermissions: string[], principalPermissions: string[]): void {
  const principal = new Set(principalPermissions)
  const excess = agentPermissions.filter((p) => !principal.has(p))
  if (excess.length > 0) throw new Error(`Agent permissions exceed the principal: ${excess.join(', ')} (PLX-AGT-001).`)
}

// AGT-014 — delegation propagates onBehalfOf unchanged and never escalates: the
// delegate's effective permissions are bounded by the delegator's.
export function delegate(from: Agent, to: Omit<Agent, 'actsOnBehalfOf'>, delegatorPermissions: string[]): Agent {
  // The delegate's declared permissions must already be within the delegator's;
  // delegation cannot grant something the delegator does not hold (AGT-014).
  assertWithinPrincipal(to.permittedTools, delegatorPermissions)
  return { ...to, actsOnBehalfOf: from.actsOnBehalfOf } // onBehalfOf unchanged
}

// AGT-002 / AGT-013 — every Agent action is an Event attributed to the Agent, with
// onBehalfOf populated and full correlation/causation lineage.
export function agentActionEvent(input: {
  agent: Agent
  organisationId: string
  eventType: string
  correlationId: string
  causationId?: string | null
  currentState?: Record<string, unknown>
  changeSummary?: string
}): AppendInput {
  assertAccountableHuman(input.agent)
  return {
    eventType: input.eventType,
    category: 'ai',
    actor: `agent:${input.agent.id}`,
    organisationId: input.organisationId,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    currentState: { ...(input.currentState ?? {}), onBehalfOf: input.agent.actsOnBehalfOf },
    changeSummary: input.changeSummary ?? `Agent ${input.agent.id} acted`
  }
}

// AGT-003 — an Agent-created Relationship is always provisional, never confirmed.
export function agentRelationshipState(): 'provisional' {
  return 'provisional'
}

// AGT-004 — an Agent never asserts organisational facts not derivable from
// structured data; assertions carry evidence references.
export function assertAgentGrounded(assertedSourceIds: string[], knownStructuredIds: string[]): void {
  if (assertedSourceIds.length === 0) throw new Error('An Agent assertion MUST carry evidence references (PLX-AGT-004).')
  assertGroundedIn(knownStructuredIds, {
    provenance: 'ai_generated', model: null, promptVersion: null, generatedAt: null, sourceEventIds: assertedSourceIds
  })
}

// AGT-006 — Agent cost is metered against its own ceiling and the Desk ceiling.
export function agentWithinCostCeilings(spentUsd: number, agentCeiling: CostCeiling, deskCeiling: CostCeiling): boolean {
  return withinCeiling(spentUsd, agentCeiling) && withinCeiling(spentUsd, deskCeiling)
}

// AGT-010 / AGT-012 — inter-agent messages conform to the AgentMessage schema and
// pass context BY REFERENCE; inlining content is rejected so permission evaluation
// stays possible at retrieval.
export const AGENT_MESSAGE_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['from', 'to', 'onBehalfOf', 'intent', 'contextRefs', 'correlationId'],
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    onBehalfOf: { type: 'string' },
    intent: { type: 'string' },
    contextRefs: { type: 'array', items: { type: 'string' } }, // references, not content
    correlationId: { type: 'string' }
  },
  additionalProperties: true
}
export interface AgentMessage {
  from: string
  to: string
  onBehalfOf: string
  intent: string
  contextRefs: string[]
  inlineContent?: string // presence of this is a violation (AGT-012)
  correlationId: string
}
export function validateAgentMessage(msg: unknown): { valid: boolean; errors: string[] } {
  const base = validate(AGENT_MESSAGE_SCHEMA, msg)
  const errors = [...base.errors]
  if (msg && typeof msg === 'object' && 'inlineContent' in (msg as Record<string, unknown>) && (msg as AgentMessage).inlineContent) {
    errors.push('context MUST be passed by reference, not inlined (PLX-AGT-012)')
  }
  return { valid: errors.length === 0, errors }
}

// AGT-011 — an Agent reply must validate against the caller's expectedOutput schema;
// a non-conforming reply is rejected (to be retried or failed).
export function validateAgentReply(reply: unknown, expectedOutput: JsonSchema): { valid: boolean; errors: string[] } {
  return validate(expectedOutput, reply)
}

// AGT-020 — a tool invocation is permission-checked at the boundary against the
// Agent's declared tool set.
export function assertToolPermitted(agent: Agent, tool: string): void {
  if (!agent.permittedTools.includes(tool)) {
    throw new Error(`Agent ${agent.id} may not invoke "${tool}"; not in its declared tool set (PLX-AGT-020).`)
  }
}

// AGT-021 — the Research Agent transmits tenant content externally only when the
// Desk allows it.
export function externalTransmissionAllowed(deskExternalDataAllowed: boolean): boolean {
  return deskExternalDataAllowed === true
}
export function assertExternalTransmission(deskExternalDataAllowed: boolean): void {
  if (!externalTransmissionAllowed(deskExternalDataAllowed)) {
    throw new Error('An Agent MUST NOT transmit tenant content externally unless the Desk allows it (PLX-AGT-021).')
  }
}

// AGT-023 — Agent memory scope is enforced at retrieval: a desk-scoped Agent cannot
// retrieve content from another Desk.
export function canRetrieve(agent: Agent, contentScopeId: string): boolean {
  return agent.memoryScopeId === contentScopeId
}
