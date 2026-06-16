import { useEffect } from 'react'
import { useMessagingStore } from '../../stores/messaging'
import { useAccountStore } from '../../stores/account'
import { useViewStore } from '../../stores/view'
import { useSignInPrompt } from '../../stores/signInPrompt'
import Icon from '../Icon'

// Unified inbox — one feed for everything that needs you: direct messages,
// shared-space activity, and items shared with you. Email will join this feed
// once Gmail/Outlook is connected. Clicking a message opens the conversation;
// the feed is the aggregator, Messages is the chat surface.

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

export default function InboxView(): JSX.Element {
  const account = useAccountStore((s) => s.account)
  const requestSignIn = useSignInPrompt((s) => s.requestOpen)
  const items = useMessagingStore((s) => s.inboxItems)
  const refreshInbox = useMessagingStore((s) => s.refreshInbox)
  const openConversation = useMessagingStore((s) => s.openConversation)
  const acceptContact = useMessagingStore((s) => s.acceptContactRequest)
  const declineContact = useMessagingStore((s) => s.declineContactRequest)
  const goMessages = useViewStore((s) => s.goMessages)

  useEffect(() => {
    if (account) void refreshInbox()
  }, [account, refreshInbox])

  if (!account) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod px-6">
        <div className="text-center max-w-sm">
          <Icon name="inbox" size={32} className="text-stone-400 dark:text-stone-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1">Inbox</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-4">
            Sign in to see your messages, shared items, and (soon) email in one place.
          </p>
          <button onClick={() => requestSignIn()} className="btn-primary mx-auto">
            <Icon name="login" size={14} />
            <span>Sign in</span>
          </button>
        </div>
      </div>
    )
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
          <button onClick={() => void refreshInbox()} className="icon-btn" title="Refresh">
            <Icon name="refresh" size={16} />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
            <Icon name="inbox" size={26} className="text-stone-400 dark:text-stone-500 mx-auto mb-2" />
            <p className="text-sm text-stone-600 dark:text-stone-300">Your inbox is clear.</p>
            <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-1">
              Start a conversation from Messages, or accept a shared folder to collaborate.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 overflow-hidden divide-y divide-stone-100 dark:divide-stone-800">
            {items.map((it) => {
              const isMessage = it.kind === 'message'
              const isContact = it.kind === 'contact-request'
              const icon = isContact
                ? 'person_add'
                : isMessage && it.convKind !== 'space'
                  ? 'forum'
                  : 'folder_shared'
              const clickable = isMessage
              return (
                <div
                  key={`${it.kind}:${it.id}`}
                  onClick={() => {
                    if (clickable) {
                      void openConversation(it.id)
                      goMessages()
                    }
                  }}
                  data-testid="inbox-item"
                  className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                    clickable ? 'cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50' : ''
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-lg inline-flex items-center justify-center shrink-0 ${
                      it.unread > 0
                        ? 'bg-accent/15 text-accent'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    <Icon name={icon} size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[13px] truncate ${
                          it.unread > 0
                            ? 'font-semibold text-stone-900 dark:text-stone-100'
                            : 'font-medium text-stone-800 dark:text-stone-200'
                        }`}
                      >
                        {it.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-stone-400 dark:text-stone-500">
                        {relTime(it.ts)}
                      </span>
                      {!isContact && it.unread > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold text-white bg-accent rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                          {it.unread}
                        </span>
                      )}
                    </div>
                    {it.preview && (
                      <div className="text-[12px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                        {it.preview}
                      </div>
                    )}
                    {isContact && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() => {
                            void acceptContact(it.id)
                            goMessages()
                          }}
                          data-testid="contact-accept"
                          className="btn-primary px-2.5 py-1 text-[11px]"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => void declineContact(it.id)}
                          data-testid="contact-decline"
                          className="text-[11px] text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 px-2 py-1"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
