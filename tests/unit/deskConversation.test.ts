import { describe, it, expect } from 'vitest'
import { conversationForDesk } from '../../src/renderer/src/lib/deskConversation'
import type { AiChatConversationMeta } from '../../src/shared/types'

// A5, AI-04 (R24): the reverse read from a desk to the conversation that
// built it. Primary link outranks a mere link; recency breaks ties.

function conv(id: string, linkedDesks: string[], updatedAt: number): AiChatConversationMeta {
  return {
    id,
    taskId: null,
    title: `conv ${id}`,
    createdAt: updatedAt,
    updatedAt,
    linkedDesks,
    mode: 'chat'
  }
}

describe('conversationForDesk', () => {
  it('finds the conversation holding the desk as primary', () => {
    const all = [conv('a', ['other'], 5), conv('b', ['desk-1', 'x'], 3)]
    expect(conversationForDesk(all, 'desk-1')?.id).toBe('b')
  })

  it('primary outranks a newer non-primary link', () => {
    const all = [conv('linked', ['x', 'desk-1'], 9), conv('primary', ['desk-1'], 2)]
    expect(conversationForDesk(all, 'desk-1')?.id).toBe('primary')
  })

  it('falls back to the newest non-primary link', () => {
    const all = [conv('old', ['x', 'desk-1'], 2), conv('new', ['y', 'desk-1'], 8)]
    expect(conversationForDesk(all, 'desk-1')?.id).toBe('new')
  })

  it('two primaries: the newest wins', () => {
    const all = [conv('old', ['desk-1'], 2), conv('new', ['desk-1'], 8)]
    expect(conversationForDesk(all, 'desk-1')?.id).toBe('new')
  })

  it('no link, no conversation — and a null desk asks for nothing', () => {
    const all = [conv('a', ['other'], 5)]
    expect(conversationForDesk(all, 'desk-1')).toBeNull()
    expect(conversationForDesk(all, null)).toBeNull()
  })
})
