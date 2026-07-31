// The conversation list (Phase 4.6). One component, two containers: a permanent
// rail in fullscreen, where there is room for it, and an overlay in sidebar and
// floating, where there is not (plan D10).
//
// Every row is a real persisted conversation. The context badge shows the screen
// it was STARTED on — and only when it genuinely recorded one, so conversations
// written before unification show no badge rather than a guess.

import Icon from '../Icon'
import type { AiChatConversationMeta } from '@shared/types'

interface Props {
  conversations: AiChatConversationMeta[]
  activeId: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  // Fullscreen renders this as a rail; the other modes float it over the panel.
  variant: 'rail' | 'overlay'
}

function whenLabel(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function ConversationList({
  conversations,
  activeId,
  onOpen,
  onNew,
  onDelete,
  variant
}: Props): JSX.Element {
  const isRail = variant === 'rail'
  return (
    <div
      data-testid={isRail ? 'conversation-rail' : 'conversation-overlay'}
      className={
        isRail
          ? 'w-[220px] shrink-0 h-full flex flex-col border-r border-[var(--edge-soft)] bg-[var(--surface-sunken)]/40'
          : 'absolute inset-x-2 top-11 z-30 max-h-[60%] flex flex-col rounded-xl border border-[var(--edge-firm)] bg-[var(--surface-raised)] shadow-xl overflow-hidden'
      }
    >
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={onNew}
          data-testid="conversation-new"
          title="New chat (⌘O)"
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-[rgb(var(--accent)/0.45)] transition-colors text-[12px] text-[var(--ink-80)]"
        >
          <Icon name="add" size={14} className="text-accent shrink-0" />
          <span>New chat</span>
          <span className="ml-auto text-[9.5px] font-mono text-[var(--ink-40)]">⌘O</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-[var(--ink-40)]">
            Your conversations will appear here.
          </p>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              data-testid="conversation-row"
              data-conversation-id={c.id}
              data-active={c.id === activeId ? 'true' : 'false'}
              className={`group/conv flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                c.id === activeId
                  ? 'bg-[rgb(var(--accent)/0.12)] border border-[rgb(var(--accent)/0.30)]'
                  : 'border border-transparent hover:bg-[var(--surface-sunken)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="min-w-0 flex-1 text-left"
                title={c.title || 'Untitled conversation'}
              >
                <span className="block text-[12px] text-[var(--ink-90)] truncate">
                  {c.title || 'Untitled conversation'}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--ink-40)]">
                  {/* Only shown when the conversation genuinely recorded where
                      it began. A pre-unification row knows nothing, and says so
                      by showing nothing. */}
                  {c.context && (
                    <>
                      <Icon name={c.context.icon} size={10} className="shrink-0" />
                      <span className="truncate max-w-[90px]">
                        {c.context.title || c.context.label}
                      </span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <span className="shrink-0">{whenLabel(c.updatedAt)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                aria-label={`Delete ${c.title || 'conversation'}`}
                title="Delete this conversation"
                data-testid="conversation-delete"
                className="shrink-0 opacity-0 group-hover/conv:opacity-60 hover:!opacity-100 transition-opacity grid place-items-center text-[var(--ink-50)] hover:text-[var(--ink-100)]"
              >
                <Icon name="delete" size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
