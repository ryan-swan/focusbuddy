import { describe, it, expect } from 'vitest'
import {
  AGENT_DESTINATION_KINDS,
  canReceiveAgentOutput,
  destinationFormat,
  destinationLabel,
  eligibleDestinations,
  buildDeliveryProposal,
  buildDelivery,
  looksLikeNarration
} from '../../src/renderer/src/lib/agentDestination'
import { parseAgent, serializeAgent, DEFAULT_AGENT } from '../../src/renderer/src/lib/deskAgent'
import type { Widget, WidgetKind } from '../../src/shared/types'

// A desk agent wired to a page only ever gave the MODEL a format hint — nothing
// delivered the output. Whether it landed depended on the model volunteering an
// update-widget proposal. These pin the explicit destination that replaced that.

const w = (over: Partial<Widget>): Widget =>
  ({ id: 'w1', taskId: 'desk1', kind: 'page', title: '', content: '', x: 0, y: 0,
     width: 100, height: 100, zIndex: 1, color: null, archived: false,
     createdAt: 0, updatedAt: 0, ...over }) as Widget

describe('what can receive an agent output', () => {
  it('accepts the kinds that hold written content', () => {
    for (const k of ['page', 'markdown', 'note', 'sticky', 'card', 'table', 'mindmap', 'field'] as WidgetKind[]) {
      expect(canReceiveAgentOutput(k), k).toBe(true)
    }
  })

  it('refuses kinds where written output would be nonsense', () => {
    for (const k of ['timer', 'color', 'calculator', 'webview', 'minimap', 'portal'] as WidgetKind[]) {
      expect(canReceiveAgentOutput(k), k).toBe(false)
    }
  })

  it('gives every accepted kind a format, so none can be added without one', () => {
    for (const k of AGENT_DESTINATION_KINDS) {
      expect(destinationFormat(k).trim().length, k).toBeGreaterThan(0)
    }
  })

  it('describes structured targets in the shape they can hold', () => {
    expect(destinationFormat('table')).toMatch(/one per line/)
    expect(destinationFormat('mindmap')).toMatch(/outline/)
    expect(destinationFormat('field')).toMatch(/single/)
  })
})

describe('choosing a destination', () => {
  const widgets = [
    w({ id: 'p1', kind: 'page', title: 'Brief' }),
    w({ id: 't1', kind: 'timer' }),
    w({ id: 'n1', kind: 'note', title: 'Scratch' }),
    w({ id: 'a1', kind: 'agent', title: 'The agent' }),
    w({ id: 'x1', kind: 'page', title: 'Other desk', taskId: 'desk2' }),
    w({ id: 'z1', kind: 'page', title: 'Archived', archived: true })
  ]

  it('offers only receivable widgets on this desk', () => {
    const ids = eligibleDestinations(widgets, 'desk1', 'a1').map((d) => d.id)
    expect(ids).toContain('p1')
    expect(ids).toContain('n1')
    expect(ids).not.toContain('t1') // wrong kind
    expect(ids).not.toContain('x1') // another desk
    expect(ids).not.toContain('z1') // archived
    expect(ids).not.toContain('a1') // never itself
  })

  it('labels a destination by kind and title', () => {
    expect(destinationLabel(w({ kind: 'page', title: 'Brief' }))).toBe('Page "Brief"')
    expect(destinationLabel(w({ kind: 'note', title: '' }))).toBe('Note')
  })
})

describe('delivery is offered, never silently applied', () => {
  const target = w({ id: 'p1', kind: 'page', title: 'Brief' })

  it('builds an update-widget card aimed at the destination', () => {
    const p = buildDeliveryProposal('Some findings', target, 'append', 'Researcher')
    expect(p?.kind).toBe('update-widget')
    expect((p as { widgetId: string }).widgetId).toBe('p1')
    expect((p as { operation: string }).operation).toBe('append')
    expect((p as { content: string }).content).toBe('Some findings')
  })

  it('honours replace when that is what was configured', () => {
    const p = buildDeliveryProposal('x', target, 'replace', 'A')
    expect((p as { operation: string }).operation).toBe('replace')
  })

  it('always replaces a field, whatever the preference says', () => {
    // A field holds one value; appending each run would concatenate nonsense.
    const field = w({ id: 'f1', kind: 'field', title: 'Status' })
    expect((buildDeliveryProposal('Green', field, 'append', 'A') as { operation: string }).operation).toBe('replace')
  })

  it('delivers nothing for an empty run, so a blank result cannot wipe a page', () => {
    expect(buildDeliveryProposal('', target, 'replace', 'A')).toBeNull()
    expect(buildDeliveryProposal('   \n  ', target, 'replace', 'A')).toBeNull()
  })
})

