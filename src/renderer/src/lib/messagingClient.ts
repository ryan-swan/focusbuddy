import { signalConfig } from './signalConfig'

// REST client for the messaging / collaboration backend on the signal server.
// Persistence + history go over REST; real-time delivery arrives over the
// WebSocket (see messagingSocket.ts). Mirrors the server's cohesive model:
// a conversation is a DM or a shared space; messages can carry a share.

export interface MessageAttachment {
  kind: 'share'
  token: string
  entityKind: string
  label: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  fromAccount: string
  body: string
  attachment: MessageAttachment | null
  createdAt: number
}

export interface ConversationSummary {
  id: string
  kind: 'dm' | 'space'
  title: string
  lastMessageAt: number
  unreadCount: number
  members: Array<{ accountId: string; handle: string | null }>
  lastMessage: ChatMessage | null
}

function urlFor(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

async function req<T>(
  method: 'GET' | 'POST',
  path: string,
  token: string,
  body?: unknown
): Promise<T | null> {
  try {
    const res = await fetch(urlFor(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function lookupUser(
  token: string,
  handle: string
): Promise<{ id: string; handle: string | null } | null> {
  const json = await req<{ ok: boolean; user?: { id: string; handle: string | null } }>(
    'GET',
    `/users/lookup?handle=${encodeURIComponent(handle)}`,
    token
  )
  return json?.ok && json.user ? json.user : null
}

export async function listConversations(token: string): Promise<ConversationSummary[]> {
  const json = await req<{ ok: boolean; conversations?: ConversationSummary[] }>(
    'GET',
    '/conversations',
    token
  )
  return json?.ok ? json.conversations ?? [] : []
}

export async function startDm(token: string, handle: string): Promise<string | null> {
  const json = await req<{ ok: boolean; conversationId?: string }>(
    'POST',
    '/conversations/dm',
    token,
    { handle }
  )
  return json?.ok ? json.conversationId ?? null : null
}

export async function getMessages(
  token: string,
  conversationId: string
): Promise<ChatMessage[]> {
  const json = await req<{ ok: boolean; messages?: ChatMessage[] }>(
    'GET',
    `/conversations/${conversationId}/messages`,
    token
  )
  return json?.ok ? json.messages ?? [] : []
}

export async function sendMessage(
  token: string,
  conversationId: string,
  body: string,
  attachment: MessageAttachment | null = null
): Promise<ChatMessage | null> {
  const json = await req<{ ok: boolean; message?: ChatMessage }>(
    'POST',
    `/conversations/${conversationId}/messages`,
    token,
    { body, attachment }
  )
  return json?.ok ? json.message ?? null : null
}

export async function markRead(token: string, conversationId: string): Promise<void> {
  await req('POST', `/conversations/${conversationId}/read`, token, {})
}

export async function getUnreadTotal(token: string): Promise<number> {
  const json = await req<{ ok: boolean; count?: number }>('GET', '/messaging/unread', token)
  return json?.ok ? json.count ?? 0 : 0
}

// Unified inbox: conversations (DMs + shared spaces) and shares in one feed.
// Email items will appear here too once Gmail/Outlook is wired.
export interface InboxItem {
  kind: 'message' | 'share'
  id: string // conversationId for messages, shareToken for shares
  title: string
  preview: string
  ts: number
  unread: number
  convKind?: 'dm' | 'space'
  shareKind?: string | null
}

export async function getUnifiedInbox(
  token: string
): Promise<{ items: InboxItem[]; unread: number }> {
  const json = await req<{ ok: boolean; items?: InboxItem[]; unread?: number }>(
    'GET',
    '/inbox/unified',
    token
  )
  return json?.ok ? { items: json.items ?? [], unread: json.unread ?? 0 } : { items: [], unread: 0 }
}
