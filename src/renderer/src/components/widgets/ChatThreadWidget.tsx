import { useEffect, useMemo } from 'react'
import type { Widget } from '@shared/types'
import { useMessagingStore } from '../../stores/messaging'
import { useViewStore } from '../../stores/view'
import { useWidgetStore } from '../../stores/widgets'
import Icon from '../Icon'

// A canvas widget that pins a PlexiChat conversation to a desk. content holds
// JSON { conversationId, channelName }. Empty content shows a picker; once a
// conversation is chosen it renders a compact live view of the latest messages
// (read from the messaging store, never copied into the widget) plus an Open
// button that jumps to the full conversation.

interface ThreadConfig {
  conversationId: string
  channelName: string
}

function parseConfig(content: string): ThreadConfig | null {
  if (!content.trim()) return null
  try {
    const c = JSON.parse(content) as Partial<ThreadConfig>
    if (typeof c.conversationId === 'string' && c.conversationId) {
      return { conversationId: c.conversationId, channelName: c.channelName ?? 'Conversation' }
    }
  } catch {
    /* fall through to picker */
  }
  return null
}

export default function ChatThreadWidget({ widget }: { widget: Widget }): JSX.Element {
  const config = useMemo(() => parseConfig(widget.content ?? ''), [widget.content])
  const conversations = useMessagingStore((s) => s.conversations)
  const messagesByConv = useMessagingStore((s) => s.messagesByConv)
  const openConversation = useMessagingStore((s) => s.openConversation)
  const refresh = useMessagingStore((s) => s.refreshConversations)
  const goMessages = useViewStore((s) => s.goMessages)
  const updateWidget = useWidgetStore((s) => s.update)

  useEffect(() => {
    if (conversations.length === 0) void refresh()
  }, [conversations.length, refresh])

  // Empty state: pick a conversation to pin.
  if (!config) {
    return (
      <div className="h-full w-full flex flex-col bg-[var(--surface-base)] text-[var(--ink-90)]">
        <div className="px-3 py-2 border-b border-[var(--edge-soft)] text-[12px] font-semibold flex items-center gap-1.5">
          <Icon name="forum" size={14} className="text-accent" />
          Pin a conversation
        </div>
        <div className="flex-1 overflow-auto p-1">
          {conversations.length === 0 ? (
            <div className="p-3 text-[12px] text-[var(--ink-50)]">
              No conversations yet. Start one in Messages, then pin it here.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  void updateWidget(widget.id, {
                    content: JSON.stringify({ conversationId: c.id, channelName: c.title })
                  })
                }
                data-testid={`chat-thread-pick-${c.id}`}
                className="block w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-[var(--surface-sunken)] truncate"
              >
                <Icon name={c.kind === 'dm' ? 'person' : 'tag'} size={12} className="mr-1 text-[var(--ink-50)]" />
                {c.title}
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  const messages = messagesByConv[config.conversationId] ?? []
  const recent = messages.slice(-6)

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-base)] text-[var(--ink-90)]">
      <div className="px-3 py-2 border-b border-[var(--edge-soft)] flex items-center gap-1.5">
        <Icon name="forum" size={14} className="text-accent shrink-0" />
        <span className="text-[12px] font-semibold truncate flex-1">{config.channelName}</span>
        <button
          onClick={() => {
            goMessages()
            void openConversation(config.conversationId)
          }}
          data-testid="chat-thread-open"
          className="shrink-0 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
        >
          Open <Icon name="open_in_full" size={11} />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2 space-y-1.5">
        {recent.length === 0 ? (
          <div className="text-[12px] text-[var(--ink-50)]">No messages loaded. Open to view the conversation.</div>
        ) : (
          recent.map((m) => (
            <div key={m.id} className="text-[12px] leading-snug">
              <span className="text-[var(--ink-100)] whitespace-pre-wrap break-words">
                {m.deletedAt ? <span className="italic text-[var(--ink-50)]">message deleted</span> : m.body || '[attachment]'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
