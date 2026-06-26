import { describe, it, expect } from 'vitest'
import { threadMailbox, normalizeSubject } from '../../src/renderer/src/lib/mailThreads'
import type { MailListItem } from '../../src/shared/types'

let uid = 1
function mail(p: Partial<MailListItem> & { subject: string; date: number }): MailListItem {
  return {
    uid: uid++,
    fromName: p.fromName ?? 'Alice',
    fromAddress: p.fromAddress ?? 'alice@x.com',
    subject: p.subject,
    date: p.date,
    seen: p.seen ?? true,
    flagged: p.flagged ?? false,
    hasAttachments: p.hasAttachments ?? false,
    messageId: p.messageId ?? null,
    inReplyTo: p.inReplyTo ?? null,
    references: p.references ?? []
  }
}

describe('normalizeSubject', () => {
  it('strips single and repeated reply/forward prefixes', () => {
    expect(normalizeSubject('Re: Lunch')).toBe('Lunch')
    expect(normalizeSubject('RE: FWD: Lunch')).toBe('Lunch')
    expect(normalizeSubject('Re[2]: Lunch')).toBe('Lunch')
    expect(normalizeSubject('Fwd: Re: Project plan')).toBe('Project plan')
    expect(normalizeSubject('Plain subject')).toBe('Plain subject')
  })
})

describe('threadMailbox', () => {
  it('groups a reply to its parent via In-Reply-To', () => {
    const root = mail({ subject: 'Budget', date: 1, messageId: '<a@x>' })
    const reply = mail({ subject: 'Re: Budget', date: 2, inReplyTo: '<a@x>', fromName: 'Bob' })
    const threads = threadMailbox([reply, root])
    expect(threads).toHaveLength(1)
    expect(threads[0].count).toBe(2)
    expect(threads[0].subject).toBe('Budget')
    // Oldest-first inside the thread; latest is the reply.
    expect(threads[0].messages.map((m) => m.uid)).toEqual([root.uid, reply.uid])
    expect(threads[0].latest.uid).toBe(reply.uid)
    expect(threads[0].participants).toEqual(['Alice', 'Bob'])
  })

  it('groups a deep chain via the References header even when In-Reply-To is missing', () => {
    const a = mail({ subject: 'Spec', date: 1, messageId: '<a@x>' })
    const b = mail({ subject: 'Re: Spec', date: 2, messageId: '<b@x>', references: ['<a@x>'] })
    const c = mail({ subject: 'Re: Spec', date: 3, messageId: '<c@x>', references: ['<a@x>', '<b@x>'] })
    const threads = threadMailbox([c, a, b])
    expect(threads).toHaveLength(1)
    expect(threads[0].count).toBe(3)
  })

  it('threads header-stripped replies by their shared normalized subject', () => {
    const a = mail({ subject: 'Welcome', date: 1 })
    const b = mail({ subject: 'Re: Welcome', date: 2 })
    const threads = threadMailbox([a, b])
    expect(threads).toHaveLength(1)
    expect(threads[0].count).toBe(2)
  })

  it('keeps distinct subjects in distinct threads', () => {
    const a = mail({ subject: 'Invoice 1', date: 1 })
    const b = mail({ subject: 'Invoice 2', date: 2 })
    const threads = threadMailbox([a, b])
    expect(threads).toHaveLength(2)
  })

  it('does not merge unrelated "(no subject)" messages', () => {
    const a = mail({ subject: '(no subject)', date: 1 })
    const b = mail({ subject: '(no subject)', date: 2 })
    const threads = threadMailbox([a, b])
    expect(threads).toHaveLength(2)
  })

  it('sorts threads newest-first and marks unread / attachments / flagged', () => {
    const old = mail({ subject: 'Old chat', date: 10 })
    const newRoot = mail({ subject: 'New chat', date: 100, messageId: '<n@x>', seen: false })
    const newReply = mail({ subject: 'Re: New chat', date: 200, inReplyTo: '<n@x>', hasAttachments: true, flagged: true })
    const threads = threadMailbox([old, newRoot, newReply])
    expect(threads.map((t) => t.subject)).toEqual(['New chat', 'Old chat'])
    const newThread = threads[0]
    expect(newThread.unread).toBe(true)
    expect(newThread.hasAttachments).toBe(true)
    expect(newThread.flagged).toBe(true)
    expect(newThread.date).toBe(200)
  })

  it('returns an empty array for an empty mailbox', () => {
    expect(threadMailbox([])).toEqual([])
  })

  it('connects two reference-subtrees that also share a subject', () => {
    // Reply with stripped references but matching subject still joins the root chain.
    const root = mail({ subject: 'Launch', date: 1, messageId: '<r@x>' })
    const linked = mail({ subject: 'Re: Launch', date: 2, inReplyTo: '<r@x>', messageId: '<l@x>' })
    const orphan = mail({ subject: 'Re: Launch', date: 3 })
    const threads = threadMailbox([root, linked, orphan])
    expect(threads).toHaveLength(1)
    expect(threads[0].count).toBe(3)
  })
})
