import { describe, it, expect } from 'vitest'
import { parseChatJson } from '../../src/main/ai/anthropic'

// Feature A: the desk-assistant planner can now emit a configured agent and a
// wired link, so "tell it what you need" produces a full setup as proposals.
describe('parseChatJson - auto-build proposals (create-agent + link-widgets)', () => {
  it('parses a create-agent action into a proposal', () => {
    const raw = JSON.stringify({
      reply: 'Setting up a researcher.',
      actions: [
        {
          kind: 'create-agent',
          id: 'researcher',
          title: 'Lead researcher',
          instruction: 'Research each company in the leads table.',
          trigger: 'manual'
        }
      ]
    })
    const { proposals } = parseChatJson(raw)
    const agent = proposals.find((p) => p.kind === 'create-agent')
    expect(agent).toBeTruthy()
    expect(agent && agent.kind === 'create-agent' && agent.id).toBe('researcher')
    expect(agent && agent.kind === 'create-agent' && agent.instruction).toContain('Research each company')
    expect(agent && agent.kind === 'create-agent' && agent.trigger).toBe('manual')
  })

  it('drops a create-agent with no instruction', () => {
    const raw = JSON.stringify({ reply: '', actions: [{ kind: 'create-agent', title: 'x', instruction: '' }] })
    expect(parseChatJson(raw).proposals.some((p) => p.kind === 'create-agent')).toBe(false)
  })

  it('parses link-widgets with wire type + verb and $ref endpoints', () => {
    const raw = JSON.stringify({
      reply: 'Wiring the table into the agent.',
      actions: [
        {
          kind: 'link-widgets',
          sourceWidgetId: '$leads',
          targetWidgetId: '$researcher',
          sourceLabel: 'leads table',
          targetLabel: 'research agent',
          wireType: 'context',
          verb: 'research'
        }
      ]
    })
    const link = parseChatJson(raw).proposals.find((p) => p.kind === 'link-widgets')
    expect(link).toBeTruthy()
    if (link && link.kind === 'link-widgets') {
      expect(link.sourceWidgetId).toBe('$leads')
      expect(link.targetWidgetId).toBe('$researcher')
      expect(link.wireType).toBe('context')
      expect(link.verb).toBe('research')
    }
  })

  it('accepts an AI-provided id on create-widget for later $ref linking', () => {
    const raw = JSON.stringify({
      reply: '',
      actions: [{ kind: 'create-widget', id: 'notes-1', widgetKind: 'note', content: 'hi' }]
    })
    const w = parseChatJson(raw).proposals.find((p) => p.kind === 'create-widget')
    expect(w && w.id).toBe('notes-1')
  })

  it('parses a full lead-tracker setup as an ordered, referenceable batch', () => {
    const raw = JSON.stringify({
      reply: 'Building your lead tracker.',
      actions: [
        { kind: 'create-table', id: 'leads', title: 'Sales leads', columns: [{ label: 'Company', type: 'text-short' }] },
        { kind: 'create-agent', id: 'researcher', instruction: 'Research each lead.', trigger: 'manual' },
        {
          kind: 'link-widgets',
          sourceWidgetId: '$leads',
          targetWidgetId: '$researcher',
          sourceLabel: 'leads',
          targetLabel: 'agent',
          wireType: 'context'
        }
      ]
    })
    const kinds = parseChatJson(raw).proposals.map((p) => p.kind)
    expect(kinds).toEqual(['create-table', 'create-agent', 'link-widgets'])
  })
})
