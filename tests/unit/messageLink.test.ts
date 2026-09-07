// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildMessageUrl, parseMessageUrl } from '../../src/renderer/src/lib/messageLink'

// DEC-124 — a message bell files an Attention item that points back at the
// conversation and the message. The URL is internal (plexii://), like the
// meeting moment link, and round-trips exactly.

describe('DEC-124 — the message moment link', () => {
  it('builds and parses a conversation + message', () => {
    const url = buildMessageUrl('conv-1', 'msg-9')
    expect(url).toBe('plexii://message/conv-1?m=msg-9')
    expect(parseMessageUrl(url)).toEqual({ conversationId: 'conv-1', messageId: 'msg-9' })
  })
  it('a conversation alone has no message', () => {
    expect(parseMessageUrl(buildMessageUrl('conv-1'))).toEqual({ conversationId: 'conv-1', messageId: null })
  })
  it('encodes what needs encoding and decodes it back', () => {
    const url = buildMessageUrl('a b/c', 'x&y')
    expect(url).toBe('plexii://message/a%20b%2Fc?m=x%26y')
    expect(parseMessageUrl(url)).toEqual({ conversationId: 'a b/c', messageId: 'x&y' })
  })
  it('refuses anything that is not a message link', () => {
    expect(parseMessageUrl(null)).toBeNull()
    expect(parseMessageUrl('')).toBeNull()
    expect(parseMessageUrl('https://example.com')).toBeNull()
    expect(parseMessageUrl('plexii://meeting/m1?seg=s1')).toBeNull()
    expect(parseMessageUrl('plexii://message/')).toBeNull()
  })
})
