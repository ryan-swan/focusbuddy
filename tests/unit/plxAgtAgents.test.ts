import { describe, it, expect } from 'vitest'
import {
  assertAccountableHuman,
  assertSingleSpecialisation,
  agentEffectivePermissions,
  assertWithinPrincipal,
  delegate,
  agentActionEvent,
  agentRelationshipState,
  assertAgentGrounded,
  agentWithinCostCeilings,
  validateAgentMessage,
  validateAgentReply,
  assertToolPermitted,
  externalTransmissionAllowed,
  assertExternalTransmission,
  canRetrieve,
  type Agent
} from '../../src/main/ai/agents'
import type { JsonSchema } from '../../src/main/db/eventSchemas'

// Agent governance (spec §78, §79).

const agent: Agent = { id: 'research-1', specialisation: 'research', actsOnBehalfOf: 'user:alice', permittedTools: ['web-search', 'summarise'], memoryScope: 'desk', memoryScopeId: 'desk-1' }

describe('plx_agt_005 / plx_agt_015 — one accountable human, one specialisation', () => {
  it('test_plx_agt_005_015', () => {
    expect(() => assertAccountableHuman(agent)).not.toThrow()
    expect(() => assertAccountableHuman({ ...agent, actsOnBehalfOf: '' })).toThrow(/PLX-AGT-005/)
    expect(() => assertSingleSpecialisation(agent)).not.toThrow()
    expect(() => assertSingleSpecialisation({ ...agent, specialisation: 'research,writing' })).toThrow(/PLX-AGT-015/)
  })
})

describe('plx_agt_001 / plx_agt_014 — effective permissions subset of principal; no escalation', () => {
  it('test_plx_agt_001_subset', () => {
    expect(agentEffectivePermissions(['read', 'write', 'admin'], ['read', 'write'])).toEqual(['read', 'write'])
    expect(() => assertWithinPrincipal(['read', 'admin'], ['read'])).toThrow(/PLX-AGT-001/)
  })
  it('test_plx_agt_014_delegation_no_escalation', () => {
    const child = delegate(agent, { id: 'sub', specialisation: 'summarise', permittedTools: ['summarise'], memoryScope: 'desk', memoryScopeId: 'desk-1' }, ['summarise', 'read'])
    expect(child.actsOnBehalfOf).toBe('user:alice') // onBehalfOf unchanged
    expect(() => delegate(agent, { id: 'sub2', specialisation: 'x', permittedTools: ['admin'], memoryScope: 'desk', memoryScopeId: 'desk-1' }, ['read'])).toThrow(/PLX-AGT-001/)
  })
})

describe('plx_agt_002 / plx_agt_013 — attributed action Events with lineage', () => {
  it('test_plx_agt_002_013', () => {
    const evt = agentActionEvent({ agent, organisationId: 'org', eventType: 'AgentSummarised', correlationId: 'c1', causationId: 'c0', currentState: { desk: 'desk-1' } })
    expect(evt.actor).toBe('agent:research-1')
    expect((evt.currentState as { onBehalfOf: string }).onBehalfOf).toBe('user:alice')
    expect(evt.correlationId).toBe('c1')
    expect(evt.causationId).toBe('c0')
  })
})

describe('plx_agt_003 / plx_agt_004 — provisional relationships, grounded assertions', () => {
  it('test_plx_agt_003_004', () => {
    expect(agentRelationshipState()).toBe('provisional')
    expect(() => assertAgentGrounded([], ['e1'])).toThrow(/PLX-AGT-004/) // no evidence
    expect(() => assertAgentGrounded(['ghost'], ['e1'])).toThrow(/PLX-INV-04/) // invented source
    expect(() => assertAgentGrounded(['e1'], ['e1', 'e2'])).not.toThrow()
  })
})

describe('plx_agt_006 — cost metered against agent and desk ceilings', () => {
  it('test_plx_agt_006', () => {
    const agentCeiling = { scope: 'organisation' as const, scopeId: 'a', ceilingUsd: 10 }
    const deskCeiling = { scope: 'desk' as const, scopeId: 'd', ceilingUsd: 3 }
    expect(agentWithinCostCeilings(2, agentCeiling, deskCeiling)).toBe(true)
    expect(agentWithinCostCeilings(4, agentCeiling, deskCeiling)).toBe(false) // desk ceiling exceeded
  })
})

describe('plx_agt_010 / plx_agt_012 — AgentMessage schema, context by reference', () => {
  it('test_plx_agt_010_012', () => {
    const good = { from: 'a', to: 'b', onBehalfOf: 'user:alice', intent: 'summarise', contextRefs: ['obj-1'], correlationId: 'c1' }
    expect(validateAgentMessage(good).valid).toBe(true)
    // Missing required field fails (schema-validated on send/receive).
    expect(validateAgentMessage({ from: 'a', to: 'b' }).valid).toBe(false)
    // Inlined content is rejected — context must be by reference.
    const inlined = { ...good, inlineContent: 'the whole document text' }
    expect(validateAgentMessage(inlined).errors.some((e) => e.includes('PLX-AGT-012'))).toBe(true)
  })
})

describe('plx_agt_011 — replies validate against expectedOutput schema', () => {
  it('test_plx_agt_011', () => {
    const expected: JsonSchema = { type: 'object', required: ['summary'], properties: { summary: { type: 'string' } } }
    expect(validateAgentReply({ summary: 'done' }, expected).valid).toBe(true)
    expect(validateAgentReply({ notes: 'oops' }, expected).valid).toBe(false) // non-conforming -> rejected
  })
})

describe('plx_agt_020 / plx_agt_021 / plx_agt_023 — tools, external transmission, memory scope', () => {
  it('test_plx_agt_020_tool_boundary', () => {
    expect(() => assertToolPermitted(agent, 'web-search')).not.toThrow()
    expect(() => assertToolPermitted(agent, 'delete-everything')).toThrow(/PLX-AGT-020/)
  })
  it('test_plx_agt_021_external_transmission_gated', () => {
    expect(externalTransmissionAllowed(true)).toBe(true)
    expect(externalTransmissionAllowed(false)).toBe(false)
    expect(() => assertExternalTransmission(false)).toThrow(/PLX-AGT-021/)
  })
  it('test_plx_agt_023_memory_scope_at_retrieval', () => {
    expect(canRetrieve(agent, 'desk-1')).toBe(true)
    expect(canRetrieve(agent, 'desk-2')).toBe(false) // desk-scoped agent cannot reach another desk
  })
})
