// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── DEC-124 — the bell means Attention. In the panel, PlexiiMessage's
// notification-level bell is gone (it looked like the Attention bell and
// wasn't); every message grows a bell that runs the house capture prompt —
// classify first, Respond by default — and the item it files points back at
// the message, so the queue can route you to it.

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, 'src', p), 'utf-8')
const messages = read('renderer/src/components/views/MessagesView.tsx')
const attention = read('renderer/src/components/views/AttentionView.tsx')

describe('DEC-124 — the message bell', () => {
  it('the notification-level bell stays on the Office page and leaves the panel', () => {
    expect(messages).toContain("{activeId && !compact && (\n                  <button\n                    onClick={() => {\n                      const cur = activeConv?.notifLevel ?? 'all'")
    expect(messages).toContain('data-testid="messages-notif"')
  })

  it('every message, mine or theirs, wears a bell that opens the house capture prompt', () => {
    // DEC-125 renamed the bell (CaptureBell → MessageBell) when it learned the widget's marked state
    expect(messages).toContain('function MessageBell({')
    expect(messages).toContain('data-testid={`msg-attention-${m.id}`}')
    // DEC-126: one action cluster serves both sides (mine to the left of the
    // bubble, theirs to the right), so the bell is rendered once, guarded by
    // the cluster's own `!deleted && !editing`.
    expect(messages).toContain('const actions = !deleted && !editing && (')
    expect(messages).toContain('{onCapture && <MessageBell m={m} marked={marked} onCapture={onCapture} />}')
    expect(messages).toContain('onCapture={() => captureMessage(m)}')
  })

  it('the capture is the house command: prefilled, Respond by default, pointed back at the message', () => {
    expect(messages).toContain("new CustomEvent('fb:command-new-work-item', {")
    expect(messages).toContain("const p = presetForSelection('chat', text)")
    expect(messages).toContain("sourceType: 'message',")
    expect(messages).toContain('sourceRef: m.conversationId,')
    expect(messages).toContain("intentClass: 'to_respond',")
    expect(messages).toContain('sourceUrl: buildMessageUrl(m.conversationId, m.id)')
    // nothing files from the bell itself — the confirm card does, on the person's say-so
    expect(messages).not.toContain('workItems.create(')
  })

  it('the Attention page routes a message link back to its conversation, at the message', () => {
    expect(attention).toContain("import { parseMessageUrl } from '../../lib/messageLink'")
    expect(attention).toContain('function openConversationAt(conversationId: string, messageId: string | null): void {')
    expect(attention).toContain('void useMessagingStore.getState().openConversation(conversationId)')
    expect(attention).toContain('else if (msg) openConversationAt(msg.conversationId, msg.messageId)')
    expect(attention).toContain("? 'Open the conversation at this message'")
  })
})
