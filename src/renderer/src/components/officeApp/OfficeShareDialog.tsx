import { useState } from 'react'
import type { FbDocument } from '@office'
import { useSharesStore } from '../../stores/shares'
import { generateAnonymousHandle } from '../../lib/shareSnapshot'
import { buildDocumentSnapshot } from '../../lib/officeShareSnapshot'
import { viewerUrlFor } from '../../lib/shareTokens'
import Icon from '../Icon'

// Share an office document, view-only, by link (and optional email invite). Mints
// a 'document' snapshot (rendered to HTML on the desktop) through the same share
// system PlexiDesk uses, so the link opens read-only in the browser viewer. Live
// collaboration and folder sharing are later phases of the sharing epic.

export default function OfficeShareDialog({
  doc,
  onClose
}: {
  doc: FbDocument
  onClose: () => void
}): JSX.Element {
  const createFor = useSharesStore((s) => s.createFor)
  const invite = useSharesStore((s) => s.invite)

  const [link, setLink] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  async function createLink(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const handle = generateAnonymousHandle()
      const snapshot = buildDocumentSnapshot(doc, handle)
      const created = await createFor({
        kind: 'document',
        entityId: doc.id,
        label: doc.title || 'Untitled',
        scope: 'view',
        snapshot,
        fromHandle: handle
      })
      const url = viewerUrlFor(created.token)
      setToken(created.token)
      setLink(url)
      await navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => {})
    } catch (e) {
      setError((e as Error).message || 'Could not create the share link.')
    } finally {
      setBusy(false)
    }
  }

  async function sendInvite(): Promise<void> {
    const addr = email.trim().toLowerCase()
    if (!addr.includes('@') || !token || inviteBusy) return
    setInviteBusy(true)
    setInviteMsg(null)
    try {
      const { emailDelivered } = await invite(token, addr)
      setInviteMsg(emailDelivered ? `Invite sent to ${addr}.` : `Saved ${addr}; email could not be sent.`)
      setEmail('')
    } catch (e) {
      setInviteMsg((e as Error).message || 'Could not send the invite.')
    } finally {
      setInviteBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="office-share-dialog"
        className="w-[440px] max-w-[92vw] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Icon name="share" size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-stone-800 dark:text-stone-100">
            Share “{doc.title || 'Untitled'}”
          </span>
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <p className="text-[12px] text-stone-500 dark:text-stone-400">
          Anyone with the link can view this document read-only in their browser. No sign-up needed.
        </p>

        {error && <div className="text-[12px] text-red-600 dark:text-red-400">{error}</div>}

        {!link ? (
          <button
            onClick={() => void createLink()}
            disabled={busy}
            data-testid="office-share-create"
            className="btn-primary w-full text-[13px] py-2 disabled:opacity-50"
          >
            {busy ? 'Creating link…' : 'Create link & copy'}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-700 px-2 py-1.5">
              <input
                readOnly
                value={link}
                data-testid="office-share-link"
                className="flex-1 min-w-0 bg-transparent text-[12px] font-mono text-stone-600 dark:text-stone-300 focus:outline-none"
              />
              <button
                onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
                className="text-[11px] text-accent hover:underline shrink-0"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="border-t border-stone-100 dark:border-stone-800 pt-2">
              <div className="text-[11px] text-stone-500 mb-1">Invite by email (optional)</div>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendInvite()
                  }}
                  placeholder="name@example.com"
                  className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded px-2 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => void sendInvite()}
                  disabled={inviteBusy || !email.includes('@')}
                  className="btn-primary text-[12px] px-3 py-1.5 disabled:opacity-50"
                >
                  {inviteBusy ? 'Sending…' : 'Send'}
                </button>
              </div>
              {inviteMsg && <div className="text-[11px] text-stone-500 mt-1">{inviteMsg}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
