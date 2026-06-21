import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  ShareableKind,
  ShareLink,
  ShareScope
} from '@shared/types'
import { useSharesStore } from '../stores/shares'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { viewerUrlFor } from '../lib/shareTokens'
import {
  buildFolderSnapshot,
  buildTaskSnapshot,
  buildWidgetSnapshot,
  generateAnonymousHandle
} from '../lib/shareSnapshot'
import Icon from './Icon'

// Universal share dialog — opens from a folder, task, or widget right-click.
// One flow regardless of the entity kind: pick scope (view-only or
// collaborator-copy), mint a link, copy it, see existing links + revoke.
//
// The link URL points at the hosted viewer (`https://focusbuddy-viewer.vercel.app/share/…`).
// In local-mock mode the URL won't resolve yet — there's an honest banner
// telling the user that. Once the matching/viewer service ships, the SAME
// links start working without any change to the dialog.

interface Props {
  kind: ShareableKind
  entityId: string
  // Display label cached at create-time. Used in the link list so revoked
  // / renamed items still make sense.
  label: string
  onClose: () => void
}

export default function ShareDialog({
  kind,
  entityId,
  label,
  onClose
}: Props): JSX.Element {
  const createFor = useSharesStore((s) => s.createFor)
  const revoke = useSharesStore((s) => s.revoke)
  const remove = useSharesStore((s) => s.remove)
  const refresh = useSharesStore((s) => s.refresh)
  // CRITICAL: subscribe to the FULL outgoing array (stable ref while the
  // array itself is unchanged) and derive the filtered subset with
  // useMemo. The previous code did the .filter INSIDE the selector,
  // which returned a NEW ARRAY every render → Zustand's default Object.is
  // equality always failed → React saw the value as constantly changing
  // → re-render → re-fire effects → "Maximum update depth exceeded".
  const allOutgoing = useSharesStore((s) => s.outgoing)
  const outgoing = useMemo(
    () => allOutgoing.filter((l) => l.kind === kind && l.entityId === entityId),
    [allOutgoing, kind, entityId]
  )

  const [scope, setScope] = useState<ShareScope>('view')
  const [busy, setBusy] = useState(false)
  const [justCopiedId, setJustCopiedId] = useState<string | null>(null)
  // The most recently minted link — surfaced prominently so the user sees
  // what to copy without scrolling the existing-links list.
  const [fresh, setFresh] = useState<ShareLink | null>(null)
  // Invite-by-email state.
  const invite = useSharesStore((s) => s.invite)
  const recipientsByEntity = useSharesStore((s) => s.recipientsByEntity)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  // The token an email invite attaches to: the freshly minted link, else the
  // most recent existing link for this entity. Invites need a live token.
  const inviteToken = fresh?.token ?? outgoing.find((s) => !s.revoked)?.token ?? null
  const entityRecipients = recipientsByEntity[entityId] ?? []

  async function handleInvite(): Promise<void> {
    const email = inviteEmail.trim().toLowerCase()
    if (!email.includes('@') || !inviteToken || inviteBusy) return
    setInviteBusy(true)
    setInviteMsg(null)
    try {
      const { emailDelivered } = await invite(inviteToken, email)
      setInviteEmail('')
      setInviteMsg(
        emailDelivered
          ? `Invite sent to ${email}.`
          : `${email} added — email will send once the mail provider is configured.`
      )
    } catch (err) {
      setInviteMsg((err as Error).message)
    } finally {
      setInviteBusy(false)
    }
  }

  // Refresh shares once on mount. Sidebar already loads them when the
  // app boots, so this is a "catch up if something else minted a link
  // outside the sidebar's lifecycle" guard. Using a ref-once guard so
  // the effect can't re-fire on parent re-renders (which was part of
  // the previous infinite-loop chain).
  const didRefreshRef = useRef(false)
  useEffect(() => {
    if (didRefreshRef.current) return
    didRefreshRef.current = true
    void refresh()
    // refresh is a stable Zustand action ref; we DON'T put it in deps
    // because we want this to fire exactly once per mount regardless of
    // any selector instability further up the tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc closes — stabilise onClose with a ref so the listener doesn't
  // re-bind on every parent re-render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function copyToClipboard(text: string, linkId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setJustCopiedId(linkId)
      setTimeout(() => setJustCopiedId((id) => (id === linkId ? null : id)), 1800)
    } catch {
      // Clipboard write failed (rare on Electron) — fall back to prompt.
      window.prompt('Copy this link manually:', text)
    }
  }

  async function handleCreate(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      // Build the snapshot — this is what the viewer page will render and
      // what the recipient sees. For a folder, walks descendants + each
      // task's widgets. For a task, pulls its widgets. For a widget, just
      // the widget itself. Tables get their schema + rows inlined.
      const fromHandle = generateAnonymousHandle()
      let snapshot: unknown = undefined
      try {
        if (kind === 'folder') {
          const nodes = useNodeStore.getState().nodes
          const node = nodes.find((n) => n.id === entityId)
          if (node) snapshot = await buildFolderSnapshot(node, nodes, fromHandle)
        } else if (kind === 'task') {
          const nodes = useNodeStore.getState().nodes
          const node = nodes.find((n) => n.id === entityId)
          if (node) snapshot = await buildTaskSnapshot(node, fromHandle)
        } else if (kind === 'widget') {
          const widgets = useWidgetStore.getState().widgets
          const widget = widgets.find((w) => w.id === entityId)
          if (widget) snapshot = await buildWidgetSnapshot(widget, fromHandle)
        }
      } catch {
        // Snapshot building failed (e.g. an IPC error fetching widgets).
        // We still mint the share record locally — the user gets a URL,
        // and the snapshot push to the server will simply be skipped.
        snapshot = undefined
      }
      const created = await createFor({
        kind,
        entityId,
        label,
        scope,
        snapshot,
        fromHandle
      })
      setFresh(created)
      // Auto-copy fresh links so the common path is one click → in
      // clipboard. The success animation on the chip confirms it landed.
      await copyToClipboard(viewerUrlFor(created.token), created.id)
    } finally {
      setBusy(false)
    }
  }

  const KIND_LABEL: Record<ShareableKind, string> = {
    folder: 'folder',
    task: 'task',
    widget: 'desk item',
    document: 'document'
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[260] bg-stone-900/40 backdrop-blur-[2px] flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-[460px] max-h-[80vh] rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
          <div className="h-8 w-8 rounded-full bg-accent/10 inline-flex items-center justify-center">
            <Icon name="share" size={16} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Share this {KIND_LABEL[kind]}
            </h2>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              {label || '(untitled)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded inline-flex items-center justify-center text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Close"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {/* Scope picker */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
              Permission
            </label>
            <div className="space-y-1.5">
              <button
                onClick={() => setScope('view')}
                className={`w-full text-left p-2.5 rounded-md border-2 flex items-start gap-2.5 transition-colors ${
                  scope === 'view'
                    ? 'border-accent bg-accent/[0.06]'
                    : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                }`}
              >
                <Icon
                  name="visibility"
                  size={16}
                  className={scope === 'view' ? 'text-accent mt-0.5 shrink-0' : 'text-stone-400 mt-0.5 shrink-0'}
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-medium ${scope === 'view' ? 'text-accent' : 'text-stone-800 dark:text-stone-100'}`}>
                    View only
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
                    Anyone with the link can see this {KIND_LABEL[kind]}. No sign-up needed to view.
                  </div>
                </div>
              </button>
              <button
                onClick={() => setScope('copy')}
                className={`w-full text-left p-2.5 rounded-md border-2 flex items-start gap-2.5 transition-colors ${
                  scope === 'copy'
                    ? 'border-accent bg-accent/[0.06]'
                    : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                }`}
              >
                <Icon
                  name="content_copy"
                  size={16}
                  className={scope === 'copy' ? 'text-accent mt-0.5 shrink-0' : 'text-stone-400 mt-0.5 shrink-0'}
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-medium ${scope === 'copy' ? 'text-accent' : 'text-stone-800 dark:text-stone-100'}`}>
                    View + add to their workspace
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
                    Recipient can sign up and it appears in their <strong>Shared with me</strong> sidebar — they can copy it into their own workspace.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Generate + freshly-minted link surface */}
          <button
            onClick={() => void handleCreate()}
            disabled={busy}
            className="w-full text-[13px] py-2 rounded-md bg-accent text-white hover:brightness-110 disabled:opacity-60 inline-flex items-center justify-center gap-1.5 font-medium"
          >
            {busy ? (
              <>
                <Icon name="autorenew" size={13} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Icon name="link" size={13} />
                Create link & copy
              </>
            )}
          </button>

          {fresh && (
            <div className="rounded-md border-2 border-accent bg-accent/[0.06] p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent font-semibold">
                <Icon name="check_circle" size={11} />
                Link ready{justCopiedId === fresh.id ? ' — copied!' : ''}
              </div>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-[11px] font-mono bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 truncate">
                  {viewerUrlFor(fresh.token)}
                </code>
                <button
                  onClick={() => void copyToClipboard(viewerUrlFor(fresh.token), fresh.id)}
                  className="text-[11px] px-2 py-1 rounded text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                  title="Copy link"
                >
                  <Icon name="content_copy" size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Invite by email — sends a link + lands the share in their inbox */}
          {inviteToken && (
            <div className="rounded-md border border-stone-200 dark:border-stone-700 p-2.5 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                Invite by email
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleInvite()
                  }}
                  placeholder="name@example.com"
                  data-testid="invite-email"
                  className="flex-1 text-[12px] px-2 py-1.5 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 outline-none focus:border-accent"
                />
                <button
                  onClick={() => void handleInvite()}
                  disabled={inviteBusy || !inviteEmail.includes('@')}
                  data-testid="invite-send"
                  className="text-[12px] px-2.5 py-1.5 rounded bg-accent text-white hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Icon name={inviteBusy ? 'autorenew' : 'send'} size={12} className={inviteBusy ? 'animate-spin' : ''} />
                  Invite
                </button>
              </div>
              {inviteMsg && (
                <div className="text-[11px] text-stone-500 dark:text-stone-400">{inviteMsg}</div>
              )}
              {entityRecipients.length > 0 && (
                <div className="space-y-0.5 pt-1 border-t border-stone-100 dark:border-stone-800">
                  {entityRecipients.map((r) => (
                    <div key={r.email} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-stone-700 dark:text-stone-200">
                        {(r.handle && r.handle.trim()) || r.email}
                      </span>
                      <span className={r.status === 'accepted' ? 'text-emerald-500' : 'text-stone-400'}>
                        {r.status === 'accepted' ? 'joined' : 'invited'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Existing links for this entity */}
          {outgoing.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
                Existing links ({outgoing.length})
              </label>
              <div className="space-y-1">
                {outgoing.map((link) => {
                  const url = viewerUrlFor(link.token)
                  return (
                    <div
                      key={link.id}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${
                        link.revoked
                          ? 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 opacity-60'
                          : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                      }`}
                    >
                      <Icon
                        name={link.scope === 'view' ? 'visibility' : 'content_copy'}
                        size={11}
                        className="text-stone-400 shrink-0"
                      />
                      <code className="flex-1 text-[10px] font-mono text-stone-600 dark:text-stone-400 truncate">
                        {url}
                      </code>
                      {link.revoked && (
                        <span className="text-[9px] uppercase tracking-wider text-red-500 dark:text-red-400">
                          revoked
                        </span>
                      )}
                      {!link.revoked && link.viewCount > 0 && (
                        <span className="text-[10px] text-stone-500 dark:text-stone-400 tabular-nums">
                          {link.viewCount} views
                        </span>
                      )}
                      {!link.revoked && (
                        <button
                          onClick={() => void copyToClipboard(url, link.id)}
                          className="icon-btn !h-5 !w-5"
                          title="Copy"
                        >
                          <Icon
                            name={justCopiedId === link.id ? 'check' : 'content_copy'}
                            size={11}
                          />
                        </button>
                      )}
                      {!link.revoked && (
                        <button
                          onClick={() => void revoke(link.id)}
                          className="icon-btn !h-5 !w-5"
                          title="Revoke — link stops working"
                        >
                          <Icon name="link_off" size={11} />
                        </button>
                      )}
                      <button
                        onClick={() => void remove(link.id)}
                        className="icon-btn !h-5 !w-5 hover:!text-red-700"
                        title="Delete this link"
                      >
                        <Icon name="delete" size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Honesty banner about local-mock mode */}
          <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed bg-stone-50 dark:bg-stone-800/50 p-2 rounded">
            <strong className="text-stone-700 dark:text-stone-200">v1 note:</strong>{' '}
            The link points to the future hosted viewer. The token is real and
            unique — once the PlexiDesk share service ships, the same link
            will resolve. For now you can share it manually with someone using
            PlexiDesk on the same network (they can paste it into{' '}
            <em>Sidebar → Shared with me → Paste a share link</em>).
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
