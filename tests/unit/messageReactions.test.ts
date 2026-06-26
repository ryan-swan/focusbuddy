import { describe, it, expect } from 'vitest'
import { applyReaction } from '../../src/renderer/src/stores/messaging'
import type { ChatMessage } from '../../src/renderer/src/lib/messagingClient'

function msg(id: string): ChatMessage {
  return { id, conversationId: 'c1', fromAccount: 'u1', body: 'hi', attachment: null, createdAt: 1, reactions: [] }
}
function base(): Record<string, ChatMessage[]> {
  return { c1: [msg('m1'), msg('m2')] }
}

describe('applyReaction', () => {
  it('adds a reaction with the reacting account', () => {
    const next = applyReaction(base(), { conversationId: 'c1', messageId: 'm1', emoji: '👍', accountId: 'a', added: true })
    const m1 = next.c1.find((m) => m.id === 'm1')!
    expect(m1.reactions).toEqual([{ emoji: '👍', accountIds: ['a'] }])
    // The other message is untouched.
    expect(next.c1.find((m) => m.id === 'm2')!.reactions).toEqual([])
  })

  it('is idempotent: the same account reacting twice does not double count', () => {
    let s = base()
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '👍', accountId: 'a', added: true })
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '👍', accountId: 'a', added: true })
    expect(s.c1.find((m) => m.id === 'm1')!.reactions).toEqual([{ emoji: '👍', accountIds: ['a'] }])
  })

  it('counts two different accounts on the same emoji', () => {
    let s = base()
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '🎉', accountId: 'a', added: true })
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '🎉', accountId: 'b', added: true })
    expect(s.c1.find((m) => m.id === 'm1')!.reactions[0].accountIds).toEqual(['a', 'b'])
  })

  it('removing a reaction drops the account and prunes the empty emoji entry', () => {
    let s = base()
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '❤️', accountId: 'a', added: true })
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '❤️', accountId: 'a', added: false })
    expect(s.c1.find((m) => m.id === 'm1')!.reactions).toEqual([])
  })

  it('keeps other reactors when one removes', () => {
    let s = base()
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '👍', accountId: 'a', added: true })
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '👍', accountId: 'b', added: true })
    s = applyReaction(s, { conversationId: 'c1', messageId: 'm1', emoji: '👍', accountId: 'a', added: false })
    expect(s.c1.find((m) => m.id === 'm1')!.reactions).toEqual([{ emoji: '👍', accountIds: ['b'] }])
  })

  it('is a no-op for an unknown conversation or message', () => {
    const s = base()
    expect(applyReaction(s, { conversationId: 'nope', messageId: 'm1', emoji: '👍', accountId: 'a', added: true })).toBe(s)
    const s2 = applyReaction(s, { conversationId: 'c1', messageId: 'nope', emoji: '👍', accountId: 'a', added: true })
    // The conversation array is rebuilt but no message changed.
    expect(s2.c1.every((m) => (m.reactions ?? []).length === 0)).toBe(true)
  })
})
