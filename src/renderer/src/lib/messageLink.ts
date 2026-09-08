// A PlexiiMessage moment as an internal URL (DEC-124): the Attention item a
// message bell files points back at its conversation — and at the message —
// so the queue can route you to it. Same family as meetingLink's
// plexii://meeting/<id>?seg=<segId> (C5): an app-internal door, never opened
// externally. DEC-127: a reply also names its parent (`p=`), so the way back
// can open the thread it lives in before landing on it.

const PREFIX = 'plexii://message/'

export function buildMessageUrl(
  conversationId: string,
  messageId?: string | null,
  parentId?: string | null
): string {
  const base = `${PREFIX}${encodeURIComponent(conversationId)}`
  if (!messageId) return base
  const parent = parentId ? `&p=${encodeURIComponent(parentId)}` : ''
  return `${base}?m=${encodeURIComponent(messageId)}${parent}`
}

export function parseMessageUrl(
  url: string | null | undefined
): { conversationId: string; messageId: string | null; parentId: string | null } | null {
  if (!url || !url.startsWith(PREFIX)) return null
  const rest = url.slice(PREFIX.length)
  const q = rest.indexOf('?')
  const conversationId = decodeURIComponent(q === -1 ? rest : rest.slice(0, q))
  if (!conversationId) return null
  let messageId: string | null = null
  let parentId: string | null = null
  if (q !== -1) {
    const qs = rest.slice(q + 1)
    const m = /(?:^|&)m=([^&]+)/.exec(qs)
    if (m) messageId = decodeURIComponent(m[1])
    // A parent only means something for a message — a bare `p=` is ignored.
    const p = /(?:^|&)p=([^&]+)/.exec(qs)
    if (p && messageId) parentId = decodeURIComponent(p[1])
  }
  return { conversationId, messageId, parentId }
}
