import { describe, it, expect } from 'vitest'
import { buildImportedConversation } from '../../src/renderer/src/lib/deskConversationImport'
import type { ActionProposal, ChatMessage } from '../../src/shared/types'

// The focus-chat "Continue your desk conversation" import (Phase 3a.3, P5
// slice a). The honesty contract: every imported turn is the desk turn
// VERBATIM, plus at most one clearly-bracketed summary of proposals that
// really existed — and the conversation announces it was imported. Nothing is
// invented, nothing is faked as a live card.

function msg(role: 'user' | 'assistant', content: string, ts: number): ChatMessage {
  return { role, content, ts }
}

function proposal(id: string, title: string): ActionProposal {
  return { id, kind: 'create-task', title } as ActionProposal
}

describe('buildImportedConversation', () => {
  it('returns null when the desk thread has nothing to import', () => {
    expect(buildImportedConversation([], {}, 'My desk')).toBeNull()
  })

  it('announces the import in a header turn placed first, and in the title', () => {
    const out = buildImportedConversation(
      [msg('user', 'plan my week', 1000), msg('assistant', 'Here is a plan.', 2000)],
      {},
      'Launch prep'
    )
    expect(out).not.toBeNull()
    expect(out!.title).toContain('Launch prep')
    expect(out!.title.toLowerCase()).toContain('imported')
    const header = out!.messages[0]
    expect(header.role).toBe('assistant')
    expect(header.content).toContain('Imported from your desk conversation')
    expect(header.content).toContain('Launch prep')
    expect(header.content).toContain('2 turns')
    expect(header.ts).toBeLessThan(1000)
  })

  it('preserves every turn verbatim, in order, with its timestamp', () => {
    const turns = [
      msg('user', 'plan my week', 1000),
      msg('assistant', 'Here is a plan.', 2000),
      msg('user', 'tighten it', 3000)
    ]
    const out = buildImportedConversation(turns, {}, 'Desk')!
    const imported = out.messages.slice(1)
    expect(imported).toHaveLength(3)
    imported.forEach((m, i) => {
      expect(m.role).toBe(turns[i].role)
      expect(m.content).toBe(turns[i].content)
      expect(m.ts).toBe(turns[i].ts)
    })
  })

  it('summarises real proposals honestly instead of faking live cards', () => {
    const turns = [
      msg('user', 'set up tracking', 1000),
      msg('assistant', 'I can set these up.', 2000)
    ]
    const out = buildImportedConversation(
      turns,
      { '2000': [proposal('p1', 'Create tracker table'), proposal('p2', 'Add review task')] },
      'Desk'
    )!
    const assistantTurn = out.messages[2]
    expect(assistantTurn.content.startsWith('I can set these up.')).toBe(true)
    expect(assistantTurn.content).toContain('[This turn proposed 2 actions: Create tracker table, Add review task')
  })

  it('never fabricates: every turn is the original content plus at most a bracketed proposal summary', () => {
    const turns = [
      msg('user', 'set up tracking', 1000),
      msg('assistant', 'I can set these up.', 2000),
      msg('assistant', 'Anything else?', 3000)
    ]
    const proposals = { '2000': [proposal('p1', 'Create tracker table')] }
    const out = buildImportedConversation(turns, proposals, 'Desk')!
    const imported = out.messages.slice(1)
    imported.forEach((m, i) => {
      const original = turns[i].content
      expect(m.content.startsWith(original)).toBe(true)
      const extra = m.content.slice(original.length)
      if (extra !== '') {
        // The only permitted addition: one bracketed summary of proposals that
        // really exist for this exact turn.
        expect(extra).toMatch(/^\n\n\[This turn proposed \d+ actions?: .+\]$/)
        expect(proposals[String(turns[i].ts)]?.length ?? 0).toBeGreaterThan(0)
      }
    })
  })
})
