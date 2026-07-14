import { describe, it, expect } from 'vitest'
import type { ActionProposal, ChatMessage } from '../../src/shared/types'
import {
  deriveAssistantBlocks,
  connectorForProposal
} from '../../src/renderer/src/lib/chatBlocks'

const msg = (content: string): ChatMessage => ({ role: 'assistant', content, ts: 1 })

describe('deriveAssistantBlocks', () => {
  it('a plain reply becomes a single text block', () => {
    const blocks = deriveAssistantBlocks(msg('Hello there'), [])
    expect(blocks).toEqual([{ kind: 'text', markdown: 'Hello there' }])
  })

  it('an empty reply with no proposals yields no blocks', () => {
    expect(deriveAssistantBlocks(msg('   '), [])).toEqual([])
  })

  it('a non-connector proposal becomes an action block after the text', () => {
    const p: ActionProposal = { id: 'a1', kind: 'create-task', title: 'Ship it' }
    const blocks = deriveAssistantBlocks(msg("Here's a task"), [p])
    expect(blocks).toEqual([
      { kind: 'text', markdown: "Here's a task" },
      { kind: 'action', proposal: p }
    ])
  })

  it('connector-shaped proposals become connector-action blocks with the right connector', () => {
    const mail: ActionProposal = { id: 'm1', kind: 'compose-mail', to: ['a@b.com'], subject: 'Hi', body: '...' }
    const cal: ActionProposal = { id: 'c1', kind: 'schedule-event', title: 'Sync', startMs: 1, durationMinutes: 30 }
    const blocks = deriveAssistantBlocks(msg(''), [mail, cal])
    expect(blocks).toEqual([
      { kind: 'connector-action', connector: 'gmail', label: 'compose-mail', proposal: mail },
      { kind: 'connector-action', connector: 'calendar', label: 'schedule-event', proposal: cal }
    ])
  })

  it('mixes text, action, and connector-action in order', () => {
    const task: ActionProposal = { id: 't1', kind: 'create-task', title: 'A' }
    const mail: ActionProposal = { id: 'm1', kind: 'compose-mail', to: [], subject: '', body: '' }
    const blocks = deriveAssistantBlocks(msg('Doing two things'), [task, mail])
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'action', 'connector-action'])
  })
})

describe('connectorForProposal', () => {
  it('maps the known connector kinds and nothing else', () => {
    expect(connectorForProposal({ id: '1', kind: 'compose-mail', to: [], subject: '', body: '' })).toBe('gmail')
    expect(connectorForProposal({ id: '2', kind: 'schedule-event', title: 'x', startMs: 0, durationMinutes: 1 })).toBe('calendar')
    expect(connectorForProposal({ id: '3', kind: 'post-chat', conversationId: 'c', body: 'x' })).toBe('chat')
    expect(connectorForProposal({ id: '4', kind: 'create-task', title: 'x' })).toBeNull()
  })
})
