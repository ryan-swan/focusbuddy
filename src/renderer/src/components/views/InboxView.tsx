import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMessagingStore } from '../../stores/messaging'
import { useAccountStore } from '../../stores/account'
import { useViewStore } from '../../stores/view'
import { useNodeStore } from '../../stores/nodes'
import { useSharesStore } from '../../stores/shares'
import { acceptShareIntoWorkspace } from '../../lib/acceptShare'
import { useSignInPrompt } from '../../stores/signInPrompt'
import { useDocCollabStore } from '../../stores/docCollab'
import type { Takeover } from '../../lib/docCollabClient'
import Icon from '../Icon'

// PlexiInbox — your internal PlexiDesk notifications, and only those: direct
// and shared-space chat, folders/files/canvases/widgets shared with you, and
// contact requests. Email is deliberately NOT here; it lives in Mail. Clicking
// a row takes you to the conversation or the shared item.

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
  const goTask = useViewStore((s) => s.goTask)
  const goProject = useViewStore((s) => s.goProject)
  const setActive = useNodeStore((s) => s.setActive)
  const acceptByToken = useSharesStore((s) => s.acceptByToken)
  const takeovers = useDocCollabStore((s) => s.takeovers)
  const refreshTakeovers = useDocCollabStore((s) => s.refreshTakeovers)
  const respondTakeover = useDocCollabStore((s) => s.respond)

  useEffect(() => {
    if (account) {
      void refreshInbox()
      void refreshTakeovers()
    }
  }, [account, refreshInbox, refreshTakeovers])

  // Accept a shared folder/task/widget and open it. A share row used to do
  // nothing on click; now it resolves the share into the workspace (under
  // "Shared with me") and navigates to it.
  const openShare = useCallback(
    async (token: string): Promise<void> => {
      try {
        const item = await acceptByToken(token)
        const res = await acceptShareIntoWorkspace(item.snapshot)
        if (res.rootKind === 'folder') {
          goProject(res.rootNodeId)
        } else {
          setActive(res.rootNodeId)
          goTask(res.rootNodeId)
        }
      } catch {
        // Snapshot couldn't be resolved (expired / incompatible). Leave the row;
        // the sidebar's "Shared with me" surfaces the same item with its own
        // error handling rather than silently pretending it opened.
      }
    },
    [acceptByToken, goProject, setActive, goTask]
  )

  // Internal notifications only: chat (direct + shared-space), shared items, and
  // contact requests. Email is intentionally excluded — it lives in Mail.
  const rows = useMemo<Row[]>(() => {
    return items
      .map((it) => {
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
            : it.kind === 'share'
              ? () => void openShare(it.id)
              : undefined,
          contactId: isContact ? it.id : undefined
        }
      })
      .sort((a, b) => b.ts - a.ts)
  }, [items, openConversation, goMessages, openShare])

  // PlexiInbox needs a PlexiDesk account (email lives in Mail, separately).
  if (!account) {
    return (
      <div className="h-full flex items-center justify-center desk-paper no-tod px-6">
        <div className="text-center max-w-sm">
          <Icon name="inbox" size={32} className="text-stone-400 dark:text-stone-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1">PlexiInbox</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-4">
            Sign in to see your PlexiDesk notifications here, chat messages, shared folders and
            files, and contact requests. Email is in Mail.
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
  }

  return (
    <div className="h-full overflow-auto desk-paper no-tod">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <header className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700 shadow-sm shrink-0">
            <Icon name="inbox" size={20} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">PlexiInbox</h1>
            <p className="text-[12px] text-stone-500 dark:text-stone-400">
              Your PlexiDesk notifications: chat, shared items, and contact requests. Email is in Mail.
            </p>
          </div>
          <button onClick={refreshAll} className="icon-btn" title="Refresh">
            <Icon name="refresh" size={16} />
          </button>
        </header>

        {takeovers.length > 0 && (
          <div className="mb-4 space-y-2" data-testid="takeover-requests">
            {takeovers.map((t) => (
              <TakeoverCard
                key={t.id}
                takeover={t}
                onRespond={(accept, message) => void respondTakeover(t.id, accept, message)}
              />
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center">
            <Icon name="inbox" size={26} className="text-stone-400 dark:text-stone-500 mx-auto mb-2" />
            <p className="text-sm text-stone-600 dark:text-stone-300">Your PlexiInbox is clear.</p>
            <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-1">
              No new chat, shared items, or contact requests right now. Email lives in Mail.
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

// A pending request from another member to take over editing a live document
// you currently hold. Accepting transfers the edit lock to them.
function TakeoverCard({
  takeover,
  onRespond
}: {
  takeover: Takeover
  onRespond: (accept: boolean, message: string) => void
}): JSX.Element {
  const [rejecting, setRejecting] = useState(false)
  const [message, setMessage] = useState('')
  return (
    <div
      data-testid="takeover-card"
      className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-amber-200/60 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 inline-flex items-center justify-center shrink-0">
          <Icon name="lock_open" size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-stone-900 dark:text-stone-100">
            {takeover.requesterHandle ?? 'Someone'} wants to edit “{takeover.docTitle ?? 'a document'}”
          </div>
          {takeover.message && (
            <div className="text-[12px] text-stone-600 dark:text-stone-300 mt-0.5">“{takeover.message}”</div>
          )}
          {rejecting ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Reason (optional)"
                data-testid="takeover-reject-message"
                className="flex-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-1 text-[12px] focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => onRespond(false, message)}
                data-testid="takeover-reject-send"
                className="text-[11px] px-2.5 py-1 rounded-md border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300"
              >
                Send decline
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onRespond(true, '')}
                data-testid="takeover-accept"
                className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:brightness-110"
              >
                Hand over editing
              </button>
              <button
                onClick={() => setRejecting(true)}
                data-testid="takeover-reject"
                className="text-[11px] px-2 py-1 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
