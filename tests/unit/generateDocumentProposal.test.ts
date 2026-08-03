import { describe, it, expect } from 'vitest'
import { parseChatJson } from '../../src/main/ai/anthropic'

// The desk agent creates decks / sheets / maps / mind maps via a generate-document
// action. This locks the parser turning the model's envelope into a proposal.

describe('parseChatJson — generate-document', () => {
  it('parses a slides generate-document into a proposal', () => {
    const raw = JSON.stringify({
      reply: 'Drafting a launch deck.',
      actions: [
        { kind: 'generate-document', docType: 'slides', title: 'Launch deck', prompt: 'A 6-slide launch deck for v4', reason: 'user asked for a presentation' }
      ]
    })
    const out = parseChatJson(raw)
    expect(out).not.toBeNull()
    const p = out!.proposals[0]
    expect(p.kind).toBe('generate-document')
    if (p.kind === 'generate-document') {
      expect(p.docType).toBe('slides')
      expect(p.title).toBe('Launch deck')
      expect(p.prompt).toContain('launch deck')
      expect(p.widgetId).toBeUndefined()
    }
  })

  it('carries widgetId when the agent targets an existing output widget', () => {
    const raw = JSON.stringify({
      reply: 'Filling the map.',
      actions: [{ kind: 'generate-document', docType: 'map', title: 'Onboarding flow', prompt: 'Flowchart of onboarding', widgetId: 'w-123' }]
    })
    const p = parseChatJson(raw)!.proposals[0]
    expect(p.kind).toBe('generate-document')
    if (p.kind === 'generate-document') expect(p.widgetId).toBe('w-123')
  })

  it('rejects an unsupported docType (design not yet generatable) and a missing prompt', () => {
    const raw = JSON.stringify({
      reply: 'x',
      actions: [
        { kind: 'generate-document', docType: 'design', title: 'Poster', prompt: 'A poster' },
        { kind: 'generate-document', docType: 'sheet', title: 'Budget' }
      ]
    })
    const out = parseChatJson(raw)!
    expect(out.proposals.filter((p) => p.kind === 'generate-document')).toHaveLength(0)
  })
})
