import { create } from 'zustand'
import type {
  ChatMessage,
  ConversationSummary,
  InboxItem,
  MessageAttachment
} from '../lib/messagingClient'
import * as api from '../lib/messagingClient'
import {
  connectMessagingSocket,
  disconnectMessagingSocket,
  setReactionHandler,
  setTypingHandler,
  sendTyping as socketSendTyping,
  type ReactionEvent
} from '../lib/messagingSocket'
import { usePresenceStore } from './presence'
import { useAccountStore } from './account'

// Apply a reaction add/remove to a message in the conversation map, immutably and
// idempotently (so the actor's own optimistic update plus the echoed broadcast do
// not double count). Returns a new messagesByConv.
// Throttle outbound typing pings so a fast typist sends at most one every 2s.
let lastTypingSentAt = 0

type ThreadState = {
  messagesByConv: Record<string, ChatMessage[]>
  threadsByParent: Record<string, ChatMessage[]>
}

// Route an incoming message into the right place: a threaded reply goes into its
// open thread (if loaded) and bumps the parent's reply count, never entering the
// main timeline; a top-level message appends to the main timeline. Pure and
// dedupes by id, so an echoed message is folded in idempotently.
export function routeIncomingMessage(state: ThreadState, conversationId: string, message: ChatMessage): ThreadState {
  if (message.parentId) {
    const parentId = message.parentId
    const thread = state.threadsByParent[parentId]
    const threadsByParent =
      thread && !thread.some((m) => m.id === message.id)
        ? { ...state.threadsByParent, [parentId]: [...thread, message] }
        : state.threadsByParent
    const conv = state.messagesByConv[conversationId]
    // Only bump the count once, when we are first seeing this reply.
    const alreadySeen = thread?.some((m) => m.id === message.id) ?? false
    const messagesByConv =
      conv && !alreadySeen
        ? {
            ...state.messagesByConv,
            [conversationId]: conv.map((m) =>
              m.id === parentId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m
            )
          }
        : state.messagesByConv
    return { messagesByConv, threadsByParent }
  }
  const existing = state.messagesByConv[conversationId] ?? []
  if (existing.some((m) => m.id === message.id)) return state
  return {
    messagesByConv: { ...state.messagesByConv, [conversationId]: [...existing, message] },
    threadsByParent: state.threadsByParent
  }
}

export function applyReaction(
  byConv: Record<string, ChatMessage[]>,
  e: ReactionEvent
): Record<string, ChatMessage[]> {
  const list = byConv[e.conversationId]
  if (!list) return byConv
  let changed = false
  const next = list.map((m) => {
    if (m.id !== e.messageId) return m
    const reactions = (m.reactions ?? []).map((r) => ({ emoji: r.emoji, accountIds: [...r.accountIds] }))
    let entry = reactions.find((r) => r.emoji === e.emoji)
    if (e.added) {
      if (!entry) {
        entry = { emoji: e.emoji, accountIds: [] }
        reactions.push(entry)
      }
      if (!entry.accountIds.includes(e.accountId)) entry.accountIds.push(e.accountId)
    } else if (entry) {
      entry.accountIds = entry.accountIds.filter((id) => id !== e.accountId)
    }
    changed = true
    return { ...m, reactions: reactions.filter((r) => r.accountIds.length > 0) }
  })
  return changed ? { ...byConv, [e.conversationId]: next } : byConv
}

// Messaging store — the cohesive client state behind direct messages, shared
// spaces and the unified-inbox unread badge. REST loads history; the socket
// pushes new messages in real time into the same state.

interface MessagingStore {
  token: string | null
  conversations: ConversationSummary[]
  messagesByConv: Record<string, ChatMessage[]>
  inboxItems: InboxItem[]
  activeId: string | null
  unreadTotal: number
  connected: boolean
  // conversationId -> accountId -> who is typing and when we last heard. The UI
  // shows recent entries and they self-clear on a timeout.
  typingByConv: Record<string, Record<string, { handle: string; at: number }>>
  // parentMessageId -> the replies loaded for that thread.
  threadsByParent: Record<string, ChatMessage[]>
  // The parent message whose thread panel is open, or null.
  activeThreadId: string | null

