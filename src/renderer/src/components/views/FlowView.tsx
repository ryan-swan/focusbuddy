import { useEffect, useMemo, useState } from 'react'
import { useMessagingStore } from '../../stores/messaging'
import { useAccountStore } from '../../stores/account'
import Icon from '../Icon'
import { MessageRow, RecallPanel, PulsePanel, SchedulesPanel, BriefingPanel, ChannelBrowser } from './MessagesView'
import { ChatComposer } from './chat/ChatComposer'
import { getBriefing, searchMessages, type Briefing, type SearchHit } from '../../lib/messagingClient'
import { personDisplayName, personInitials } from '../../lib/personName'
import { presenceColor } from '../../lib/presence'

// PlexiChat Flow — one intelligent, self-prioritizing stream that replaces the
// channel-sidebar + message-panel + thread-panel model. The feed is calm; the
// only warm colour is "Needs you", so what requires you glows and the rest
// recedes. Cards open in place to read and reply; a Focus mode gives one
// conversation full history in order. Pinning + a stable sort keep the
// important-but-quiet conversation from being buried by the loudest one.

type Filter = 'all' | 'unread' | 'mentions' | 'dms'

const PIN_KEY = 'plexi-flow-pins'
function loadPins(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PIN_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}
function savePins(s: Set<string>): void {
  localStorage.setItem(PIN_KEY, JSON.stringify([...s]))
}

function fmtAgo(ms: number): string {
  if (!ms) return ''
  const d = Date.now() - ms
  if (d < 60_000) return 'now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`
  return `${Math.floor(d / 86_400_000)}d`
}

// A message thread, expanded inline right under its parent message rather than in
// a separate slide-out panel. Replies render as the same bubbles; a small input
// posts back into the thread.
function InlineThread({ parentId, myId }: { parentId: string; myId: string }): JSX.Element {
  const threadsByParent = useMessagingStore((s) => s.threadsByParent)
  const sendThreadReply = useMessagingStore((s) => s.sendThreadReply)
  const react = useMessagingStore((s) => s.react)
  const replies = threadsByParent[parentId] ?? []
  const [draft, setDraft] = useState('')
  const lang = useMemo(() => localStorage.getItem('plexi-translate-lang') || 'English', [])

  async function submit(): Promise<void> {
    const b = draft.trim()
    if (!b) return
    setDraft('')
    await sendThreadReply(parentId, b)
  }

  return (
    <div className="ml-9 mt-1 mb-1 border-l-2 border-[rgb(var(--accent)/0.35)] pl-3 py-1 space-y-1.5" data-testid="flow-thread">
      <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)]">Thread</div>
      {replies.map((r) => (
        <MessageRow key={r.id} m={r} mine={r.fromAccount === myId} myId={myId} translateLang={lang} onReact={(e) => void react(r.id, e)} />
      ))}
      <div className="flex items-center gap-1.5 pt-0.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="Reply in thread…"
          data-testid="flow-thread-input"
          className="fb-field flex-1 px-2.5 py-1.5 text-[12.5px] text-[var(--ink-90)]"
        />
        <button onClick={() => void submit()} disabled={!draft.trim()} className="btn-primary px-2.5 py-1.5 text-[12px] disabled:opacity-40" aria-label="Send reply">
          <Icon name="send" size={13} />
        </button>
      </div>
    </div>
  )
}