describe('the destination survives a config round-trip', () => {
  it('defaults to nowhere, appending', () => {
    expect(DEFAULT_AGENT.destinationWidgetId).toBeNull()
    expect(DEFAULT_AGENT.destinationMode).toBe('append')
  })

  it('persists what was chosen', () => {
    const cfg = { ...DEFAULT_AGENT, destinationWidgetId: 'p1', destinationMode: 'replace' as const }
    const back = parseAgent(serializeAgent(cfg))
    expect(back.destinationWidgetId).toBe('p1')
    expect(back.destinationMode).toBe('replace')
  })

  it('reads an agent saved before destinations existed', () => {
    const legacy = JSON.stringify({ instruction: 'do a thing', trigger: 'manual', intervalSec: 120, enabled: true })
    const back = parseAgent(legacy)
    expect(back.instruction).toBe('do a thing')
    expect(back.destinationWidgetId).toBeNull()
    expect(back.destinationMode).toBe('append')
  })
})

describe('an agent that describes its work never files the description', () => {
  const target = w({ id: 'p1', kind: 'page', title: 'Email sequences' })

  it('catches the exact failure that was reported', () => {
    const reported =
      "I've written a 7-touch early adopter outbound sequence for Plexii structured across an " +
      'awareness → interest → urgency arc, with subject line variants, cadence notes, and A/B test ' +
      'recommendations — grounded in the core message and saved to the linked page.'
    expect(looksLikeNarration(reported)).toBe(true)
    const d = buildDelivery(reported, target, 'replace', 'Writer')
    expect(d.ok).toBe(false)
    expect(d.ok === false && d.reason).toBe('narration')
  })

  it('catches the short completion report', () => {
    expect(looksLikeNarration('Drafted a Markdown content overview of all four campaign items, ready to edit.')).toBe(true)
    expect(looksLikeNarration("Here's a summary of the tracker.")).toBe(true)
  })

  it('treats a save claim as narration at any length', () => {
    const long = 'x'.repeat(2000) + ' and saved it to the linked page.'
    expect(looksLikeNarration(long)).toBe(true)
  })

  it('does NOT mistake a real document for narration', () => {
    const realDoc = [
      '# Email 1 — Awareness',
      '',
      'Subject: The workspace that remembers',
      '',
      'Hi {{first_name}},',
      '',
      "I've written to you before about scattered tools. Here is what changed.",
      '',
      '## Email 2 — Interest',
      'Subject: One app instead of twelve tabs'
    ].join('\n')
    // Opens with "I've written to you before" — a completion opener in a real
    // artefact — but it is long, and it never claims to have saved anything.
    expect(looksLikeNarration(realDoc)).toBe(false)
    expect(buildDelivery(realDoc, target, 'replace', 'Writer').ok).toBe(true)
  })

  it('lets short genuine content through', () => {
    expect(looksLikeNarration('Revenue is up 12% quarter on quarter.')).toBe(false)
    expect(looksLikeNarration('# Q3 plan\n- Ship the beta\n- Hire two engineers')).toBe(false)
  })
})

describe('the delivery card carries what review needs', () => {
  const target = w({ id: 'p1', kind: 'page', title: 'Email sequences' })

  it('sets the label that drives the card subject', () => {
    // It was missing behind an `as ActionProposal` cast, so the card rendered
    // with an empty subject and nothing to review — which is what made the
    // apply step feel like ceremony.
    const p = buildDeliveryProposal('Some real content', target, 'append', 'Writer')
    expect((p as { label?: string }).label).toBe('Page "Email sequences"')
  })

  it('carries the content the preview renders', () => {
    const p = buildDeliveryProposal('# Heading\nBody text', target, 'append', 'Writer')
    expect((p as { content?: string }).content).toBe('# Heading\nBody text')
  })
})

describe('writing without asking is opt-in and off by default', () => {
  it('defaults to asking', () => {
    expect(DEFAULT_AGENT.destinationAutoApply).toBe(false)
  })

  it('persists the choice', () => {
    const back = parseAgent(serializeAgent({ ...DEFAULT_AGENT, destinationAutoApply: true }))
    expect(back.destinationAutoApply).toBe(true)
  })

  it('an agent saved before the option existed still asks', () => {
    const legacy = JSON.stringify({ instruction: 'x', trigger: 'manual', intervalSec: 120, enabled: true })
    expect(parseAgent(legacy).destinationAutoApply).toBe(false)
  })
})
