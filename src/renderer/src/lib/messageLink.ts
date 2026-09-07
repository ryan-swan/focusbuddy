// A PlexiiMessage moment as an internal URL (DEC-124): the Attention item a
// message bell files points back at its conversation — and at the message —
// so the queue can route you to it. Same family as meetingLink's
// plexii://meeting/<id>?seg=<segId> (C5): an app-internal door, never opened
// externally.

const PREFIX = 'plexii://message/'

export function buildMessageUrl(conversationId: string, messageId?: string | null): string {
  const base = `${PREFIX}${encodeURIComponent(conversationId)}`
  return messageId ? `${base}?m=${encodeURIComponent(messageId)}` : base
}

export function parseMessageUrl(
  url: string | null | undefined
): { conversationId: string; messageId: string | null } | null {
  if (!url || !url.startsWith(PREFIX)) return null
  const rest = url.slice(PREFIX.length)
  const q = rest.indexOf('?')
  const conversationId = decodeURIComponent(q === -1 ? rest : rest.slice(0, q))
  if (!conversationId) return null
  let messageId: string | null = null
  if (q !== -1) {
    const m = /(?:^|&)m=([^&]+)/.exec(rest.slice(q + 1))
    if (m) messageId = decodeURIComponent(m[1])
  }
  return { conversationId, messageId }
}
