import { signalConfig } from './signalConfig'

// REST client for the messaging / collaboration backend on the signal server.
// Persistence + history go over REST; real-time delivery arrives over the
// WebSocket (see messagingSocket.ts). Mirrors the server's cohesive model:
// a conversation is a DM or a shared space; messages can carry a share.

// A 'share' carries a folder/task/widget token; the blob kinds reference an
// uploaded blob by id (fetched from the conversation-scoped attachment route).
export type MessageAttachment =
  | { kind: 'share'; token: string; entityKind: string; label: string }
  | {
      kind: 'image' | 'file' | 'voice' | 'video' | 'gif'
      id: string
      name: string
      mimeType: string
      sizeBytes: number
      durationMs?: number
    }

export type MessageBlobKind = 'image' | 'file' | 'voice' | 'video' | 'gif'

// The authenticated URL bytes are served from. The token rides as a query param
// because <img>/<audio> elements can't set an Authorization header.
export function attachmentUrl(conversationId: string, blobId: string, token: string): string {
  return `${signalConfig.httpUrl.replace(/\/+$/, '')}/conversations/${conversationId}/attachments/${blobId}?token=${encodeURIComponent(token)}`
}

// Upload bytes into a conversation, returning the blob id to reference when
// sending the message. Returns null on any failure (honest: caller shows error).
export async function uploadAttachment(
  token: string,
  conversationId: string,
  kind: MessageBlobKind,
  bytes: ArrayBuffer,
  meta: { name: string; mime: string; ext: string }
): Promise<{ id: string; sizeBytes: number } | null> {
  try {
    const qs = new URLSearchParams({ kind, name: meta.name, mime: meta.mime, ext: meta.ext }).toString()
    const res = await fetch(
      `${signalConfig.httpUrl.replace(/\/+$/, '')}/conversations/${conversationId}/attachments?${qs}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: bytes
      }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { ok: boolean; attachment?: { id: string; sizeBytes: number } }
    return json?.ok ? json.attachment ?? null : null
  } catch {
    return null
  }
}

export interface MessageReaction {
  emoji: string
  accountIds: string[]
}

export interface ChatMessage {
  id: string
  conversationId: string
  fromAccount: string
  body: string
  attachment: MessageAttachment | null
  createdAt: number
  // Emoji reactions; absent on a freshly-sent message until reactions arrive.
  reactions?: MessageReaction[]
  // Set when this message is a threaded reply; null/absent for a top-level message.
  parentId?: string | null
  // For a top-level message, how many threaded replies it has.
  replyCount?: number
  // When the body was last edited, or null/absent if never.
  editedAt?: number | null
  // When the message was deleted (soft delete); body is blanked when set.
  deletedAt?: number | null
}

export interface OrgChannel {
  id: string
  title: string
  memberCount: number
  isMember: boolean
  lastMessageAt: number
}

export interface ConversationSummary {
  id: string
  kind: 'dm' | 'space' | 'channel'
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
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
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
  attachment: MessageAttachment | null = null,
  parentId: string | null = null
): Promise<ChatMessage | null> {
  const json = await req<{ ok: boolean; message?: ChatMessage }>(
    'POST',
    `/conversations/${conversationId}/messages`,
    token,
    { body, attachment, parentId: parentId ?? undefined }
  )
  return json?.ok ? json.message ?? null : null
}

export async function editMessage(
  token: string,
  conversationId: string,
  messageId: string,
  body: string
): Promise<ChatMessage | null> {
  const json = await req<{ ok: boolean; message?: ChatMessage }>(
    'PATCH',
    `/conversations/${conversationId}/messages/${messageId}`,
    token,
    { body }
  )
  return json?.ok ? json.message ?? null : null
}

export async function deleteMessage(token: string, conversationId: string, messageId: string): Promise<boolean> {
  const json = await req<{ ok: boolean }>(
    'DELETE',
    `/conversations/${conversationId}/messages/${messageId}`,
    token
  )
  return json?.ok ?? false
}

export async function getThreadReplies(
  token: string,
  conversationId: string,
  parentId: string
): Promise<ChatMessage[]> {
  const json = await req<{ ok: boolean; messages?: ChatMessage[] }>(
    'GET',
    `/conversations/${conversationId}/messages/${parentId}/thread`,
    token
  )
  return json?.ok ? json.messages ?? [] : []
}

export async function markRead(token: string, conversationId: string): Promise<void> {
  await req('POST', `/conversations/${conversationId}/read`, token, {})
}

export async function addReaction(
  token: string,
  conversationId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  await req('POST', `/conversations/${conversationId}/messages/${messageId}/reactions`, token, { emoji })
}

export async function removeReaction(
  token: string,
  conversationId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  await req('DELETE', `/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, token)
}

export async function listOrgChannels(token: string, orgId: string): Promise<OrgChannel[]> {
  const json = await req<{ ok: boolean; channels?: OrgChannel[] }>('GET', `/orgs/${orgId}/channels`, token)
  return json?.ok ? json.channels ?? [] : []
}

export async function createChannel(token: string, orgId: string, name: string): Promise<string | null> {
  const json = await req<{ ok: boolean; conversationId?: string }>('POST', `/orgs/${orgId}/channels`, token, { name })
  return json?.ok ? json.conversationId ?? null : null
}

export async function joinChannel(token: string, conversationId: string): Promise<boolean> {
  const json = await req<{ ok: boolean }>('POST', `/conversations/${conversationId}/join`, token, {})
  return json?.ok ?? false
}

export async function getUnreadTotal(token: string): Promise<number> {
  const json = await req<{ ok: boolean; count?: number }>('GET', '/messaging/unread', token)
  return json?.ok ? json.count ?? 0 : 0
}

// Unified inbox: conversations (DMs + shared spaces), shares, and contact
// requests in one feed. Email items will appear here too once Gmail/Outlook is
// wired.
export interface InboxItem {
  kind: 'message' | 'share' | 'contact-request'
  id: string // conversationId for messages, shareToken for shares, requestId for contact-requests
  title: string
  preview: string
  ts: number
  unread: number
  convKind?: 'dm' | 'space'
  shareKind?: string | null
}

// ── Contacts: add by email ──────────────────────────────────────────────────
export async function inviteContact(
  token: string,
  email: string
): Promise<{ ok: boolean; status?: 'requested' | 'invited'; error?: string }> {
  const json = await req<{ ok: boolean; status?: 'requested' | 'invited' }>(
    'POST',
    '/contacts/invite',
    token,
    { email }
  )
  return json?.ok ? { ok: true, status: json.status } : { ok: false, error: 'Could not send the invite.' }
}

export async function acceptContact(token: string, requestId: string): Promise<string | null> {
  const json = await req<{ ok: boolean; conversationId?: string }>(
    'POST',
    `/contacts/${requestId}/accept`,
    token,
    {}
  )
  return json?.ok ? json.conversationId ?? null : null
}

export async function declineContact(token: string, requestId: string): Promise<void> {
  await req('POST', `/contacts/${requestId}/decline`, token, {})
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
