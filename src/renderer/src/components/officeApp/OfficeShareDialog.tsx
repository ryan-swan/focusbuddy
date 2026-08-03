import { useState } from 'react'
import type { FbDocument } from '@office'
import type { ShareScope } from '@shared/types'
import { useSharesStore } from '../../stores/shares'
import { generateAnonymousHandle } from '../../lib/shareSnapshot'
import { buildDocumentSnapshot, buildFolderShareSnapshot } from '../../lib/officeShareSnapshot'
import { viewerUrlFor } from '../../lib/shareTokens'
import Icon from '../Icon'

// Share an office document or a Drive folder by link (and optional email invite),
// through the same share system PlexiDesk uses, so the link opens read-only in the
// browser viewer. A folder can be shared 'view' (read-only) or 'copy' (recipient
// imports it into their own Drive). Live collaboration is a later phase.

export type ShareTarget =
  | { kind: 'document'; doc: FbDocument }
  | { kind: 'docfolder'; folderId: string; name: string }

export default function OfficeShareDialog({
  target,
  onClose
}: {
  target: ShareTarget
  onClose: () => void
}): JSX.Element {
  const createFor = useSharesStore((s) => s.createFor)
  const invite = useSharesStore((s) => s.invite)

  const isFolder = target.kind === 'docfolder'
  const label = isFolder ? target.name || 'Folder' : target.doc.title || 'Untitled'

  const [scope, setScope] = useState<ShareScope>('view')
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
      const snapshot = isFolder
        ? await buildFolderShareSnapshot(target.folderId, target.name, handle)
        : buildDocumentSnapshot(target.doc, handle)
      const created = await createFor({
        kind: target.kind,
        entityId: isFolder ? target.folderId : target.doc.id,
        label,
        scope: isFolder ? scope : 'view',
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
        className="w-[440px] max-w-[92vw] rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-2xl p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Icon name={isFolder ? 'folder_shared' : 'share'} size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-[var(--ink-90)] truncate">
            Share “{label}”
          </span>
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        {isFolder && !link && (
          <div className="flex gap-2">
            <ScopeChip active={scope === 'view'} onClick={() => setScope('view')} title="View only" desc="Read-only in the browser" />
            <ScopeChip active={scope === 'copy'} onClick={() => setScope('copy')} title="Can copy" desc="Import into their Drive" />
          </div>
        )}

        <p className="text-[12px] text-[var(--ink-50)]">
          {isFolder
            ? scope === 'copy'
              ? 'Anyone with the link can view this folder and import a copy of its documents into their own Drive.'
              : 'Anyone with the link can view this folder and its documents read-only in their browser.'
            : 'Anyone with the link can view this document read-only in their browser. No sign-up needed.'}
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
            <div className="flex items-center gap-2 rounded-lg border border-[var(--edge-soft)] px-2 py-1.5">
              <input
                readOnly
                value={link}
                data-testid="office-share-link"
                className="flex-1 min-w-0 bg-transparent text-[12px] font-mono text-[var(--ink-70)] focus:outline-none"
              />
              <button
                onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
                className="text-[11px] text-accent hover:underline shrink-0"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="border-t border-[var(--edge-soft)] pt-2">
              <div className="text-[11px] text-[var(--ink-50)] mb-1">Invite by email (optional)</div>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendInvite()
                  }}
                  placeholder="name@example.com"
                  className="flex-1 bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => void sendInvite()}
                  disabled={inviteBusy || !email.includes('@')}
                  className="btn-primary text-[12px] px-3 py-1.5 disabled:opacity-50"
                >
                  {inviteBusy ? 'Sending…' : 'Send'}
                </button>
              </div>
              {inviteMsg && <div className="text-[11px] text-[var(--ink-50)] mt-1">{inviteMsg}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ScopeChip({
  active,
  onClick,
  title,
  desc
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-2.5 py-1.5 text-left ${
        active ? 'border-accent bg-accent/[0.06]' : 'border-[var(--edge-soft)]'
      }`}
    >
      <div className="text-[12px] font-medium text-[var(--ink-90)]">{title}</div>
      <div className="text-[10px] text-[var(--ink-50)]">{desc}</div>
    </button>
  )
}
