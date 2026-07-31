import { useEffect, useRef, useState } from 'react'
import { useFocusChatStore } from '../../stores/focusChat'
import { useChatStore } from '../../stores/chat'
import { deriveAssistantBlocks } from '../../lib/chatBlocks'
import ChatBlockView from './ChatBlockView'
import ModelPickerChip from '../assistant/ModelPickerChip'
import { useNodeStore } from '../../stores/nodes'
import Icon from '../Icon'

interface Props {
  // Jump to a real workspace item when a block links to one (widget cards).
  onOpenWidget?: (widgetId: string) => void
}

// The full-size "AI Chat" action tab: the workspace assistant rendered in the
// SAME design language as the global assistant panel (Phase 3b — the operator's
// live-drive call: "focus mode still doesn't look like the AI chat we just
// created"): the home greeting, the composer card with context chip + model
// picker + Enter-to-send, suggestion cards, and the panel's turn styling.
//
// Deliberately still its OWN persisted store (useFocusChatStore → SQLite via
// window.api.aiChat) and the non-streaming chat:send transport, with NO
// supportsQuestions opt-in — engine unification is the dedicated session's
// work; this is one product language over two engines until then.
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
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  // Empty thread renders as the assistant home: greeting and composer centered
  // as a group, offer + suggestion cards under the input — the same layout the
  // fullscreen home uses, because this surface is the same size.
  const isHome = messages.length === 0

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

  // Grow the composer with its content (the panel's behaviour): reset to auto
  // first so it shrinks back when text is deleted; the max-height caps it.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

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
    <div
      className="h-full w-full flex flex-col bg-[var(--surface-base)]"
      data-testid="focus-chat-surface"
    >
      {/* Header — the panel's identity language: icon + "Assistant" + a scope
          subtitle, controls on the right. */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-[var(--edge-soft)]/60">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon name="smart_toy" size={15} className="text-[var(--ink-70)]" />
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--ink-100)]">
              Assistant
            </h2>
          </div>
          <p className="text-[10.5px] text-[var(--ink-50)] truncate">Your workspace</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              newConversation()
              setDraft('')
            }}
            className="icon-btn"
            title="New chat"
            data-testid="focus-chat-new"
          >
            <Icon name="add_comment" size={16} />
          </button>
          <button
            onClick={() => {
              void refreshConversations()
              setHistoryOpen((v) => !v)
            }}
            className={`icon-btn ${historyOpen ? '!text-accent' : ''}`}
            title="Chat history"
            data-testid="focus-chat-history-toggle"
          >
            <Icon name="history" size={16} />
          </button>
        </div>
      </div>

      {hasApiKey === false && (
        <div className="m-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-xs text-[var(--ink-90)] leading-relaxed flex gap-2">
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

        {/* Thread + composer share one flex column so the home state can center
            the greeting-and-composer pair (mt-auto / mb-auto), exactly like the
            fullscreen home. */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div
            ref={scrollRef}
            data-testid="focus-chat-thread"
            className={
              isHome
                ? 'shrink-0 mt-auto w-full max-w-[640px] mx-auto px-6 pb-5'
                : 'flex-1 min-h-0 overflow-auto px-4 py-5'
            }
          >
            {isHome ? (
              <div className="text-center">
                <h3 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink-100)] mb-2">
                  How can I help you today?
                </h3>
                <p className="text-[13px] text-[var(--ink-60)] leading-relaxed">
                  I can see your whole workspace and act on it — create, edit, schedule, and more.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl flex flex-col gap-3">
                {messages.map((m, i) => {
                  if (m.role === 'user') {
                    // The panel's user turn: a quiet accent-tinted block built
                    // from tokens (the old stone-900 slab ignored every theme).
                    return (
                      <div
                        key={i}
                        className="ml-auto max-w-[88%] rounded-xl rounded-br-[3px] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap bg-[rgb(var(--accent)/0.10)] border border-[rgb(var(--accent)/0.18)] text-[var(--ink-100)]"
                      >
                        {m.content}
                      </div>
                    )
                  }
                  const proposals = proposalsByMessage[String(m.ts)] ?? []
                  const blocks = deriveAssistantBlocks(m, proposals)
                  // Slice the composite-keyed applied-state down to THIS message,
                  // re-keyed by plain proposalId, so ProposalCards stays
                  // store-shape agnostic (the panel passes the same shape).
                  const appliedForMsg: Record<string, (typeof appliedProposals)[string]> = {}
                  for (const p of proposals) {
                    const a = appliedProposals[`${m.ts}::${p.id}`]
                    if (a) appliedForMsg[p.id] = a
                  }
                  return (
                    <div
                      key={i}
                      className="flex flex-col gap-1.5"
                      data-testid="focus-chat-assistant-turn"
                    >
                      {/* The panel's identity row — sender must not be carried
                          by colour alone. */}
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-[5px] grid place-items-center bg-accent/15 text-accent shrink-0">
                          <Icon name="auto_awesome" size={10} filled />
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-[0.09em] text-[var(--ink-50)]">
                          Plexi
                        </span>
                      </div>
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
                  <div className="flex items-center gap-1.5 text-[var(--ink-50)]">
                    <span className="flex gap-[3px]" aria-hidden="true">
                      <span className="w-1 h-1 rounded-full bg-current fb-dot" />
                      <span
                        className="w-1 h-1 rounded-full bg-current fb-dot"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1 h-1 rounded-full bg-current fb-dot"
                        style={{ animationDelay: '300ms' }}
                      />
                    </span>
                    <span className="text-[11.5px]">Working…</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className={
              isHome
                ? 'shrink-0 px-6 pb-4 mb-auto w-full max-w-[640px] mx-auto'
                : 'shrink-0 border-t border-[var(--edge-soft)] px-4 py-3'
            }
          >
            <div className={isHome ? '' : 'mx-auto max-w-2xl'}>
              {/* The panel's composer card: one container carrying the context
                  chip, the field and its actions, with the focus ring on the
                  whole box. */}
              <div className="rounded-[13px] border border-[var(--edge-firm)] bg-[var(--surface-raised)] px-2.5 pt-2 pb-1.5 flex flex-col gap-2 transition-shadow focus-within:border-[rgb(var(--accent)/0.55)] focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.13)]">
                <div>
                  <span
                    data-testid="focus-chat-context-chip"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--edge-soft)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] text-[var(--ink-60)]"
                    title="This conversation is scoped to your whole workspace"
                  >
                    <Icon name="travel_explore" size={11} className="shrink-0" />
                    <span className="truncate">Your workspace</span>
                  </span>
                </div>
                <textarea
                  ref={taRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter makes a newline — the panel's
                    // convention. ⌘/Ctrl+Enter still works for muscle memory.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend(e as unknown as React.FormEvent)
                    }
                  }}
                  rows={1}
                  placeholder="Ask your workspace…"
                  data-testid="focus-chat-input"
                  className="w-full resize-none bg-transparent text-[var(--ink-100)] placeholder:text-[var(--ink-50)] text-[13px] leading-[1.45] max-h-[160px] focus:outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <ModelPickerChip />
                  <span className="flex-1" />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    title="Send"
                    aria-label="Send"
                    data-testid="focus-chat-send"
                    className="w-[26px] h-[26px] rounded-full grid place-items-center shrink-0 transition-colors bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))] disabled:bg-[var(--surface-sunken)] disabled:text-[var(--ink-40)] disabled:border disabled:border-[var(--edge-soft)]"
                  >
                    <Icon name="arrow_upward" size={14} />
                  </button>
                </div>
              </div>

              {isHome && (
                <>
                  {/* One tap imports the desk panel's thread for this task into
                      a new persisted conversation — announced as imported,
                      turns verbatim, proposals summarised honestly (P5 slice
                      a). Only offered when that thread actually has turns. */}
                  {deskTurnCount > 0 && (
                    <button
                      onClick={() => {
                        if (importing) return
                        setImporting(true)
                        void importDeskConversation().finally(() => setImporting(false))
                      }}
                      disabled={importing}
                      type="button"
                      data-testid="focus-chat-continue-desk"
                      className="w-full text-left mt-3 px-3 py-2.5 rounded-xl border border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.07)] hover:bg-[rgb(var(--accent)/0.12)] transition-colors flex items-center gap-2.5"
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
                          Bring the {deskTurnCount}-turn thread from this desk&apos;s assistant
                          into a saved chat here.
                        </span>
                      </span>
                    </button>
                  )}
                  {/* The workspace suggestions as home cards under the input —
                      the same card language as the fullscreen home. */}
                  <div className="mt-5 grid sm:grid-cols-2 gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s.text}
                        type="button"
                        onClick={() => setDraft(s.text)}
                        data-testid="focus-chat-suggestion"
                        className="text-left px-3 py-2.5 rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] hover:border-[rgb(var(--accent)/0.45)] hover:bg-[var(--surface-sunken)] transition-colors flex items-center gap-2.5"
                      >
                        <Icon name={s.icon} size={15} className="text-accent shrink-0" />
                        <span className="text-[12.5px] text-[var(--ink-80)] truncate">{s.text}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="flex justify-end mt-1.5">
                <span className="text-[9.5px] font-mono text-[var(--ink-40)]">
                  ↵ send · ⇧↵ newline
                </span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
