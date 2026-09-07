// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
const router = read('src/renderer/src/lib/openMessage.ts')
const store = read('src/renderer/src/stores/messaging.ts')
const messages = read('src/renderer/src/components/views/MessagesView.tsx')
const attention = read('src/renderer/src/components/views/AttentionView.tsx')
const editor = read('src/renderer/src/components/AttentionItemEditor.tsx')

// DEC-127 — the way back from an Attention item to the message it was filed
// from: the floating assistant opens on PlexiiMessage, the conversation opens
// on that person, and the view lands on the exact message.

describe('dec_127 — one router, the floating assistant on PlexiiMessage', () => {
  it('opens the panel on the messages tab, the conversation, and asks the view to land', () => {
    expect(router).toContain('export function openMessageInPanel(')
    expect(router).toContain('messaging.landOn(messageId, parentId)')
    expect(router).toContain('void messaging.openConversation(conversationId)')
    expect(router).toContain("chrome.setTab('messages')")
    expect(router).toContain('chrome.openPanel()')
    // never the Chat page
    expect(router).not.toContain('goMessages')
  })

  it('a link router that falls through when the URL is not a message link', () => {
    expect(router).toContain('export function openMessageLink(url: string | null | undefined): boolean {')
    expect(router).toContain('if (!msg) return false')
    expect(router).toContain('openMessageInPanel(msg.conversationId, msg.messageId, msg.parentId)')
  })
})

describe('dec_127 — the store carries the landing, the view consumes it once', () => {
  it('the flag names the message, its parent for a reply, and when it was asked for', () => {
    expect(store).toContain('landOnMessage: { messageId: string; parentId: string | null; at: number } | null')
    expect(store).toContain('landOn: (messageId: string | null, parentId?: string | null) => void')
    expect(store).toContain('landOnMessage: null,')
    expect(store).toContain("set({ landOnMessage: messageId ? { messageId, parentId: parentId ?? null, at: Date.now() } : null })")
  })

  it('the view lands AFTER the pin-to-newest effect, shows the thread pane first in the panel, opens a reply\'s thread, and expires', () => {
    const pinAt = messages.indexOf('// Keep the thread pinned to the newest message.')
    const landAt = messages.indexOf('// DEC-127 — land on the message the route back from Attention named.')
    expect(pinAt).toBeGreaterThan(0)
    expect(landAt).toBeGreaterThan(pinAt)
    expect(messages).toContain("if (compact && compactPane !== 'thread') {\n      setCompactPane('thread')\n      return\n    }")
    expect(messages).toContain('if (messages.some((m) => m.id === parentId)) void openThread(parentId)')
    expect(messages).toContain('if (!(threadsByParent[parentId] ?? []).some((m) => m.id === messageId)) return')
    expect(messages).toContain('if (Date.now() - landOnMessage.at > 8000) {')
    expect(messages).toContain('jumpToMessage(messageId)\n    landOn(null)')
    // the same flash the Recall citations use — one landing, everywhere
    expect(messages).toContain("el.style.backgroundColor = 'rgb(var(--accent) / 0.14)'")
  })

  it('a bell on a reply files a link that names the parent', () => {
    expect(messages).toContain('sourceUrl: buildMessageUrl(m.conversationId, m.id, m.parentId ?? null)')
  })
})

describe('dec_127 — every door on the Attention page goes through the router', () => {
  it('the row: the message chip is a button (like the DEC-079 meeting chip) and the source door routes', () => {
    expect(attention).toContain("import { openMessageLink } from '../../lib/openMessage'")
    expect(attention).toContain('data-testid="item-message-link"')
    expect(attention).toContain("ctx.source && ctx.source.type === 'message' && parseMessageUrl(i.sourceUrl) ? (")
    expect(attention).toContain('onClick={() => openMessageLink(i.sourceUrl)}')
    expect(attention).toContain('else if (!openMessageLink(i.sourceUrl)) void window.api.files.openExternal(i.sourceUrl!)')
    // the plain chip stays for every other source
    expect(attention).toContain('<Icon name="widgets" size={10} />')
    // the Chat-page route is retired
    expect(attention).not.toContain('openConversationAt(')
    expect(attention).not.toContain("useMessagingStore")
  })

  it('the editor: its Source link routes a message link and says what it opens', () => {
    expect(editor).toContain("import { openMessageLink } from '../lib/openMessage'")
    expect(editor).toContain('if (!openMessageLink(item.sourceUrl)) void window.api.files.openExternal(item.sourceUrl!)')
    expect(editor).toContain("if (parseMessageUrl(item.sourceUrl)) return 'The message, in PlexiiMessage'")
    expect(editor).toContain("<Icon name={parseMessageUrl(item.sourceUrl) ? 'forum' : 'link'} size={13} className=\"shrink-0\" />")
    // DEC-091's web deep link still opens externally
    expect(editor).toContain('data-testid="item-source-link"')
  })
})
