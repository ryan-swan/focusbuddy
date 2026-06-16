import { useEffect, useMemo } from 'react'
import { useMessagingStore } from '../../stores/messaging'
import { useMailStore } from '../../stores/mail'
import { useAccountStore } from '../../stores/account'
import { useViewStore } from '../../stores/view'
import { useSignInPrompt } from '../../stores/signInPrompt'
import Icon from '../Icon'

// Unified inbox — one feed for everything that needs you: direct messages,
// shared-space activity, items shared with you, and now unread email. Messages
// and shares come from the signal server; email is local (IMAP straight from
// the desktop), so the feed merges the two by time. Clicking a row takes you to
// the right surface — the conversation, or the email in Mail.

function relTime(ms: number): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

// One render-ready row, whatever its source.
interface Row {
  key: string
  icon: string
  title: string
  preview: string
  ts: number
  unread: number
  onClick?: () => void
  contactId?: string
}

export default function InboxView(): JSX.Element {
  const account = useAccountStore((s) => s.account)
  const requestSignIn = useSignInPrompt((s) => s.requestOpen)
  const items = useMessagingStore((s) => s.inboxItems)
  const refreshInbox = useMessagingStore((s) => s.refreshInbox)
  const openConversation = useMessagingStore((s) => s.openConversation)
  const acceptContact = useMessagingStore((s) => s.acceptContactRequest)
  const declineContact = useMessagingStore((s) => s.declineContactRequest)
  const goMessages = useViewStore((s) => s.goMessages)
  const goMail = useViewStore((s) => s.goMail)

  const mailAccount = useMailStore((s) => s.account)
  const mailMessages = useMailStore((s) => s.messages)
  const refreshMail = useMailStore((s) => s.refresh)

  useEffect(() => {
    if (account) void refreshInbox()
  }, [account, refreshInbox])

  // Build the merged, time-sorted feed. Server items keep their accept/decline
  // affordances; email contributes its unread messages.
  const rows = useMemo<Row[]>(() => {
    const serverRows: Row[] = items.map((it) => {
      const isMessage = it.kind === 'message'
      const isContact = it.kind === 'contact-request'
      const icon = isContact
        ? 'person_add'
        : isMessage && it.convKind !== 'space'
          ? 'forum'
          : 'folder_shared'
      return {
        key: `${it.kind}:${it.id}`,
        icon,
        title: it.title,
        preview: it.preview ?? '',
        ts: it.ts,
        unread: it.unread,
        onClick: isMessage
          ? () => {
              void openConversation(it.id)
              goMessages()
            }
          : undefined,
        contactId: isContact ? it.id : undefined
      }
    })
    const emailRows: Row[] = mailMessages
      .filter((m) => !m.seen)
      .map((m) => ({
        key: `email:${m.uid}`,
        icon: 'mail',
        title: m.fromName,
        preview: m.subject,
        ts: m.date,
        unread: 1,
        onClick: () => goMail(m.uid)
      }))
    return [...serverRows, ...emailRows].sort((a, b) => b.ts - a.ts)
  }, [items, mailMessages, openConversation, goMessages, goMail])

  // The feed is useful if you have a PlexiDesk account OR a connected mailbox.
  if (!account && !mailAccount) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod px-6">
        <div className="text-center max-w-sm">
          <Icon name="inbox" size={32} className="text-stone-400 dark:text-stone-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1">Inbox</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-4">
            Sign in to see your messages and shared items here, or connect your email in Mail to
            bring your inbox in too.
          </p>
          <button onClick={() => requestSignIn()} className="btn-primary mx-auto">
            <Icon name="login" size={14} />
            <span>Sign in</span>
          </button>
        </div>
      </div>
    )
  }

  function refreshAll(): void {
    if (account) void refreshInbox()
    if (mailAccount) void refreshMail()
  }

  return (
    <div className="h-full overflow-auto desk-paper no-tod">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <header className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 shadow-sm shrink-0">
            <Icon name="inbox" size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Inbox</h1>
            <p className="text-[12px] text-stone-500 dark:text-stone-400">
              Messages, shared items, and email — everything that needs you, in one place.
            </p>
          </div>
          <button onClick={refreshAll} className="icon-btn" title="Refresh">
            <Icon name="refresh" size={16} />
          </button>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
            <Icon name="inbox" size={26} className="text-stone-400 dark:text-stone-500 mx-auto mb-2" />
            <p className="text-sm text-stone-600 dark:text-stone-300">Your inbox is clear.</p>
            <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-1">
              {mailAccount
                ? 'No unread email, messages, or shares right now.'
                : 'Start a conversation from Messages, accept a shared folder, or connect your email in Mail.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 overflow-hidden divide-y divide-stone-100 dark:divide-stone-800">
            {rows.map((r) => (
              <div
                key={r.key}
                onClick={r.onClick}
                data-testid="inbox-item"
                className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                  r.onClick ? 'cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50' : ''
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-lg inline-flex items-center justify-center shrink-0 ${
                    r.unread > 0
                      ? 'bg-accent/15 text-accent'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                  }`}
                >
                  <Icon name={r.icon} size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[13px] truncate ${
                        r.unread > 0
                          ? 'font-semibold text-stone-900 dark:text-stone-100'
                          : 'font-medium text-stone-800 dark:text-stone-200'
                      }`}
                    >
                      {r.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-stone-400 dark:text-stone-500">
                      {relTime(r.ts)}
                    </span>
                    {!r.contactId && r.unread > 0 && (
                      <span className="shrink-0 text-[10px] font-semibold text-white bg-accent rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        {r.unread}
                      </span>
                    )}
                  </div>
                  {r.preview && (
                    <div className="text-[12px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                      {r.preview}
                    </div>
                  )}
                  {r.contactId && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={() => {
                          void acceptContact(r.contactId!)
                          goMessages()
                        }}
                        data-testid="contact-accept"
                        className="btn-primary px-2.5 py-1 text-[11px]"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => void declineContact(r.contactId!)}
                        data-testid="contact-decline"
                        className="text-[11px] text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 px-2 py-1"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
