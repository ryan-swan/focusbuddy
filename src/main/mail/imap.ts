// IMAP client — the thin layer that actually talks to the user's mail server.
// PlexiDesk connects directly from the desktop using imapflow, lists the most
// recent INBOX messages (envelope only, so the list loads fast), and fetches a
// full message body on demand with mailparser when one is opened.
//
// Each call opens a fresh, short-lived connection and logs out. A desktop
// client polls infrequently, so a connection pool would be premature; a clean
// connect/lock/logout per operation is simpler and avoids stale-socket bugs.

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { MailAccountConfig } from './mailAccount'

export interface MailListItem {
  uid: number
  // Sender display name (falls back to the address) and the raw address.
  fromName: string
  fromAddress: string
  subject: string
  // Epoch millis of the message date, for sorting + relative-time display.
  date: number
  seen: boolean
  flagged: boolean
  // True when the message carries at least one real attachment.
  hasAttachments: boolean
}

export interface MailFullMessage {
  uid: number
  fromName: string
  fromAddress: string
  to: string
  subject: string
  date: number
  // Plain-text body, derived from text/plain or stripped from HTML.
  text: string
  // Sanitized-enough HTML body when the message had one (rendered in a
  // sandboxed iframe on the renderer side), else null.
  html: string | null
  attachments: { filename: string; size: number; contentType: string }[]
}

function buildClient(config: MailAccountConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    // No verbose protocol logging; surface only thrown errors.
    logger: false,
    // Fail fast on an unresponsive or wrong-port server rather than hanging
    // the Settings "Test" button forever.
    greetingTimeout: 12_000,
    socketTimeout: 30_000
  })
}

/** Turn imapflow / network errors into a short, human message. */
function explain(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/auth|credential|login|invalid/i.test(msg)) {
    return 'Login was rejected. Check the username and password. Gmail, iCloud and Fastmail need an app-specific password, not your normal one.'
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
    return 'Could not find that mail server. Check the IMAP host.'
  }
  if (/ECONNREFUSED|ETIMEDOUT|timeout|greeting/i.test(msg)) {
    return 'Could not reach that mail server. Check the host, the port, and the SSL/TLS setting.'
  }
  if (/self.signed|certificate|TLS|SSL/i.test(msg)) {
    return 'The server’s TLS certificate could not be verified.'
  }
  return msg
}

/** Connect and immediately log out — proves the credentials work. */
export async function testConnection(
  config: MailAccountConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = buildClient(config)
  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (err) {
    try {
      await client.close()
    } catch {
      /* already down */
    }
    return { ok: false, error: explain(err) }
  }
}

/** The most recent `limit` INBOX messages, newest first (envelope only). */
export async function listInbox(
  config: MailAccountConfig,
  limit = 40
): Promise<MailListItem[]> {
  const client = buildClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  const items: MailListItem[] = []
  try {
    const total =
      typeof client.mailbox === 'object' && client.mailbox ? client.mailbox.exists : 0
    if (!total) return []
    const start = Math.max(1, total - limit + 1)
    for await (const msg of client.fetch(`${start}:*`, {
      uid: true,
      envelope: true,
      flags: true,
      bodyStructure: true
    })) {
      const from = msg.envelope?.from?.[0]
      const flags = msg.flags ?? new Set<string>()
      items.push({
        uid: msg.uid,
        fromName: from?.name || from?.address || 'Unknown sender',
        fromAddress: from?.address || '',
        subject: msg.envelope?.subject || '(no subject)',
        date: msg.envelope?.date ? new Date(msg.envelope.date).getTime() : 0,
        seen: flags.has('\\Seen'),
        flagged: flags.has('\\Flagged'),
        hasAttachments: hasRealAttachment(msg.bodyStructure)
      })
    }
  } finally {
    lock.release()
    await client.logout()
  }
  // Newest first.
  return items.sort((a, b) => b.date - a.date)
}

// Walk the body structure looking for a part dispositioned as an attachment.
function hasRealAttachment(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const n = node as { disposition?: string; childNodes?: unknown[] }
  if (typeof n.disposition === 'string' && n.disposition.toLowerCase() === 'attachment') {
    return true
  }
  if (Array.isArray(n.childNodes)) {
    return n.childNodes.some((c) => hasRealAttachment(c))
  }
  return false
}

/** Download + parse one message by UID for the reading pane. */
export async function getMessage(
  config: MailAccountConfig,
  uid: number
): Promise<MailFullMessage | null> {
  const client = buildClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    const fetched = await client.fetchOne(String(uid), { source: true }, { uid: true })
    if (!fetched || !fetched.source) return null
    const parsed = await simpleParser(fetched.source)
    const from = parsed.from?.value?.[0]
    const toText =
      parsed.to && !Array.isArray(parsed.to)
        ? parsed.to.text
        : Array.isArray(parsed.to)
          ? parsed.to.map((t) => t.text).join(', ')
          : ''
    return {
      uid,
      fromName: from?.name || from?.address || 'Unknown sender',
      fromAddress: from?.address || '',
      to: toText || '',
      subject: parsed.subject || '(no subject)',
      date: parsed.date ? parsed.date.getTime() : 0,
      text: parsed.text || '',
      html: typeof parsed.html === 'string' ? parsed.html : null,
      attachments: (parsed.attachments || []).map((a) => ({
        filename: a.filename || 'attachment',
        size: a.size || 0,
        contentType: a.contentType || 'application/octet-stream'
      }))
    }
  } finally {
    lock.release()
    await client.logout()
  }
}

/** Mark a message read on the server (so the unread state stays in sync). */
export async function markSeen(config: MailAccountConfig, uid: number): Promise<void> {
  const client = buildClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
  } finally {
    lock.release()
    await client.logout()
  }
}
