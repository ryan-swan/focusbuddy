import { create } from 'zustand'
import type {
  ChatMessage,
  ConversationSummary,
  InboxItem,
  MessageAttachment
} from '../lib/messagingClient'
import * as api from '../lib/messagingClient'
import { connectMessagingSocket, disconnectMessagingSocket } from '../lib/messagingSocket'

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

  connect: (token: string) => Promise<void>
  disconnect: () => void
  refreshConversations: () => Promise<void>
  refreshInbox: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  startDm: (handle: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  send: (body: string, attachment?: MessageAttachment | null) => Promise<void>
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

  connect: async (token) => {
    set({ token, connected: true })
    // Real-time: append pushed messages, then refresh the conversation list so
    // unread counts + ordering stay correct. If the pushed message is for the
    // open conversation, mark it read immediately.
    connectMessagingSocket(token, (incoming) => {
      const { activeId, messagesByConv } = get()
      const existing = messagesByConv[incoming.conversationId] ?? []
      if (!existing.some((m) => m.id === incoming.message.id)) {
        set({
          messagesByConv: {
            ...messagesByConv,
            [incoming.conversationId]: [...existing, incoming.message]
          }
        })
      }
      void get().refreshConversations()
      if (incoming.conversationId === activeId) {
        void api.markRead(token, incoming.conversationId)
      }
    })
    await get().refreshConversations()
  },

  disconnect: () => {
    disconnectMessagingSocket()
    set({
      token: null,
      connected: false,
      conversations: [],
      messagesByConv: {},
      inboxItems: [],
      activeId: null,
      unreadTotal: 0
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
    set({ activeId: id })
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