// A single conversation's live messages + inline composer, shared by the expanded
// card and the focus pane. The conversation is made active on mount so the
// store's active-scoped handlers (react/edit/delete) operate on it.
function ConversationBody({ conversationId, title }: { conversationId: string; title: string }): JSX.Element {
  const token = useMessagingStore((s) => s.token)
  const messagesByConv = useMessagingStore((s) => s.messagesByConv)
  const ensureLoaded = useMessagingStore((s) => s.ensureConversationLoaded)
  const sendToConversation = useMessagingStore((s) => s.sendToConversation)
  const react = useMessagingStore((s) => s.react)
  const editMessage = useMessagingStore((s) => s.editMessage)
  const deleteMessage = useMessagingStore((s) => s.deleteMessage)
  const openThread = useMessagingStore((s) => s.openThread)
  const loadPins = useMessagingStore((s) => s.loadPins)
  const pin = useMessagingStore((s) => s.pin)
  const unpin = useMessagingStore((s) => s.unpin)
  const pinsByConv = useMessagingStore((s) => s.pinsByConv)
  const account = useAccountStore((s) => s.account)
  const myId = account?.id ?? ''
  const lang = useMemo(() => localStorage.getItem('plexi-translate-lang') || 'English', [])
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)

  useEffect(() => {
    void ensureLoaded(conversationId)
    void loadPins(conversationId)
  }, [conversationId, ensureLoaded, loadPins])

  const pins = pinsByConv[conversationId] ?? []
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins])
  // Collapse any open thread when switching conversations.
  useEffect(() => {
    setOpenThreadId(null)
  }, [conversationId])

  function toggleThread(id: string): void {
    setOpenThreadId((cur) => {
      if (cur === id) return null
      void openThread(id)
      return id
    })
  }

  const messages = messagesByConv[conversationId] ?? []

  if (!token) {
    return <div className="p-4 text-[12px] text-[var(--ink-50)]">Sign in to chat.</div>
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {pins.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)] flex items-center gap-2 overflow-x-auto" data-testid="flow-pins">
          <Icon name="push_pin" size={12} className="text-[var(--ink-40)] shrink-0" />
          {pins.map((p) => (
            <span key={p.id} className="text-[11.5px] text-[var(--ink-70)] whitespace-nowrap bg-[var(--surface-sunken)] rounded-full px-2 py-0.5 max-w-[220px] truncate">
              {p.body || '[attachment]'}
            </span>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-1.5" data-testid="flow-messages">
        {messages.length === 0 ? (
          <div className="text-[12px] text-[var(--ink-50)] py-2">No messages yet. Say something below.</div>
        ) : (
          messages.map((m) => (
            <div key={m.id}>
              <MessageRow
                m={m}
                mine={m.fromAccount === myId}
                myId={myId}
                translateLang={lang}
                pinned={pinnedIds.has(m.id)}
                onTogglePin={() => void (pinnedIds.has(m.id) ? unpin(conversationId, m.id) : pin(conversationId, m.id))}
                onReact={(emoji) => void react(m.id, emoji)}
                onEdit={m.fromAccount === myId ? (b) => void editMessage(m.id, b) : undefined}
                onDelete={m.fromAccount === myId ? () => void deleteMessage(m.id) : undefined}
                onOpenThread={() => toggleThread(m.id)}
              />
              {openThreadId === m.id && <InlineThread parentId={m.id} myId={myId} />}
            </div>
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-[var(--edge-soft)]">
        <ChatComposer
          conversationId={conversationId}
          token={token}
          onSend={(body, attachment) => sendToConversation(conversationId, body, attachment)}
          onTyping={() => {}}
        />
      </div>
      <span className="sr-only">{title}</span>
    </div>
  )
}

export default function FlowView(): JSX.Element {
  const token = useMessagingStore((s) => s.token)
  const conversations = useMessagingStore((s) => s.conversations)
  const openConversation = useMessagingStore((s) => s.openConversation)
  const refresh = useMessagingStore((s) => s.refreshConversations)
  const addMemberByHandle = useMessagingStore((s) => s.addMemberByHandle)
  const removeMember = useMessagingStore((s) => s.removeMember)
  const setVisibility = useMessagingStore((s) => s.setVisibility)
  const setNotif = useMessagingStore((s) => s.setNotif)
  const account = useAccountStore((s) => s.account)

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [pins, setPins] = useState<Set<string>>(loadPins)
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [memberHandle, setMemberHandle] = useState('')
  const [memberErr, setMemberErr] = useState<string | null>(null)
  // per-conversation panels (Recall / Pulse / Schedules) reused from MessagesView
  const [recallConv, setRecallConv] = useState<string | null>(null)
  const [pulseConv, setPulseConv] = useState<string | null>(null)
  const [schedConv, setSchedConv] = useState<string | null>(null)
  const [showBriefing, setShowBriefing] = useState(false)

  useEffect(() => {
    if (!token) return
    void refresh()
    void getBriefing(token).then(setBriefing)
  }, [token, refresh])

  // Full message search across every conversation, debounced. Distinct from the
  // list filter above: this finds messages, not just conversation titles.
  useEffect(() => {
    const term = query.trim()
    if (!token || term.length < 2) {
      setHits(null)
      return
    }
    let alive = true
    const t = window.setTimeout(() => {
      void searchMessages(token, term).then((r) => {
        if (alive) setHits(r)
      })
    }, 260)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [query, token])

  // Stable order: recompute only when the SET of conversations or the pins change,
  // never on every incoming message, so the feed does not reorder while you read.
  // Pinned first, then most-recent. A manual re-sort is available in the header.
  const convById = useMemo(() => {
    const m = new Map<string, (typeof conversations)[number]>()
    for (const c of conversations) m.set(c.id, c)
    return m
  }, [conversations])

  function resort(): void {
    const sorted = [...conversations]
      .sort((a, b) => {
        const pa = pins.has(a.id) ? 1 : 0
        const pb = pins.has(b.id) ? 1 : 0
        if (pa !== pb) return pb - pa
        return b.lastMessageAt - a.lastMessageAt
      })
      .map((c) => c.id)
    setOrder(sorted)
  }
  // Recompute order when conversations appear/disappear or pins change (not on
  // every message), keeping order stable during reading.
  const convKey = conversations.map((c) => c.id).sort().join(',')
  useEffect(() => {
    resort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convKey, pins])

  const mentionConvIds = useMemo(
    () => new Set((briefing?.mentions ?? []).map((m) => m.conversationId)),
    [briefing]
  )

  function togglePin(id: string): void {
    setPins((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      savePins(next)
      return next
    })
  }

  function openInline(id: string): void {
    setExpandedId((cur) => (cur === id ? null : id))
    if (expandedId !== id) void openConversation(id)
  }
  function openFocus(id: string): void {
    setFocusId(id)
    void openConversation(id)
  }

  const q = query.trim().toLowerCase()
  const visible = order
    .map((id) => convById.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .filter((c) => {
      if (filter === 'unread' && c.unreadCount <= 0) return false
      if (filter === 'mentions' && !mentionConvIds.has(c.id)) return false
      if (filter === 'dms' && c.kind !== 'dm') return false
      if (q && !(c.title || '').toLowerCase().includes(q) && !(c.lastMessage?.body || '').toLowerCase().includes(q))
        return false
      return true
    })

  const needsCount =
    (briefing?.mentions.length ?? 0) + (briefing?.pendingProposals.length ?? 0) + (briefing?.questions.length ?? 0)

  const FILTERS: Array<{ k: Filter; icon: string; label: string; dot?: boolean }> = [
    { k: 'all', icon: 'menu', label: 'All' },
    { k: 'unread', icon: 'circle', label: 'Unread' },
    { k: 'mentions', icon: 'alternate_email', label: 'Mentions', dot: mentionConvIds.size > 0 },
    { k: 'dms', icon: 'chat_bubble', label: 'Direct messages' }
  ]

  // ── Focus mode: one conversation, full height, all features ──────────────
  if (focusId) {
    const conv = convById.get(focusId)
    return (
      <div className="h-full flex flex-col desk-paper no-tod">
        <div className="px-4 py-3 border-b border-[var(--edge-soft)] flex items-center gap-2">
          <button
            onClick={() => setFocusId(null)}
            className="icon-btn"
            title="Back to Flow"
            data-testid="flow-focus-back"
          >
            <Icon name="arrow_back" size={16} />
          </button>
          <Icon name={conv?.kind === 'dm' ? 'person' : 'tag'} size={15} className="text-accent shrink-0" />
          <h2 className="text-sm font-semibold text-[var(--ink-100)] truncate flex-1">{conv?.title ?? 'Conversation'}</h2>
          <button onClick={() => setRecallConv(focusId)} className="icon-btn" title="Recall — catch up or ask">
            <Icon name="bolt" size={15} />
          </button>
          {conv?.kind !== 'dm' && (
            <>
              <button onClick={() => setPulseConv(focusId)} className="icon-btn" title="Pulse — decisions & actions">
                <Icon name="radar" size={15} />
              </button>
              <button onClick={() => setSchedConv(focusId)} className="icon-btn" title="Scheduled AI tasks">
                <Icon name="schedule" size={15} />
              </button>
            </>
          )}
          {(() => {
            const notif = conv?.notifLevel ?? 'all'
            const nextN = notif === 'all' ? 'mentions' : notif === 'mentions' ? 'muted' : 'all'
            const nIcon = notif === 'muted' ? 'notifications_off' : notif === 'mentions' ? 'alternate_email' : 'notifications'
            return (
              <button
                onClick={() => void setNotif(focusId, nextN)}
                className={`icon-btn ${notif !== 'all' ? 'text-accent' : ''}`}
                title={`Notifications: ${notif} (tap for ${nextN})`}
                data-testid="flow-notif"
              >
                <Icon name={nIcon} size={15} />
              </button>
            )
          })()}
          <div className="relative">
            <button
              onClick={() => setShowMembers((v) => !v)}
              className="icon-btn inline-flex items-center gap-1 !w-auto px-2"
              title="Members"
              data-testid="flow-members"
            >
              <Icon name="group" size={15} /> <span className="text-[12px]">{conv?.members.length ?? 0}</span>
            </button>
            {showMembers && conv && (
              <div className="fb-glass-panel rounded-[var(--radius-row)] fb-pop-in absolute right-0 top-full mt-1 z-30 w-64 p-2" data-testid="flow-members-popover">
                {conv.kind === 'channel' && (
                  <button
                    onClick={() => void setVisibility(focusId, conv.visibility === 'public' ? 'private' : 'public')}
                    className="w-full flex items-center gap-1.5 text-[11px] text-[var(--ink-70)] hover:text-[var(--ink-100)] px-1 py-1 mb-1"
                  >
                    <Icon name={conv.visibility === 'public' ? 'public' : 'lock'} size={13} />
                    {conv.visibility === 'public' ? 'Public' : 'Private'} channel · make {conv.visibility === 'public' ? 'private' : 'public'}
                  </button>
                )}
                <div className="max-h-44 overflow-auto space-y-0.5 mb-1.5">
                  {conv.members.map((mem) => (
                    <div key={mem.accountId} className="flex items-center gap-2 px-1 py-1 text-[12px]">
                      <span className="flex-1 truncate text-[var(--ink-90)]">
                        {personDisplayName(mem, mem.handle ?? 'Member')}
                        {mem.accountId === account?.id && ' (you)'}
                      </span>
                      {mem.accountId !== account?.id && (
                        <button onClick={() => void removeMember(focusId, mem.accountId)} title="Remove" className="text-[var(--ink-40)] hover:text-red-500">
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {conv.kind !== 'dm' && (
                  <div className="flex gap-1.5">
                    <input
                      value={memberHandle}
                      onChange={(e) => {
                        setMemberHandle(e.target.value)
                        setMemberErr(null)
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && memberHandle.trim()) {
                          const r = await addMemberByHandle(focusId, memberHandle.trim())
                          if (r.ok) setMemberHandle('')
                          else setMemberErr(r.error ?? 'Could not add')
                        }
                      }}
                      placeholder="add @handle"
                      className="fb-field flex-1 px-2 py-1 text-[12px] text-[var(--ink-90)]"
                    />
                  </div>
                )}
                {memberErr && <div className="text-[11px] text-red-500 mt-1">{memberErr}</div>}
              </div>
            )}
          </div>
          <button
            onClick={() => togglePin(focusId)}
            className={`icon-btn ${pins.has(focusId) ? 'text-accent' : ''}`}
            title={pins.has(focusId) ? 'Unpin' : 'Pin to top'}
          >
            <Icon name="push_pin" size={15} />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ConversationBody conversationId={focusId} title={conv?.title ?? ''} />
        </div>
        {recallConv && <RecallPanel conversationId={recallConv} onClose={() => setRecallConv(null)} />}
        {pulseConv && <PulsePanel conversationId={pulseConv} onClose={() => setPulseConv(null)} />}
        {schedConv && <SchedulesPanel conversationId={schedConv} onClose={() => setSchedConv(null)} />}
      </div>
    )
  }

  // ── The Flow ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex desk-paper no-tod">
      {/* Filter rail (not a channel list) */}
      <nav className="w-14 shrink-0 border-r border-[var(--edge-soft)] flex flex-col items-center gap-1.5 py-3" aria-label="Filters">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            title={f.label}
            aria-label={f.label}
            data-testid={`flow-filter-${f.k}`}
            className={`relative w-10 h-10 rounded-xl grid place-items-center transition-colors ${
              filter === f.k
                ? 'bg-[rgb(var(--accent)/0.14)] text-accent'
                : 'text-[var(--ink-50)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-90)]'
            }`}
          >
            <Icon name={f.icon} size={18} />
            {f.dot && <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setBrowsing(true)}
          title="New conversation / channels"
          data-testid="flow-new"
          className="w-10 h-10 rounded-xl grid place-items-center text-[var(--ink-50)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-90)]"
        >
          <Icon name="add" size={18} />
        </button>
      </nav>

      {/* The single column */}
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="w-full px-6 pb-20">
          {/* Command / ask bar */}
          <div className="sticky top-0 z-20 pt-4 pb-2 fb-glass-chrome">
            <div className="flex items-center gap-2">
              <label className="fb-card flex-1 flex items-center gap-2 px-3 py-2 focus-within:border-[rgb(var(--accent)/0.5)]">
                <Icon name="search" size={16} className="text-[var(--ink-40)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your conversations…"
                  data-testid="flow-search"
                  className="flex-1 bg-transparent text-[13.5px] text-[var(--ink-100)] outline-none"
                />
              </label>
              <button onClick={resort} className="icon-btn" title="Re-sort by most recent" data-testid="flow-resort">
                <Icon name="sort" size={16} />
              </button>
            </div>
          </div>

          {/* AI catch-up ribbon (honest counts from the briefing) */}
          {briefing && (
            <button
              onClick={() => setShowBriefing(true)}
              data-testid="flow-catchup"
              className="w-full text-left mt-3 flex gap-3 items-start bg-[linear-gradient(180deg,rgb(var(--accent)/0.10),transparent)] border border-[rgb(var(--accent)/0.30)] rounded-xl p-3 hover:border-[rgb(var(--accent)/0.5)]"
            >
              <span className="w-6 h-6 rounded-lg grid place-items-center text-white text-[12px] font-bold shrink-0 bg-[rgb(var(--accent))]">
                ✦
              </span>
              <span className="text-[13px] text-[var(--ink-90)] leading-snug">
                {needsCount > 0 ? (
                  <>
                    <b className="text-[var(--ink-100)]">{needsCount}</b> thing{needsCount === 1 ? '' : 's'} need you
                    {briefing.questions.length > 0 && <> · {briefing.questions.length} open question{briefing.questions.length === 1 ? '' : 's'}</>}
                    . Tap for your full briefing.
                  </>
                ) : (
                  <>Nothing needs you right now. Tap to review anyway.</>
                )}
              </span>
            </button>
          )}

          {/* NEEDS YOU lane */}
          {briefing && needsCount > 0 && (
            <>
              <div className="mt-5 mb-2 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide font-semibold text-amber-500">Needs you</span>
                <span className="flex-1 h-px bg-amber-500/30" />
              </div>
              <div className="flex flex-col gap-2">
                {briefing.mentions.map((m) => (
                  <button
                    key={m.messageId}
                    onClick={() => openFocus(m.conversationId)}
                    data-testid="flow-needs-mention"
                    className="text-left flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] pl-3 pr-3 py-2.5 hover:bg-amber-500/[0.14]"
                  >
                    <span className="w-1 self-stretch rounded bg-amber-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[var(--ink-100)]">
                        {m.fromName} <span className="font-normal text-[var(--ink-50)]">mentioned you in {m.conversationTitle}</span>
                      </span>
                      <span className="block text-[12.5px] text-[var(--ink-60)] truncate">{m.excerpt}</span>
                    </span>
                    <span className="text-[11px] text-amber-600 font-semibold shrink-0">Reply</span>
                  </button>
                ))}
                {briefing.pendingProposals.map((p) => (
                  <button
                    key={p.messageId}
                    onClick={() => openFocus(p.conversationId)}
                    data-testid="flow-needs-proposal"
                    className="text-left flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] pl-3 pr-3 py-2.5 hover:bg-amber-500/[0.14]"
                  >
                    <span className="w-1 self-stretch rounded bg-amber-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[var(--ink-100)]">
                        Plexi proposed an action <span className="font-normal text-[var(--ink-50)]">in {p.conversationTitle}</span>
                      </span>
                      <span className="block text-[12.5px] text-[var(--ink-60)]">Awaiting your decision</span>
                    </span>
                    <span className="text-[11px] text-amber-600 font-semibold shrink-0">Review</span>
                  </button>
                ))}
                {briefing.questions.map((qz) => (
                  <button
                    key={qz.extractId}
                    onClick={() => openFocus(qz.conversationId)}
                    data-testid="flow-needs-question"
                    className="text-left flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] pl-3 pr-3 py-2.5 hover:bg-amber-500/[0.14]"
                  >
                    <span className="w-1 self-stretch rounded bg-amber-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[var(--ink-100)]">
                        Open question <span className="font-normal text-[var(--ink-50)]">in {qz.conversationTitle}</span>
                      </span>
                      <span className="block text-[12.5px] text-[var(--ink-60)] truncate">{qz.text}</span>
                    </span>
                    <span className="text-[11px] text-amber-600 font-semibold shrink-0">Answer</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Message search results (when searching) */}
          {hits !== null && (
            <>
              <div className="mt-5 mb-2 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--ink-40)]">
                  {hits.length} message{hits.length === 1 ? '' : 's'} matching &ldquo;{query.trim()}&rdquo;
                </span>
                <span className="flex-1 h-px bg-[var(--edge-soft)]" />
              </div>
              <div className="flex flex-col gap-1.5" data-testid="flow-search-results">
                {hits.length === 0 ? (
                  <div className="text-[13px] text-[var(--ink-50)] py-4 text-center">No messages found.</div>
                ) : (
                  hits.map((h) => (
                    <button
                      key={h.messageId}
                      onClick={() => openFocus(h.conversationId)}
                      data-testid="flow-search-hit"
                      className="fb-btn-surface text-left px-3.5 py-2.5 hover:border-[rgb(var(--accent)/0.35)]"
                    >
                      <div className="text-[11px] text-[var(--ink-40)] mb-0.5">{h.conversationTitle}</div>
                      <div className="text-[13px] text-[var(--ink-90)] break-words">{h.body}</div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* THE FLOW */}
          {hits === null && (
          <div className="mt-5 mb-2 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--ink-40)]">
              {filter === 'all' ? 'The flow' : filter === 'unread' ? 'Unread' : filter === 'mentions' ? 'Mentions' : 'Direct messages'}
            </span>
            <span className="flex-1 h-px bg-[var(--edge-soft)]" />
          </div>
          )}

          {hits === null && (
          <div className="flex flex-col gap-2.5" data-testid="flow-stream">
            {visible.length === 0 ? (
              <div className="text-[13px] text-[var(--ink-50)] py-6 text-center">
                {conversations.length === 0 ? 'No conversations yet. Start one with the + button.' : 'Nothing here with this filter.'}
              </div>
            ) : (
              visible.map((c) => {
                const open = expandedId === c.id
                const mentioned = mentionConvIds.has(c.id)
                const pinned = pins.has(c.id)
                const other = c.kind === 'dm' ? c.members.find((m) => m.accountId !== account?.id) : null
                return (
                  <div
                    key={c.id}
                    data-testid="flow-card"
                    className={`bg-[var(--surface-raised)] border rounded-xl overflow-hidden transition-colors ${
                      mentioned ? 'border-amber-500/40' : 'border-[var(--edge-soft)] hover:border-[rgb(var(--accent)/0.35)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 px-3.5 py-3 cursor-pointer select-none" onClick={() => openInline(c.id)}>
                      {c.kind === 'dm' ? (
                        <span
                          className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-bold shrink-0"
                          style={{ background: presenceColor(other?.accountId ?? c.id) }}
                        >
                          {other ? personInitials(other) : '@'}
                        </span>
                      ) : (
                        <span className="w-8 h-8 rounded-[10px] grid place-items-center bg-[var(--surface-sunken)] text-accent text-[15px] shrink-0">#</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold text-[var(--ink-100)] truncate">
                            {c.kind === 'dm' && other ? personDisplayName(other, other.handle ?? 'Direct message') : c.title}
                          </span>
                          {pinned && <Icon name="push_pin" size={11} className="text-[var(--ink-40)]" />}
                          {mentioned && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30">
                              mention
                            </span>
                          )}
                          <span className="ml-auto text-[11px] text-[var(--ink-40)] fb-tabular shrink-0">{fmtAgo(c.lastMessageAt)}</span>
                        </div>
                        {!open && (
                          <div className="text-[13px] text-[var(--ink-50)] truncate mt-0.5">
                            {c.lastMessage?.body || (c.lastMessage ? 'Shared something' : 'No messages yet')}
                          </div>
                        )}
                      </div>
                      {!open && c.unreadCount > 0 && (
                        <span
                          className={`text-[11px] font-bold rounded-full min-w-[18px] h-[18px] px-1.5 grid place-items-center ${
                            mentioned ? 'bg-amber-500 text-black' : 'bg-[rgb(var(--accent))] text-white'
                          }`}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                      <Icon
                        name="expand_more"
                        size={16}
                        className={`text-[var(--ink-40)] transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </div>

                    {open && (
                      <div className="border-t border-[var(--edge-soft)]">
                        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]">
                          <button onClick={() => openFocus(c.id)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11.5px] text-[var(--ink-90)] hover:bg-[var(--surface-raised)]" data-testid="flow-focus">
                            <Icon name="open_in_full" size={13} /> Focus
                          </button>
                          <button onClick={() => setRecallConv(c.id)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11.5px] text-[var(--ink-70)] hover:bg-[var(--surface-raised)]">
                            <Icon name="bolt" size={13} /> Recall
                          </button>
                          {c.kind !== 'dm' && (
                            <button onClick={() => setPulseConv(c.id)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11.5px] text-[var(--ink-70)] hover:bg-[var(--surface-raised)]">
                              <Icon name="radar" size={13} /> Pulse
                            </button>
                          )}
                          <button
                            onClick={() => togglePin(c.id)}
                            className={`ml-auto icon-btn !h-7 !w-7 ${pinned ? 'text-accent' : 'text-[var(--ink-50)]'}`}
                            title={pinned ? 'Unpin' : 'Pin to top'}
                          >
                            <Icon name="push_pin" size={14} />
                          </button>
                        </div>
                        <div className="h-[min(52vh,440px)]">
                          <ConversationBody conversationId={c.id} title={c.title} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
          )}

          <div className="mt-6 text-center text-[11.5px] text-[var(--ink-40)]">
            One stream. Mentions and DMs float up, quiet channels sink. Pin what matters, Focus to go deep.
          </div>
        </div>
      </div>

      {browsing && <ChannelBrowser onClose={() => setBrowsing(false)} />}
      {showBriefing && <BriefingPanel onClose={() => setShowBriefing(false)} />}
      {recallConv && !focusId && <RecallPanel conversationId={recallConv} onClose={() => setRecallConv(null)} />}
      {pulseConv && !focusId && <PulsePanel conversationId={pulseConv} onClose={() => setPulseConv(null)} />}
      {schedConv && !focusId && <SchedulesPanel conversationId={schedConv} onClose={() => setSchedConv(null)} />}
    </div>
  )
}
