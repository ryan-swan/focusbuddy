import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore, NEW_CHAT_KEY } from '../../src/renderer/src/stores/chat'
import type { JSONContent } from '@tiptap/core'

// A1, defect AI-16: clicking out of the chat onto the desk deleted what was
// being typed, because the draft lived only in the (unmounting) TipTap editor.
// The store now keeps the draft document per conversation. These lock the
// lifecycle: set, overwrite, clear-on-null, and the two paths that must
// deliberately drop a draft (New chat, Clear chat).

function doc(text: string): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

beforeEach(() => {
  useChatStore.setState({ draftDocByThread: {} })
})

describe('composer draft persistence', () => {
  it('keeps a draft per thread and overwrites in place', () => {
    const s = useChatStore.getState()
    s.setThreadDraft('conv-a', doc('hello'))
    s.setThreadDraft('conv-b', doc('other'))
    s.setThreadDraft('conv-a', doc('hello world'))
    const drafts = useChatStore.getState().draftDocByThread
    expect(drafts['conv-a']).toEqual(doc('hello world'))
    expect(drafts['conv-b']).toEqual(doc('other'))
  })

  it('null deletes the entry — an emptied composer has no draft', () => {
    const s = useChatStore.getState()
    s.setThreadDraft('conv-a', doc('typed'))
    s.setThreadDraft('conv-a', null)
    expect('conv-a' in useChatStore.getState().draftDocByThread).toBe(false)
  })

  it('New chat drops the unsaved chat draft but never a real conversation’s', () => {
    const s = useChatStore.getState()
    s.setThreadDraft(NEW_CHAT_KEY, doc('half a thought'))
    s.setThreadDraft('conv-a', doc('kept'))
    s.newConversation()
    const drafts = useChatStore.getState().draftDocByThread
    expect(NEW_CHAT_KEY in drafts).toBe(false)
    expect(drafts['conv-a']).toEqual(doc('kept'))
  })

  it('Clear chat drops exactly that thread’s draft', () => {
    const s = useChatStore.getState()
    s.setThreadDraft('conv-a', doc('goes'))
    s.setThreadDraft('conv-b', doc('stays'))
    s.clear('conv-a')
    const drafts = useChatStore.getState().draftDocByThread
    expect('conv-a' in drafts).toBe(false)
    expect(drafts['conv-b']).toEqual(doc('stays'))
  })
})
