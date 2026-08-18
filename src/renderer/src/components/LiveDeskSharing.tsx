import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import {
  getDeskAccess,
  shareDeskLive,
  revokeDeskAccess,
  revokeDeskInvite,
  type DeskAccess,
  type DeskInvite
} from '../lib/deskShareClient'
import { usePeopleStore, personName, type DirectoryPerson } from '../lib/peopleDirectory'
import { useOrgStore, PERSONAL_ORG_ID } from '../stores/org'
import { useAccountStore } from '../stores/account'
import { inviteMember } from '../lib/orgsClient'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Live sharing for a desk (a folder or task node). Unlike the read-only link below
// it, this grants named people bidirectional near-live access. You pick a teammate
// from the organisation directory (so they are resolved to a real account, not a
// mistyped handle that silently never matches), or type an email to invite someone
// by address, and if their email is on a different domain you can add them to the
// organisation as a guest at the same time.
export default function LiveDeskSharing({
  rootId,
  roomRootId,
  roomTitle
}: {
  rootId: string
  // When the desk lives in a room, the room is offered so the sharer can grant
  // it too, letting the recipient open the desk in its room context.
  roomRootId?: string
  roomTitle?: string
}): JSX.Element {
  const [access, setAccess] = useState<DeskAccess | null>(null)
  const [query, setQuery] = useState('')
  const [perm, setPerm] = useState<'view' | 'edit'>('edit')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [shareRoom, setShareRoom] = useState(false)

  const people = usePeopleStore((s) => s.people)
  const loadPeople = usePeopleStore((s) => s.load)
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const orgName = useOrgStore((s) => s.orgs.find((o) => o.id === s.activeOrgId)?.name ?? 'your organisation')
  const hasOrg = !!activeOrgId && activeOrgId !== PERSONAL_ORG_ID

  useEffect(() => {
    let cancelled = false
    void getDeskAccess(rootId).then((a) => {
      if (!cancelled) setAccess(a)
    })
    return () => {
      cancelled = true
    }
  }, [rootId])

  // The directory drives the teammate shortlist. It loads quietly and empty.
  useEffect(() => {
    void loadPeople()
  }, [loadPeople, activeOrgId])

  const owner = access?.owner ?? null
  const grantedIds = useMemo(() => new Set((access?.grants ?? []).map((g) => g.accountId)), [access])
  const pendingEmails = useMemo(
    () => new Set((access?.pending ?? []).map((p) => p.email.toLowerCase())),
    [access]
  )

  const q = query.trim()
  const qLower = q.toLowerCase()
  const isEmail = EMAIL_RE.test(qLower)
  const myDomain = (useAccountStore.getState().account?.email ?? useAccountStore.getState().cachedEmail ?? '')
    .split('@')[1]
    ?.toLowerCase()
  const theirDomain = isEmail ? qLower.split('@')[1] : ''
  const differentDomain = !!myDomain && !!theirDomain && theirDomain !== myDomain

  // Teammate matches: by name or handle, excluding the owner and anyone already added.
  const matches = useMemo(() => {
    if (!q) return []
    return people
      .filter(
        (p) =>
          p.accountId !== owner &&
          !grantedIds.has(p.accountId) &&
          (personName(p).toLowerCase().includes(qLower) || p.handle.toLowerCase().includes(qLower))
      )
      .slice(0, 6)
  }, [people, q, qLower, owner, grantedIds])

  function finish(r: { ok: boolean; access?: DeskAccess | null; error?: string }, okMsg: string): void {
    if (r.ok && r.access) {
      setAccess(r.access)
      setQuery('')
      setMsg(okMsg)
    } else {
      setMsg(r.error || 'Could not share the desk.')
    }
    setBusy(false)
  }

  async function addInvite(invite: DeskInvite, okMsg: string): Promise<void> {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const r = await shareDeskLive(rootId, [{ ...invite, permission: perm }], perm)
    if (r.ok && shareRoom && roomRootId) {
      // Also grant the room so the recipient can open the desk in its room context.
      await shareDeskLive(roomRootId, [{ ...invite, permission: perm }], perm)
    }
    finish(r, shareRoom && roomRootId ? `${okMsg} Room "${roomTitle}" shared too.` : okMsg)
  }

  function addAccount(p: DirectoryPerson): void {
    void addInvite({ accountId: p.accountId }, `${personName(p)} now has live access to this desk.`)
  }

  function addEmail(email: string): void {
    void addInvite(
      { email },
      `${email} invited — they get live access the moment they sign in with that email.`
    )
  }

  async function addGuest(email: string): Promise<void> {
    if (busy || !hasOrg || !activeOrgId) return
    setBusy(true)
    setMsg(null)
    const token = useAccountStore.getState().sessionToken
    if (token) {
      const g = await inviteMember(token, activeOrgId, email, 'guest')
      if (!g.ok && g.error) {
        setMsg(g.error)
        setBusy(false)
        return
      }
      void loadPeople()
    }
    const r = await shareDeskLive(rootId, [{ email, permission: perm }], perm)
    if (r.ok && shareRoom && roomRootId) {
      await shareDeskLive(roomRootId, [{ email, permission: perm }], perm)
    }
    finish(
      r,
      `${email} added to ${orgName} as a guest and given live access.${shareRoom && roomRootId ? ` Room "${roomTitle}" shared too.` : ''}`
    )
  }

  const grants = (access?.grants ?? []).filter((g) => g.accountId !== owner)
  const pending = access?.pending ?? []
  const anyone = grants.length > 0 || pending.length > 0
  const alreadyPending = isEmail && pendingEmails.has(qLower)

  return (
    <div className="rounded-md border-2 border-accent/40 bg-accent/[0.04] p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-accent">
        <Icon name="bolt" size={12} />
        Live sharing (real-time)
      </div>
      <p className="text-[11px] text-[var(--ink-50)] leading-snug">
        Everyone you add here sees each other&apos;s changes to this desk as they happen. Only the people
        listed can open it.
      </p>

      {roomRootId && (
        <label className="flex items-start gap-2 text-[11px] text-[var(--ink-60)] cursor-pointer">
          <input
            type="checkbox"
            checked={shareRoom}
            onChange={(e) => setShareRoom(e.target.checked)}
            data-testid="livedesk-share-room"
            className="mt-0.5 accent-[rgb(var(--accent))]"
          />
          <span>
            Also share the room <span className="font-semibold text-[var(--ink-80)]">{roomTitle}</span> and
            everything in it, so they can open this desk in its room.
          </span>
        </label>
      )}

      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={hasOrg ? 'Add a teammate by name, or an email…' : 'Add someone by email…'}
            data-testid="livedesk-picker"
            className="w-full text-[12px] px-2 py-1.5 rounded border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-90)] outline-none focus:border-accent"
          />

          {q.length > 0 && (
            <div className="absolute z-20 mt-1 left-0 right-0 rounded-md border border-[var(--edge-firm)] bg-[var(--surface-raised)] shadow-lg overflow-hidden">
              {matches.map((p) => (
                <button
                  key={p.accountId}
                  onClick={() => addAccount(p)}
                  disabled={busy}
                  data-testid="livedesk-pick-member"
                  className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                >
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-accent/15 text-accent text-[10px] font-semibold shrink-0">
                    {(personName(p)[0] || '?').toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] text-[var(--ink-90)] truncate">{personName(p)}</span>
                    <span className="block text-[10px] text-[var(--ink-40)] truncate">
                      @{p.handle}
                      {p.role === 'guest' ? ' · guest' : ''}
                    </span>
                  </span>
                </button>
              ))}

              {isEmail && !alreadyPending && (
                <>
                  <button
                    onClick={() => addEmail(qLower)}
                    disabled={busy}
                    data-testid="livedesk-invite-email"
                    className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-sunken)] disabled:opacity-50 border-t border-[var(--edge-soft)]"
                  >
                    <Icon name="mail" size={14} className="text-[var(--ink-40)] shrink-0" />
                    <span className="text-[12px] text-[var(--ink-90)] truncate">
                      Share this desk with {qLower}
                    </span>
                  </button>
                  {hasOrg && differentDomain && (
                    <button
                      onClick={() => void addGuest(qLower)}
                      disabled={busy}
                      data-testid="livedesk-add-guest"
                      className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-sunken)] disabled:opacity-50 border-t border-[var(--edge-soft)]"
                    >
                      <Icon name="person_add" size={14} className="text-accent shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[12px] text-[var(--ink-90)] truncate">
                          Add to {orgName} as a guest
                        </span>
                        <span className="block text-[10px] text-[var(--ink-40)] truncate">
                          {qLower} is outside your domain, adding them lets you @mention them later
                        </span>
                      </span>
                    </button>
                  )}
                </>
              )}

              {matches.length === 0 && !isEmail && (
                <div className="px-2.5 py-1.5 text-[11px] text-[var(--ink-40)]">
                  {hasOrg ? 'No teammate by that name. Type a full email to invite someone.' : 'Type a full email to invite someone.'}
                </div>
              )}
              {alreadyPending && (
                <div className="px-2.5 py-1.5 text-[11px] text-[var(--ink-40)]">{qLower} is already invited.</div>
              )}
            </div>
          )}
        </div>

        <select
          value={perm}
          onChange={(e) => setPerm(e.target.value as 'view' | 'edit')}
          className="text-[12px] px-1.5 py-1.5 rounded border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-90)] outline-none shrink-0"
          title="What people you add can do"
        >
          <option value="edit">Can edit</option>
          <option value="view">View only</option>
        </select>
      </div>

      {msg && <div className="text-[11px] text-[var(--ink-50)]">{msg}</div>}

      {anyone && (
        <div className="space-y-0.5 pt-1 border-t border-[var(--edge-soft)]">
          {grants.map((g) => (
            <div key={g.accountId} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-[var(--ink-80)]">
                {g.name || g.handle || g.email || g.accountId}
                <span className="text-[var(--ink-40)]"> · {g.permission === 'view' ? 'view' : 'can edit'}</span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-emerald-500 text-[10px] uppercase tracking-wide">live</span>
                <button
                  onClick={() => void revokeDeskAccess(rootId, g.accountId).then((a) => a && setAccess(a))}
                  className="icon-btn !h-5 !w-5 hover:!text-red-600"
                  title="Remove access"
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.email} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-[var(--ink-70)]">{p.email}</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[var(--ink-40)] text-[10px] uppercase tracking-wide">invited</span>
                <button
                  onClick={() => void revokeDeskInvite(rootId, p.email).then((a) => a && setAccess(a))}
                  className="icon-btn !h-5 !w-5 hover:!text-red-600"
                  title="Cancel invite"
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
