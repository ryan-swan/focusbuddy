import { describe, it, expect } from 'vitest'
import { routeIncomingMessage } from '../../src/renderer/src/stores/messaging'
import type { ChatMessage } from '../../src/renderer/src/lib/messagingClient'

function msg(id: string, parentId: string | null = null): ChatMessage {
  return {
    id,
    conversationId: 'c1',
    fromAccount: 'u1',
    body: id,
    attachment: null,
    createdAt: 1,
    reactions: [],
    parentId,
    replyCount: 0
  }
}
function state(): { messagesByConv: Record<string, ChatMessage[]>; threadsByParent: Record<string, ChatMessage[]> } {
  return { messagesByConv: { c1: [msg('root')] }, threadsByParent: {} }
}

describe('routeIncomingMessage', () => {
  it('appends a top-level message to the main timeline', () => {
    const next = routeIncomingMessage(state(), 'c1', msg('m2'))
    expect(next.messagesByConv.c1.map((m) => m.id)).toEqual(['root', 'm2'])
  })

  it('dedupes a top-level message already in the timeline', () => {
    const s = state()
    const next = routeIncomingMessage(s, 'c1', msg('root'))
    expect(next).toBe(s)
  })

  it('keeps a reply out of the main timeline and bumps the parent reply count', () => {
    const next = routeIncomingMessage(state(), 'c1', msg('r1', 'root'))
    // The reply is NOT in the main timeline.
    expect(next.messagesByConv.c1.map((m) => m.id)).toEqual(['root'])
    // The parent's reply count went up.
    expect(next.messagesByConv.c1.find((m) => m.id === 'root')!.replyCount).toBe(1)
  })

  it('adds a reply to its thread when the thread is loaded', () => {
    const s = state()
    s.threadsByParent = { root: [] }
    const next = routeIncomingMessage(s, 'c1', msg('r1', 'root'))
    expect(next.threadsByParent.root.map((m) => m.id)).toEqual(['r1'])
    expect(next.messagesByConv.c1.find((m) => m.id === 'root')!.replyCount).toBe(1)
  })

  it('does not double-count a reply already present in the loaded thread', () => {
    const s = state()
    s.threadsByParent = { root: [msg('r1', 'root')] }
    s.messagesByConv.c1 = [{ ...msg('root'), replyCount: 1 }]
    const next = routeIncomingMessage(s, 'c1', msg('r1', 'root'))
    expect(next.threadsByParent.root.map((m) => m.id)).toEqual(['r1'])
    expect(next.messagesByConv.c1.find((m) => m.id === 'root')!.replyCount).toBe(1)
  })

  it('counts a reply even when its thread panel is not open', () => {
    const next = routeIncomingMessage(state(), 'c1', msg('r1', 'root'))
    // No thread loaded, but the parent count still reflects the new reply.
    expect(next.threadsByParent.root).toBeUndefined()
    expect(next.messagesByConv.c1.find((m) => m.id === 'root')!.replyCount).toBe(1)
  })
})
