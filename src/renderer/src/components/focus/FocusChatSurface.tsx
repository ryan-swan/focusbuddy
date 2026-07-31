import { useEffect, useRef, useState } from 'react'
import { useFocusChatStore } from '../../stores/focusChat'
import { useChatStore } from '../../stores/chat'
import { deriveAssistantBlocks } from '../../lib/chatBlocks'
import ChatBlockView from './ChatBlockView'
import { useNodeStore } from '../../stores/nodes'
import Icon from '../Icon'

interface Props {
  // Jump to a real workspace item when a block links to one (widget cards).
  onOpenWidget?: (widgetId: string) => void
}

// The full-size "AI Chat" action tab: the agentic workspace assistant rendered
// as a typed-block thread, backed by a PERSISTED store (useFocusChatStore) so
// conversations survive restart and past chats can be reopened. Free-standing
// conversations: a chat has its own id, "New chat" starts a fresh one, and the
// history panel lists them all. Reuses the existing chat backend end-to-end.
export default function FocusChatSurface({ onOpenWidget }: Props): JSX.Element {
  const activeTaskId = useNodeStore((s) => s.activeTaskId)
  const send = useFocusChatStore((s) => s.send)
  const sending = useFocusChatStore((s) => s.sending)
  const hasApiKey = useFocusChatStore((s) => s.hasApiKey)
  const checkApiKey = useFocusChatStore((s) => s.checkApiKey)
  const messages = useFocusChatStore((s) => s.messages)
  const proposalsByMessage = useFocusChatStore((s) => s.proposalsByMessage)
  const appliedProposals = useFocusChatStore((s) => s.appliedProposals)
  const markProposalApplied = useFocusChatStore((s) => s.markProposalApplied)
  const consumeProposal = useFocusChatStore((s) => s.consumeProposal)
  const conversations = useFocusChatStore((s) => s.conversations)
  const activeConversationId = useFocusChatStore((s) => s.activeConversationId)
  const refreshConversations = useFocusChatStore((s) => s.refreshConversations)
  const newConversation = useFocusChatStore((s) => s.newConversation)
  const openConversation = useFocusChatStore((s) => s.openConversation)
  const deleteConversation = useFocusChatStore((s) => s.deleteConversation)
  const importDeskConversation = useFocusChatStore((s) => s.importDeskConversation)
  // The desk panel's thread for this task — when it has turns, the empty state
  // offers to continue that conversation here (Phase 3a.3). Count only; the
  // import itself re-reads the store at tap time.
  const deskTurnCount = useChatStore((s) =>
    activeTaskId ? (s.messagesByTask[activeTaskId] ?? []).length : 0
  )

  const [draft, setDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // On mount: check the key + load history. Start a fresh chat ONLY when nothing
  // is already open — the store is module-level and survives this component
  // unmounting (which happens on every widget/tab switch), so we must NOT wipe a
  // conversation the user opened from history just because they navigated away
  // and back. A truly first-time mount has no active id and no messages → fresh.
  useEffect(() => {
    void checkApiKey()
    void refreshConversations()
    const s = useFocusChatStore.getState()
    if (!s.activeConversationId && s.messages.length === 0) newConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, sending])

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setDraft('')
    await send(content)
  }

  async function handleOpenConversation(id: string): Promise<void> {
    await openConversation(id)
    setHistoryOpen(false)
  }

  const suggestions = [
    { icon: 'travel_explore', text: 'What have I got open across my workspace right now?' },
    { icon: 'checklist', text: 'Turn what I said into a task list' },
    { icon: 'table_chart', text: 'Make a table to track this' },
    { icon: 'arrow_forward', text: 'What should I work on next?' }
  ]

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-raised)]" data-testid="focus-chat-surface">
      {/* Toolbar: New chat + History toggle. */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-[var(--edge-soft)]/60">
        <div className="flex items-center gap-1.5">
          <Icon name="smart_toy" size={15} className="text-[rgb(var(--accent))]" />
          <span className="text-[12px] font-semibold text-[var(--ink-90)]">Workspace assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { newConversation(); setDraft('') }}
            className="icon-btn"
            title="New chat"
            data-testid="focus-chat-new"
          >
            <Icon name="add_comment" size={16} />
          </button>
          <button
            onClick={() => { void refreshConversations(); setHistoryOpen((v) => !v) }}
            className={`icon-btn ${historyOpen ? '!text-accent' : ''}`}
            title="Chat history"
            data-testid="focus-chat-history-toggle"
          >
            <Icon name="history" size={16} />
          </button>
        </div>
      </div>

      {hasApiKey === false && (
        <div className="m-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-xs text-[var(--ink-90)] leading-relaxed flex gap-2">
          <Icon name="key" size={16} className="text-amber-700 dark:text-amber-400 mt-0.5" />
          <div>
            <strong className="text-[var(--ink-100)]">No API key yet.</strong> Open{' '}
            <strong>Settings → AI · API keys</strong> and paste your Anthropic API key to chat.
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* History panel — a list of past conversations, newest first. */}
        {historyOpen && (
          <div
            className="w-64 shrink-0 border-r border-[var(--edge-soft)]/60 overflow-auto p-2"
            data-testid="focus-chat-history"
          >
            {conversations.length === 0 ? (
              <p className="text-[12px] text-[var(--ink-40)] italic px-1 py-2">
                No saved chats yet.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className={`group rounded-lg border px-2.5 py-2 transition-colors cursor-pointer ${
                      c.id === activeConversationId
                        ? 'border-accent bg-accent/5'
                        : 'border-transparent hover:border-[var(--edge-soft)] hover:bg-[var(--surface-sunken)]'
                    }`}
                    data-testid={`focus-chat-history-item-${c.id}`}
                    onClick={() => void handleOpenConversation(c.id)}
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium text-[var(--ink-100)] truncate">
                          {c.title || c.preview || 'Untitled chat'}
                        </div>
                        <div className="text-[10.5px] text-[var(--ink-40)] truncate">
                          {c.messageCount ?? 0} messages
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void deleteConversation(c.id)
                        }}
                        className="icon-btn !h-5 !w-5 opacity-0 group-hover:opacity-100"
                        title="Delete chat"
                        data-testid={`focus-chat-history-delete-${c.id}`}
                      >
                        <Icon name="delete" size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* The thread. */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-auto px-4 py-5"
          data-testid="focus-chat-thread"
        >
          <div className="mx-auto max-w-2xl flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="mt-2">
                {/* One tap imports the desk panel's thread for this task into a
                    new persisted conversation — announced as imported, turns
                    verbatim, proposals summarised honestly (P5 slice a). Only
                    offered when that thread actually has turns. */}
                {deskTurnCount > 0 && (
                  <button
                    onClick={() => {
                      if (importing) return
                      setImporting(true)
                      void importDeskConversation().finally(() => setImporting(false))
                    }}
                    disabled={importing}
                    data-testid="focus-chat-continue-desk"
                    className="w-full text-left mb-4 px-3 py-2.5 rounded-lg border border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.07)] hover:bg-[rgb(var(--accent)/0.12)] transition-colors flex items-center gap-2.5"
                  >
                    <Icon
                      name={importing ? 'hourglass_top' : 'forum'}
                      size={16}
                      className={`text-accent shrink-0 ${importing ? 'animate-spin' : ''}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium text-[var(--ink-100)]">
                        Continue your desk conversation
                      </span>
                      <span className="block text-[11px] text-[var(--ink-50)]">
                        Bring the {deskTurnCount}-turn thread from this desk&apos;s assistant into
                        a saved chat here.
                      </span>
                    </span>
                  </button>
                )}
                <p className="text-[12px] text-[var(--ink-50)] mb-3">
                  I can see your whole workspace and act on it — create, edit, schedule, and more.
                </p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => setDraft(s.text)}
                      data-testid="focus-chat-suggestion"
                      className="text-left text-[12.5px] px-3 py-2 rounded-lg border border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent hover:bg-[var(--surface-sunken)] transition-colors flex items-center gap-2"
                    >
                      <Icon name={s.icon} size={14} className="text-accent shrink-0" />
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div
                    key={i}
                    className="ml-auto max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 whitespace-pre-wrap"
                  >
                    {m.content}
                  </div>
                )
              }
              const proposals = proposalsByMessage[String(m.ts)] ?? []
              const blocks = deriveAssistantBlocks(m, proposals)
              // Slice the composite-keyed applied-state down to THIS message,
              // re-keyed by plain proposalId, so ProposalCards stays store-shape
              // agnostic (the side-panel passes a plain map too).
              const appliedForMsg: Record<string, (typeof appliedProposals)[string]> = {}
              for (const p of proposals) {
                const a = appliedProposals[`${m.ts}::${p.id}`]
                if (a) appliedForMsg[p.id] = a
              }
              return (
                <div key={i} className="flex flex-col gap-1.5" data-testid="focus-chat-assistant-turn">
                  {blocks.map((block, bi) => (
                    <ChatBlockView
                      key={bi}
                      block={block}
                      activeTaskId={activeTaskId}
                      appliedProposals={appliedForMsg}
                      onApplied={(id, applied) => void markProposalApplied(m.ts, id, applied)}
                      onConsumeProposal={(id) => consumeProposal(m.ts, id)}
                      onOpenWidget={onOpenWidget}
                    />
                  ))}
                </div>
              )
            })}

            {sending && (
              <div className="bg-[var(--surface-raised)] text-[var(--ink-50)] text-sm italic rounded-lg px-3 py-2 border border-[var(--edge-soft)] w-fit flex items-center gap-1.5">
                <Icon name="more_horiz" size={16} />
                <span>thinking</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSend} className="shrink-0 border-t border-[var(--edge-soft)] px-4 py-3">
        <div className="mx-auto max-w-2xl flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void handleSend(e as unknown as React.FormEvent)
              }
            }}
            rows={2}
            placeholder="Ask your workspace… (⌘⏎ to send)"
            data-testid="focus-chat-input"
            className="flex-1 resize-none bg-[var(--surface-raised)] text-[var(--ink-100)] border border-[var(--edge-firm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--edge-firm)]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="btn-primary"
            data-testid="focus-chat-send"
          >
            <Icon name="send" size={14} />
          </button>
        </div>
      </form>
    </div>
  )
}
