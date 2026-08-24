import { describe, it, expect } from 'vitest'
import type { ActionProposal, ChatMessage, ChatSource } from '../../src/shared/types'
import {
  deriveAssistantBlocks,
  connectorForProposal,
  connectorForKind,
  connectorMeta
} from '../../src/renderer/src/lib/chatBlocks'

const msg = (content: string): ChatMessage => ({ role: 'assistant', content, ts: 1 })

const src = (n: number, title: string): ChatSource => ({
  n,
  docId: `doc-${n}`,
  title,
  docType: 'document',
  snippet: `snippet ${n}`
})

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

// Retrieval is not grounding. Retrieval runs on every message; a chip means the
// answer actually leaned on that document. The bug these pin: an answer reading
// "I don't have Ryan's email address" arrived carrying six source chips.
describe('deriveAssistantBlocks — only cited sources earn a chip', () => {
  const six = [1, 2, 3, 4, 5, 6].map((n) => src(n, `Doc ${n}`))

  it('emits no sources block when the answer cites nothing', () => {
    const blocks = deriveAssistantBlocks(
      msg("I don't have Ryan's email address in your canvas or context."),
      [],
      six
    )
    expect(blocks.map((b) => b.kind)).toEqual(['text'])
  })

  it('emits only the sources the answer actually cites, in order', () => {
    const blocks = deriveAssistantBlocks(
      msg('The signing cert is still unsigned [2], and the checklist is stale [5].'),
      [],
      six
    )
    const sources = blocks.find((b) => b.kind === 'sources')
    expect(sources).toBeDefined()
    expect(sources!.kind === 'sources' && sources!.sources.map((s) => s.n)).toEqual([2, 5])
  })

  it('ignores a marker that points at a source that was never retrieved', () => {
    // The model was told never to write a number outside the list. If it does
    // anyway, there is nothing to chip — an invented number must not conjure one.
    const blocks = deriveAssistantBlocks(msg('Per the roadmap [9].'), [], [src(1, 'Doc 1')])
    expect(blocks.map((b) => b.kind)).toEqual(['text'])
  })

  it('does not chip a number that only appears inside a code sample', () => {
    const blocks = deriveAssistantBlocks(
      msg(['Use this:', '', '```ts', 'const first = rows[1]', '```'].join('\n')),
      [],
      [src(1, 'Doc 1')]
    )
    expect(blocks.map((b) => b.kind)).toEqual(['text'])
  })

  it('still puts the chip row directly under the prose when there IS a citation', () => {
    const blocks = deriveAssistantBlocks(msg('Grounded in the checklist [1].'), [], [src(1, 'Doc 1')])
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'sources'])
  })

  it('never emits a sources block on a turn with no prose', () => {
    // A bare action turn makes no claims, so there is nothing to support.
    const p: ActionProposal = { id: 'a1', kind: 'create-task', title: 'Ship it' }
    const blocks = deriveAssistantBlocks(msg(''), [p], six)
    expect(blocks.map((b) => b.kind)).toEqual(['action'])
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

// The trace names an action before it has been sanitised into a proposal, so it
// looks the connector up by raw kind. Both lookups must agree or the same action
// wears one icon in the trace and another on its card.
describe('connectorForKind', () => {
  it('agrees with connectorForProposal on every known kind', () => {
    expect(connectorForKind('compose-mail')).toBe(
      connectorForProposal({ id: '1', kind: 'compose-mail', to: [], subject: '', body: '' })
    )
    expect(connectorForKind('schedule-event')).toBe(
      connectorForProposal({ id: '2', kind: 'schedule-event', title: 'x', startMs: 0, durationMinutes: 1 })
    )
    expect(connectorForKind('post-chat')).toBe(
      connectorForProposal({ id: '3', kind: 'post-chat', conversationId: 'c', body: 'x' })
    )
  })

  it('returns null for a kind with no connector, including an unknown one', () => {
    expect(connectorForKind('create-task')).toBeNull()
    expect(connectorForKind('summon-dragon')).toBeNull()
  })
})

describe('connectorMeta', () => {
  it('gives each known connector its icon and label', () => {
    expect(connectorMeta('gmail')).toEqual({ icon: 'mail', label: 'Email' })
    expect(connectorMeta('calendar')).toEqual({ icon: 'calendar_month', label: 'Calendar' })
    expect(connectorMeta('chat')).toEqual({ icon: 'chat', label: 'Message' })
  })

  it('falls back rather than breaking on a connector it has never seen', () => {
    expect(connectorMeta('slack')).toEqual({ icon: 'bolt', label: 'slack' })
  })
})

// A4 (AI-09, R3): a build batch rides as ONE action-group so Apply all and
// the per-card checkboxes work over the real group.
describe('deriveAssistantBlocks — the action group', () => {
  it('two or more plain proposals become one action-group block', () => {
    const proposals: ActionProposal[] = [
      { id: 'a', kind: 'create-todo-list', title: 'Checklist', items: [] },
      { id: 'b', kind: 'create-task', title: 'Hub' }
    ]
    const blocks = deriveAssistantBlocks(msg('Setting up.'), proposals)
    expect(blocks).toEqual([
      { kind: 'text', markdown: 'Setting up.' },
      { kind: 'action-group', proposals }
    ])
  })

  it('a single plain proposal keeps its single action block', () => {
    const one: ActionProposal[] = [{ id: 'a', kind: 'create-task', title: 'Hub' }]
    const blocks = deriveAssistantBlocks(msg(''), one)
    expect(blocks).toEqual([{ kind: 'action', proposal: one[0] }])
  })

  it('connector proposals keep their branded blocks beside the group', () => {
    const mail: ActionProposal = {
      id: 'm',
      kind: 'compose-mail',
      to: ['a@b.co'],
      subject: 's',
      body: 'b'
    }
    const plainA: ActionProposal = { id: 'a', kind: 'create-task', title: 'Hub' }
    const plainB: ActionProposal = { id: 'b', kind: 'create-todo-list', title: 'List', items: [] }
    const blocks = deriveAssistantBlocks(msg(''), [plainA, mail, plainB])
    expect(blocks).toEqual([
      { kind: 'action-group', proposals: [plainA, plainB] },
      { kind: 'connector-action', connector: 'gmail', label: 'compose-mail', proposal: mail }
    ])
  })
})
