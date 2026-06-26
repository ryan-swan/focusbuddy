import { useEffect, useRef, useState } from 'react'
import { useMessagingStore } from '../../stores/messaging'
import { useAccountStore } from '../../stores/account'
import { useCallStore } from '../../stores/call'
import { useSignInPrompt } from '../../stores/signInPrompt'
import Icon from '../Icon'

// Messages — direct messages and shared-space chat in one place, the first
// surface of the cohesive messaging system. Conversation list on the left, the
// open thread + composer on the right, and a "new message by handle" action.

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function MessagesView(): JSX.Element {
  const account = useAccountStore((s) => s.account)
  const requestSignIn = useSignInPrompt((s) => s.requestOpen)
  const conversations = useMessagingStore((s) => s.conversations)
  const messagesByConv = useMessagingStore((s) => s.messagesByConv)
  const activeId = useMessagingStore((s) => s.activeId)
  const startCall = useCallStore((s) => s.startCall)
  const open = useMessagingStore((s) => s.openConversation)
  const send = useMessagingStore((s) => s.send)
  const startDm = useMessagingStore((s) => s.startDm)
  const inviteContact = useMessagingStore((s) => s.inviteContact)
  const refresh = useMessagingStore((s) => s.refreshConversations)

  const [draft, setDraft] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [composingNew, setComposingNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (account) void refresh()
  }, [account, refresh])

  const messages = activeId ? messagesByConv[activeId] ?? [] : []

  // Keep the thread pinned to the newest message.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, activeId])

  if (!account) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod px-6">
        <div className="text-center max-w-sm">
          <Icon name="forum" size={32} className="text-stone-400 dark:text-stone-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1">Messages</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-4">
            Sign in to message other people on PlexiDesk and share folders and tasks to work
            together.
          </p>
          <button onClick={() => requestSignIn()} className="btn-primary mx-auto">
            <Icon name="login" size={14} />
            <span>Sign in</span>
          </button>
        </div>
      </div>
    )
  }

  async function submitNew(): Promise<void> {
    setError(null)
    const value = newHandle.trim()
    if (!value) return
    // An email address adds a contact (they get a request to accept, or a
    // sign-up invite if they're not on PlexiDesk yet); a handle starts a DM now.
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
    if (isEmail) {
      const r = await inviteContact(value)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(
        r.status === 'requested'
          ? 'Request sent — they can accept it in their inbox.'
          : "Invite sent — they'll get an email to join PlexiDesk."
      )
      setNewHandle('')
      return
    }
    const r = await startDm(value)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setComposingNew(false)
    setNewHandle('')
  }

  async function submitDraft(): Promise<void> {
    const body = draft
    setDraft('')
    await send(body)
  }

  const activeConv = conversations.find((c) => c.id === activeId) ?? null
  // For a 1:1 DM, the other member is the call target. Spaces are multi-member,
  // so the header call button only shows for DMs (a 1:1 mesh call).
  const dmOther = activeConv?.kind === 'dm' ? activeConv.members.find((m) => m.accountId !== account.id) : null
  const callTarget = dmOther ? { accountId: dmOther.accountId, handle: dmOther.handle ?? 'teammate' } : null

  return (
    <div className="h-full flex desk-paper no-tod">
      {/* Conversation list */}
      <div className="w-64 shrink-0 border-r border-stone-200 dark:border-stone-800 flex flex-col">
        <div className="px-3 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Messages</h1>
          <button
            onClick={() => setComposingNew((v) => !v)}
            className="icon-btn"
            title="New message"
            data-testid="messages-new"
          >
            <Icon name="edit_square" size={15} />
          </button>
        </div>

        {composingNew && (
          <div className="px-3 pb-2">
            <div className="flex gap-1">
              <input
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitNew()}
                placeholder="@handle or email"
                autoFocus
                data-testid="messages-new-handle"
                className="flex-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded px-2 py-1 text-[12px]"
              />
              <button onClick={() => void submitNew()} className="btn-primary px-2 py-1 text-[11px]">
                Start
              </button>
            </div>
            {error && <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">{error}</div>}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {conversations.length === 0 ? (
            <p className="text-[11px] text-stone-500 dark:text-stone-400 px-3 py-2 leading-snug">
              No conversations yet. Start one with someone&apos;s handle.
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => void open(c.id)}
                data-testid="conversation-row"
                className={`w-full text-left px-3 py-2 border-b border-stone-100 dark:border-stone-800/60 hover:bg-stone-100 dark:hover:bg-stone-800/50 transition-colors ${
                  c.id === activeId ? 'bg-accent/[0.06]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate inline-flex items-center gap-1.5">
                    <Icon name={c.kind === 'space' ? 'folder_shared' : 'person'} size={13} className="text-stone-400" />
                    {c.title}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="shrink-0 text-[10px] font-semibold text-white bg-accent rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                {c.lastMessage && (
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                    {c.lastMessage.attachment ? '📎 ' : ''}
                    {c.lastMessage.body || (c.lastMessage.attachment?.label ?? '')}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-stone-500 dark:text-stone-400">
            Pick a conversation, or start a new one.
          </div>
        ) : (
          // Gate on activeId, not activeConv: a conversation opened from
          // PlexiInbox sets activeId before it has landed in the conversations
          // list, and the receiver must be able to reply immediately. Title
          // falls back until the list catches up.
          <>
            <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 inline-flex items-center gap-1.5 min-w-0">
                <Icon name={activeConv?.kind === 'space' ? 'folder_shared' : 'person'} size={14} className="text-accent shrink-0" />
                <span className="truncate">{activeConv?.title ?? 'Conversation'}</span>
              </h2>
              {callTarget && (
                <button
                  onClick={() => void startCall(callTarget, 'video')}
                  aria-label={`Call ${callTarget.handle}`}
                  title="Start a video call"
                  data-testid="messages-call"
                  className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--edge-soft)] text-[12.5px] text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]"
                >
                  <Icon name="videocam" size={15} /> Call
                </button>
              )}
            </div>
            <div ref={threadRef} className="flex-1 overflow-auto px-4 py-3 space-y-2">
              {messages.map((m) => {
                const mine = m.fromAccount === account.id
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-1.5 text-[13px] ${
                        mine
                          ? 'bg-accent text-white rounded-br-sm'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-bl-sm'
                      }`}
                    >
                      {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                      {m.attachment && (
                        <div className={`mt-1 inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 ${mine ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}>
                          <Icon name="folder_shared" size={11} />
                          {m.attachment.label}
                        </div>
                      )}
                      <div className={`text-[9px] mt-0.5 ${mine ? 'text-white/70' : 'text-stone-400'}`}>
                        {fmtTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-4 py-3 border-t border-stone-200 dark:border-stone-800 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void submitDraft()
                  }
                }}
                placeholder="Write a message…"
                rows={1}
                data-testid="message-composer"
                className="flex-1 resize-none bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => void submitDraft()}
                disabled={!draft.trim()}
                className="btn-primary"
                data-testid="message-send"
              >
                <Icon name="send" size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
