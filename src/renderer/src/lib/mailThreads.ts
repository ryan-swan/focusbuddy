import type { MailListItem } from '@shared/types'

// Group a flat mailbox into conversation threads, the way a great email client
// does. Threading is driven first by the RFC 5322 reference graph (In-Reply-To
// and References that resolve to a message we hold), then by a shared normalized
// subject so that replies whose headers were stripped still collapse into their
// conversation. Two distinct conversations that happen to carry the exact same
// subject will merge, which is the long-standing subject-threading behaviour
// people know from Gmail; it keeps the inbox tidy and is predictable.

export interface MailThread {
  // Stable id for the thread (the earliest message's Message-ID, else its uid).
  id: string
  // Display subject, with Re:/Fwd: prefixes stripped.
  subject: string
  // The thread's messages, oldest first.
  messages: MailListItem[]
  // The newest message, what the collapsed row shows.
  latest: MailListItem
  count: number
  // True when any message in the thread is unread.
  unread: boolean
  // True when any message is flagged.
  flagged: boolean
  // True when any message carries an attachment.
  hasAttachments: boolean
  // Distinct sender display names, in order of first appearance.
  participants: string[]
  // The newest message's date, for sorting threads newest-first.
  date: number
}

const SUBJECT_PREFIX = /^(\s*(re|fwd|fw|aw|sv|vs|wg|antw)\s*(\[\d+\])?\s*:\s*)+/i

/** Strip leading Re:/Fwd: style prefixes (repeated or numbered) and trim. */
export function normalizeSubject(subject: string): string {
  let prev = subject ?? ''
  let next = prev.replace(SUBJECT_PREFIX, '')
  // A subject like "Re: Fwd: x" needs more than one pass.
  while (next !== prev) {
    prev = next
    next = prev.replace(SUBJECT_PREFIX, '')
  }
  return next.trim()
}

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]]
      i = this.parent[i]
    }
    return i
  }
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

export function threadMailbox(items: MailListItem[]): MailThread[] {
  if (items.length === 0) return []
  const uf = new UnionFind(items.length)

  // Index by Message-ID so reference links can resolve to a held message.
  const idToIndex = new Map<string, number>()
  items.forEach((m, i) => {
    if (m.messageId && !idToIndex.has(m.messageId)) idToIndex.set(m.messageId, i)
  })

  // 1) Reference graph: union a message with each ancestor we actually hold.
  items.forEach((m, i) => {
    const links = [m.inReplyTo, ...(m.references ?? [])].filter((x): x is string => !!x)
    for (const link of links) {
      const j = idToIndex.get(link)
      if (j !== undefined) uf.union(i, j)
    }
  })

  // 2) Subject graph: union messages that share a non-empty normalized subject.
  const subjectToIndex = new Map<string, number>()
  items.forEach((m, i) => {
    const key = normalizeSubject(m.subject)
    if (!key || key === '(no subject)') return
    const first = subjectToIndex.get(key)
    if (first === undefined) subjectToIndex.set(key, i)
    else uf.union(i, first)
  })

  // Collect groups by representative root.
  const groups = new Map<number, number[]>()
  items.forEach((_, i) => {
    const root = uf.find(i)
    const g = groups.get(root)
    if (g) g.push(i)
    else groups.set(root, [i])
  })

  const threads: MailThread[] = []
  for (const indices of groups.values()) {
    const messages = indices.map((i) => items[i]).sort((a, b) => a.date - b.date)
    const latest = messages[messages.length - 1]
    const earliest = messages[0]
    const participants: string[] = []
    for (const m of messages) {
      if (!participants.includes(m.fromName)) participants.push(m.fromName)
    }
    threads.push({
      id: earliest.messageId ?? `thread-${earliest.uid}`,
      subject: normalizeSubject(latest.subject) || latest.subject || '(no subject)',
      messages,
      latest,
      count: messages.length,
      unread: messages.some((m) => !m.seen),
      flagged: messages.some((m) => m.flagged),
      hasAttachments: messages.some((m) => m.hasAttachments),
      participants,
      date: latest.date
    })
  }

  // Newest conversation first.
  return threads.sort((a, b) => b.date - a.date)
}
