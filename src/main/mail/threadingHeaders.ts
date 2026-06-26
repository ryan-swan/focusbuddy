// Pull In-Reply-To and References message-ids out of the raw header block that
// ImapFlow returns for the `headers` fetch option. Each is an angle-bracketed
// token; References can carry several, folded across continuation lines. Pure
// and dependency-free so it is unit-testable without a live mailbox.

export interface ThreadingHeaders {
  inReplyTo: string | null
  references: string[]
}

export function parseThreadingHeaders(headers: Buffer | string | undefined): ThreadingHeaders {
  if (!headers) return { inReplyTo: null, references: [] }
  const text = typeof headers === 'string' ? headers : headers.toString('utf8')
  const ids = (line: string | undefined): string[] => (line ? (line.match(/<[^>]+>/g) ?? []) : [])
  // Header names are case-insensitive; capture the value including folded
  // continuation lines (lines beginning with whitespace).
  const field = (name: string): string | undefined => {
    const re = new RegExp(`^${name}:(.*(?:\\r?\\n[ \\t].*)*)`, 'im')
    return re.exec(text)?.[1]?.replace(/\r?\n/g, ' ').trim()
  }
  return { inReplyTo: ids(field('in-reply-to'))[0] ?? null, references: ids(field('references')) }
}
