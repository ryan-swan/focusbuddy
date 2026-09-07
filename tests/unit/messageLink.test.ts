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
    // DEC-127: a parsed link also carries the reply's parent (null for a top-level message)
    expect(parseMessageUrl(url)).toEqual({ conversationId: 'conv-1', messageId: 'msg-9', parentId: null })
  })
  it('a conversation alone has no message', () => {
    expect(parseMessageUrl(buildMessageUrl('conv-1'))).toEqual({ conversationId: 'conv-1', messageId: null, parentId: null })
  })
  it('encodes what needs encoding and decodes it back', () => {
    const url = buildMessageUrl('a b/c', 'x&y')
    expect(url).toBe('plexii://message/a%20b%2Fc?m=x%26y')
    expect(parseMessageUrl(url)).toEqual({ conversationId: 'a b/c', messageId: 'x&y', parentId: null })
  })
  it('refuses anything that is not a message link', () => {
    expect(parseMessageUrl(null)).toBeNull()
    expect(parseMessageUrl('')).toBeNull()
    expect(parseMessageUrl('https://example.com')).toBeNull()
    expect(parseMessageUrl('plexii://meeting/m1?seg=s1')).toBeNull()
    expect(parseMessageUrl('plexii://message/')).toBeNull()
  })
})

describe('DEC-127 — a reply names its parent, so the way back can open its thread', () => {
  it('builds and parses conversation + message + parent', () => {
    const url = buildMessageUrl('conv-1', 'reply-3', 'msg-9')
    expect(url).toBe('plexii://message/conv-1?m=reply-3&p=msg-9')
    expect(parseMessageUrl(url)).toEqual({ conversationId: 'conv-1', messageId: 'reply-3', parentId: 'msg-9' })
  })
  it('a top-level message has no parent, even when one is passed as null', () => {
    expect(buildMessageUrl('conv-1', 'msg-9', null)).toBe('plexii://message/conv-1?m=msg-9')
    expect(parseMessageUrl('plexii://message/conv-1?m=msg-9')?.parentId).toBeNull()
  })
  it('a parent without a message means nothing', () => {
    expect(buildMessageUrl('conv-1', null, 'msg-9')).toBe('plexii://message/conv-1')
    expect(parseMessageUrl('plexii://message/conv-1?p=msg-9')).toEqual({ conversationId: 'conv-1', messageId: null, parentId: null })
  })
  it('encodes the parent like the rest', () => {
    const url = buildMessageUrl('c', 'm&1', 'p&2')
    expect(url).toBe('plexii://message/c?m=m%261&p=p%262')
    expect(parseMessageUrl(url)).toEqual({ conversationId: 'c', messageId: 'm&1', parentId: 'p&2' })
  })
})
