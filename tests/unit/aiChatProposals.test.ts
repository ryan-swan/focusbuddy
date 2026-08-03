import { describe, it, expect } from 'vitest'
import { routeIncomingMessage, mapMessage } from '../../src/renderer/src/stores/messaging'
import type { ChatMessage } from '../../src/renderer/src/lib/messagingClient'
import type { ActionProposal } from '../../src/shared/types'

// PlexiChat P4: the AI member's proposals ride on a chat message and are consumed
// (removed) once applied or dismissed. These cover the transport + consume logic
// the MessagesView cards depend on.

const props: ActionProposal[] = [
  { id: 'task-1', kind: 'create-task', title: 'Ship P4' },
  { id: 'kb-1', kind: 'create-knowledge-entry', title: 'Decision', body: 'BYOK' }
]

function botMsg(id: string, proposals: ActionProposal[] | null): ChatMessage {
  return {
    id,
    conversationId: 'c1',
    fromAccount: 'plexi',
    body: 'here are some options',
    attachment: null,
    createdAt: 2,
    reactions: [],
    parentId: null,
    replyCount: 0,
    proposals
  }
}

describe('AI chat proposals transport + consume', () => {
  it('carries proposals through routeIncomingMessage onto the timeline', () => {
    const s = { messagesByConv: { c1: [] as ChatMessage[] }, threadsByParent: {} }
    const next = routeIncomingMessage(s, 'c1', botMsg('m1', props))
    const m = next.messagesByConv.c1[0]
    expect(m.proposals?.map((p) => p.id)).toEqual(['task-1', 'kb-1'])
  })

  it('consuming one proposal removes only that card', () => {
    const byConv = { c1: [botMsg('m1', props)] }
    const next = mapMessage(byConv, 'c1', 'm1', (m) => ({
      ...m,
      proposals: (m.proposals ?? []).filter((p) => p.id !== 'task-1')
    }))
    expect(next.c1[0].proposals?.map((p) => p.id)).toEqual(['kb-1'])
  })

  it('a human message carries no proposals', () => {
    const s = { messagesByConv: { c1: [] as ChatMessage[] }, threadsByParent: {} }
    const next = routeIncomingMessage(s, 'c1', botMsg('m2', null))
    expect(next.messagesByConv.c1[0].proposals ?? null).toBeNull()
  })
})
