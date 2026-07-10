import { signalConfig } from './signalConfig'
import type { ActionProposal } from '@shared/types'

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

// Classify a picked file into an attachment kind from its MIME type. A GIF is its
// own kind (it animates); other images are 'image'; anything video/* is a video
// message; everything else is a generic file. Pure so it can be unit-tested
// without a running renderer.
export function attachmentKindForMime(mimeType: string): MessageBlobKind {
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'voice'
  return 'file'
}

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
  // PlexiChat P4: confirm-before-apply ActionProposals from the AI member, or
  // null/absent for human messages. Rendered as cards under the message.
  proposals?: ActionProposal[] | null
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
  members: Array<{ accountId: string; handle: string | null; firstName?: string | null; lastName?: string | null }>
  lastMessage: ChatMessage | null
  // Set when this channel is bound to a Room/Desk/Document (PlexiChat epic P1).
  objectKind?: string | null
  objectId?: string | null
  visibility?: 'public' | 'private'
  notifLevel?: 'all' | 'mentions' | 'muted'
}

function urlFor(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

async function req<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
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

export interface SearchHit {
  messageId: string
  conversationId: string
  conversationTitle: string
  body: string
  fromAccount: string
  createdAt: number
}

export interface ActivityItem extends SearchHit {
  reason: 'mention' | 'reply'
}

// Activity feed: @mentions of me + replies to my messages, active org.
export async function getActivity(token: string): Promise<ActivityItem[]> {
  const json = await req<{ ok: boolean; items?: ActivityItem[] }>('GET', '/activity', token)
  return json?.ok ? json.items ?? [] : []
}

// Set my notification level for a conversation.
export async function setNotifLevel(
  token: string,
  conversationId: string,
  level: 'all' | 'mentions' | 'muted'
): Promise<void> {
  await req('POST', `/conversations/${conversationId}/notif`, token, { level })
}

// Search messages across the account's conversations in the active org.
export async function searchMessages(token: string, q: string): Promise<SearchHit[]> {
  const json = await req<{ ok: boolean; hits?: SearchHit[] }>('GET', `/messages/search?q=${encodeURIComponent(q)}`, token)
  return json?.ok ? json.hits ?? [] : []
}

// Pinned messages for a conversation.
export async function listPins(token: string, conversationId: string): Promise<ChatMessage[]> {
  const json = await req<{ ok: boolean; pins?: ChatMessage[] }>('GET', `/conversations/${conversationId}/pins`, token)
  return json?.ok ? json.pins ?? [] : []
}
export async function pinMessage(token: string, conversationId: string, messageId: string): Promise<void> {
  await req('POST', `/conversations/${conversationId}/messages/${messageId}/pin`, token, {})
}
export async function unpinMessage(token: string, conversationId: string, messageId: string): Promise<void> {
  await req('DELETE', `/conversations/${conversationId}/messages/${messageId}/pin`, token)
}

// P2 membership: add by handle / remove-or-leave / set visibility.
export async function addConversationMember(
  token: string,
  conversationId: string,
  handle: string
): Promise<{ ok: boolean; error?: string }> {
  const json = await req<{ ok: boolean; error?: string }>(
    'POST',
    `/conversations/${conversationId}/members`,
    token,
    { handle }
  )
  return json ?? { ok: false, error: 'Could not reach the server.' }
}
export async function removeConversationMember(token: string, conversationId: string, accountId: string): Promise<boolean> {
  const json = await req<{ ok: boolean }>('DELETE', `/conversations/${conversationId}/members/${accountId}`, token)
  return !!json?.ok
}
export async function setConversationVisibility(
  token: string,
  conversationId: string,
  visibility: 'public' | 'private'
): Promise<void> {
  await req('POST', `/conversations/${conversationId}/visibility`, token, { visibility })
}

// Get (or lazily create) the chat channel bound to a Room/Desk/Document.
export async function getOrCreateObjectChannel(
  token: string,
  input: { objectKind: 'room' | 'desk' | 'document'; objectId: string; orgId: string | null; memberIds?: string[]; title: string }
): Promise<string | null> {
  const json = await req<{ ok: boolean; conversationId?: string }>('POST', '/conversations/object', token, input)
  return json?.ok ? json.conversationId ?? null : null
}

// Soft-archive an object's channel when the object is deleted (best-effort).
export async function archiveObjectChannel(token: string, objectKind: string, objectId: string): Promise<void> {
  await req('POST', '/conversations/object/archive', token, { objectKind, objectId })
}

export async function createChannel(token: string, orgId: string, name: string): Promise<string | null> {
  const json = await req<{ ok: boolean; conversationId?: string }>('POST', `/orgs/${orgId}/channels`, token, { name })
  return json?.ok ? json.conversationId ?? null : null
}

export async function joinChannel(token: string, conversationId: string): Promise<boolean> {
  const json = await req<{ ok: boolean }>('POST', `/conversations/${conversationId}/join`, token, {})
  return json?.ok ?? false
}

// PlexiChat P3 (AI member): an org's Anthropic key so its @plexi chat member can
// reply on the server. Admin-only server-side. The key itself is never returned;
// only whether one is configured (and whether the server supports storing one).
export interface OrgAiKeyStatus {
  configured: boolean
  serverSupported: boolean
}

export async function getOrgAiKeyStatus(token: string, orgId: string): Promise<OrgAiKeyStatus | null> {
  const json = await req<{ ok: boolean; configured?: boolean; serverSupported?: boolean }>(
    'GET',
    `/orgs/${orgId}/ai-key`,
    token
  )
  if (!json?.ok) return null
  return { configured: !!json.configured, serverSupported: !!json.serverSupported }
}

export async function setOrgAiKey(token: string, orgId: string, key: string): Promise<boolean> {
  const json = await req<{ ok: boolean }>('PUT', `/orgs/${orgId}/ai-key`, token, { key })
  return json?.ok ?? false
}

export async function clearOrgAiKey(token: string, orgId: string): Promise<boolean> {
  const json = await req<{ ok: boolean }>('DELETE', `/orgs/${orgId}/ai-key`, token)
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