  connect: (token: string) => Promise<void>
  disconnect: () => void
  refreshConversations: () => Promise<void>
  refreshInbox: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  startDm: (handle: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  send: (body: string, attachment?: MessageAttachment | null) => Promise<void>
  react: (messageId: string, emoji: string) => Promise<void>
  openThread: (parentId: string) => Promise<void>
  closeThread: () => void
  sendThreadReply: (parentId: string, body: string) => Promise<void>
  notifyTyping: () => void
  browseChannels: (orgId: string) => Promise<api.OrgChannel[]>
  createChannel: (orgId: string, name: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  joinChannel: (conversationId: string) => Promise<void>
  inviteContact: (
    email: string
  ) => Promise<{ ok: true; status: 'requested' | 'invited' } | { ok: false; error: string }>
  acceptContactRequest: (requestId: string) => Promise<void>
  declineContactRequest: (requestId: string) => Promise<void>
}

export const useMessagingStore = create<MessagingStore>((set, get) => ({
  token: null,
  conversations: [],
  messagesByConv: {},
  inboxItems: [],
  activeId: null,
  unreadTotal: 0,
  connected: false,
  typingByConv: {},
  threadsByParent: {},
  activeThreadId: null,

  connect: async (token) => {
    set({ token, connected: true })
    // Real-time: append pushed messages, then refresh the conversation list so
    // unread counts + ordering stay correct. If the pushed message is for the
    // open conversation, mark it read immediately.
    connectMessagingSocket(token, (incoming) => {
      const { activeId } = get()
      set((s) => routeIncomingMessage(s, incoming.conversationId, incoming.message))
      void get().refreshConversations()
      if (incoming.conversationId === activeId) {
        void api.markRead(token, incoming.conversationId)
      }
    })
    // Live emoji reactions: apply each add/remove to the message in place.
    setReactionHandler((e) => set((s) => ({ messagesByConv: applyReaction(s.messagesByConv, e) })))
    // Live typing indicators: record who is typing, and clear them after a short
    // timeout unless a fresher ping arrives.
    setTypingHandler((e) => {
      const at = Date.now()
      set((s) => ({
        typingByConv: {
          ...s.typingByConv,
          [e.conversationId]: { ...(s.typingByConv[e.conversationId] ?? {}), [e.accountId]: { handle: e.handle, at } }
        }
      }))
      window.setTimeout(() => {
        set((s) => {
          const conv = s.typingByConv[e.conversationId]
          if (!conv || conv[e.accountId]?.at !== at) return s
          const nextConv = { ...conv }
          delete nextConv[e.accountId]
          return { typingByConv: { ...s.typingByConv, [e.conversationId]: nextConv } }
        })
      }, 5000)
    })
    // Join account-level presence on the same socket once we're connected.
    usePresenceStore.getState().start()
    await get().refreshConversations()
  },

  disconnect: () => {
    usePresenceStore.getState().stop()
    disconnectMessagingSocket()
    set({
      token: null,
      connected: false,
      conversations: [],
      messagesByConv: {},
      inboxItems: [],
      activeId: null,
      unreadTotal: 0,
      typingByConv: {},
      threadsByParent: {},
      activeThreadId: null
    })
  },

  refreshConversations: async () => {
    const { token } = get()
    if (!token) return
    const conversations = await api.listConversations(token)
    const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0)
    set({ conversations, unreadTotal })
    void get().refreshInbox()
  },

  refreshInbox: async () => {
    const { token } = get()
    if (!token) return
    const { items } = await api.getUnifiedInbox(token)
    set({ inboxItems: items })
  },

  openConversation: async (id) => {
    const { token } = get()
    if (!token) return
    // Switching conversations closes any open thread panel.
    set({ activeId: id, activeThreadId: null })
    const messages = await api.getMessages(token, id)
    set((s) => ({ messagesByConv: { ...s.messagesByConv, [id]: messages } }))
    await api.markRead(token, id)
    await get().refreshConversations()
  },

  startDm: async (handle) => {
    const { token } = get()
    if (!token) return { ok: false, error: 'Sign in to send messages.' }
    const user = await api.lookupUser(token, handle)
    if (!user) return { ok: false, error: 'No user with that handle.' }
    const id = await api.startDm(token, handle)
    if (!id) return { ok: false, error: 'Could not start the conversation.' }
    await get().refreshConversations()
    await get().openConversation(id)
    return { ok: true, id }
  },

  send: async (body, attachment = null) => {
    const { token, activeId } = get()
    if (!token || !activeId) return
    const trimmed = body.trim()
    if (!trimmed && !attachment) return
    const message = await api.sendMessage(token, activeId, trimmed, attachment)
    if (!message) return
    set((s) => {
      const existing = s.messagesByConv[activeId] ?? []
      if (existing.some((m) => m.id === message.id)) return s
      return { messagesByConv: { ...s.messagesByConv, [activeId]: [...existing, message] } }
    })
    await get().refreshConversations()
  },

  react: async (messageId, emoji) => {
    const { token, activeId, messagesByConv } = get()
    if (!token || !activeId) return
    const me = useAccountStore.getState().account?.id
    if (!me) return
    const msg = (messagesByConv[activeId] ?? []).find((m) => m.id === messageId)
    if (!msg) return
    const mine = (msg.reactions ?? []).find((r) => r.emoji === emoji)?.accountIds.includes(me) ?? false
    // Optimistically toggle, then call the server. The server echoes the change
    // back over the socket, which applyReaction folds in idempotently.
    set((s) => ({ messagesByConv: applyReaction(s.messagesByConv, { conversationId: activeId, messageId, emoji, accountId: me, added: !mine }) }))
    if (mine) await api.removeReaction(token, activeId, messageId, emoji)
    else await api.addReaction(token, activeId, messageId, emoji)
  },

  openThread: async (parentId) => {
    const { token, activeId } = get()
    if (!token || !activeId) return
    set({ activeThreadId: parentId })
    const replies = await api.getThreadReplies(token, activeId, parentId)
    set((s) => ({ threadsByParent: { ...s.threadsByParent, [parentId]: replies } }))
  },

  closeThread: () => set({ activeThreadId: null }),

  sendThreadReply: async (parentId, body) => {
    const { token, activeId } = get()
    if (!token || !activeId) return
    const trimmed = body.trim()
    if (!trimmed) return
    const message = await api.sendMessage(token, activeId, trimmed, null, parentId)
    if (!message) return
    set((s) => {
      const thread = s.threadsByParent[parentId] ?? []
      const nextThread = thread.some((m) => m.id === message.id) ? thread : [...thread, message]
      const conv = s.messagesByConv[activeId]
      const nextConv = conv
        ? conv.map((m) => (m.id === parentId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m))
        : conv
      return {
        threadsByParent: { ...s.threadsByParent, [parentId]: nextThread },
        messagesByConv: nextConv ? { ...s.messagesByConv, [activeId]: nextConv } : s.messagesByConv
      }
    })
    await get().refreshConversations()
  },

  notifyTyping: () => {
    const { activeId } = get()
    if (!activeId) return
    const now = Date.now()
    if (now - lastTypingSentAt < 2000) return
    lastTypingSentAt = now
    socketSendTyping(activeId)
  },

  browseChannels: async (orgId) => {
    const { token } = get()
    if (!token) return []
    return api.listOrgChannels(token, orgId)
  },

  createChannel: async (orgId, name) => {
    const { token } = get()
    if (!token) return { ok: false, error: 'Not signed in.' }
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'A channel needs a name.' }
    const id = await api.createChannel(token, orgId, trimmed)
    if (!id) return { ok: false, error: 'Could not create the channel.' }
    await get().refreshConversations()
    await get().openConversation(id)
    return { ok: true, id }
  },

  joinChannel: async (conversationId) => {
    const { token } = get()
    if (!token) return
    const ok = await api.joinChannel(token, conversationId)
    if (!ok) return
    await get().refreshConversations()
    await get().openConversation(conversationId)
  },

  inviteContact: async (email) => {
    const { token } = get()
    if (!token) return { ok: false, error: 'Sign in first.' }
    const r = await api.inviteContact(token, email)
    if (!r.ok || !r.status) return { ok: false, error: r.error ?? 'Could not send the invite.' }
    await get().refreshInbox()
    return { ok: true, status: r.status }
  },

  acceptContactRequest: async (requestId) => {
    const { token } = get()
    if (!token) return
    const conversationId = await api.acceptContact(token, requestId)
    await get().refreshConversations()
    if (conversationId) await get().openConversation(conversationId)
  },

  declineContactRequest: async (requestId) => {
    const { token } = get()
    if (!token) return
    await api.declineContact(token, requestId)
    await get().refreshInbox()
  }
}))
