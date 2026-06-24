import { useCallback, useEffect, useState } from 'react'
import Icon from '../Icon'
import { useAccountStore } from '../../stores/account'
import {
  listOrgs,
  getOrg,
  createOrg,
  renameOrg,
  inviteMember,
  setMemberRole,
  removeMember,
  revokeInvite,
  type OrgMembership,
  type OrgDetail,
  type OrgRole
} from '../../lib/orgsClient'

// The customer-facing organization admin console: switch between the orgs you
// belong to, manage members and their roles, invite people by email, and revoke
// pending invites. The server enforces every role guard; the UI surfaces its
// errors. SSO (via WorkOS) plugs in here later without changing this surface.

const ROLE_OPTIONS: OrgRole[] = ['owner', 'admin', 'member', 'guest']

export default function OrgAdminView(): JSX.Element {
  const token = useAccountStore((s) => s.sessionToken)
  const myId = useAccountStore((s) => s.account?.id ?? null)
  const [orgs, setOrgs] = useState<OrgMembership[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('member')
  const [newOrg, setNewOrg] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refreshOrgs = useCallback(async () => {
    if (!token) return
    const list = await listOrgs(token)
    setOrgs(list)
    setSelId((prev) => prev ?? list.find((o) => !o.personal)?.id ?? list[0]?.id ?? null)
  }, [token])

  const refreshDetail = useCallback(async () => {
    if (!token || !selId) {
      setDetail(null)
      return
    }
    setDetail(await getOrg(token, selId))
  }, [token, selId])

  useEffect(() => {
    void refreshOrgs()
  }, [refreshOrgs])
  useEffect(() => {
    void refreshDetail()
  }, [refreshDetail])

  const canAdmin = detail?.role === 'owner' || detail?.role === 'admin'

  async function doCreate(): Promise<void> {
    if (!token || !newOrg.trim()) return
    const org = await createOrg(token, newOrg.trim())
    setNewOrg('')
    if (org) {
      await refreshOrgs()
      setSelId(org.id)
    }
  }
  async function doRename(name: string): Promise<void> {
    if (!token || !selId) return
    await renameOrg(token, selId, name)
    void refreshOrgs()
  }
  async function doInvite(): Promise<void> {
    if (!token || !selId || !inviteEmail.includes('@')) return
    const res = await inviteMember(token, selId, inviteEmail.trim(), inviteRole)
    setMsg(res.ok ? (res.added ? 'Added to the organization.' : 'Invite sent — they join when they sign up.') : res.error ?? 'Could not invite.')
    if (res.ok) {
      setInviteEmail('')
      void refreshDetail()
    }
  }
  async function doRole(accountId: string, role: OrgRole): Promise<void> {
    if (!token || !selId) return
    const res = await setMemberRole(token, selId, accountId, role)
    if (!res.ok) setMsg(res.error ?? 'Could not change role.')
    void refreshDetail()
  }
  async function doRemove(accountId: string): Promise<void> {
    if (!token || !selId) return
    const res = await removeMember(token, selId, accountId)
    if (!res.ok) setMsg(res.error ?? 'Could not remove.')
    void refreshDetail()
    if (accountId === myId) void refreshOrgs()
  }
  async function doRevoke(inviteId: string): Promise<void> {
    if (!token || !selId) return
    await revokeInvite(token, selId, inviteId)
    void refreshDetail()
  }

  return (
    <div className="h-full overflow-auto desk-paper no-tod p-6" data-testid="org-admin">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center gap-2 mb-4">
          <Icon name="apartment" size={20} className="text-accent" />
          <h1 className="text-[18px] font-semibold">Organizations</h1>
        </header>

        {/* Org switcher + create */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelId(o.id)}
              data-testid={`org-pick-${o.id}`}
              className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border ${o.id === selId ? 'border-accent text-accent bg-accent/[0.06]' : 'border-stone-200 dark:border-stone-700 hover:border-accent'}`}
            >
              <Icon name={o.personal ? 'person' : 'apartment'} size={13} />
              {o.name}
              <span className="text-[10px] text-stone-400">{o.role}</span>
            </button>
          ))}
          <span className="inline-flex items-center gap-1 ml-1">
            <input
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doCreate()
              }}
              placeholder="New organization…"
              data-testid="org-new-name"
              className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent w-40"
            />
            <button onClick={() => void doCreate()} disabled={!newOrg.trim()} className="icon-btn disabled:opacity-40" title="Create" data-testid="org-create">
              <Icon name="add" size={15} />
            </button>
          </span>
        </div>

        {msg && <div className="mb-3 text-[12px] text-stone-500 dark:text-stone-400">{msg}</div>}

        {detail && (
          <div className="rounded-xl border border-stone-200 dark:border-stone-700 p-4">
            <div className="flex items-center gap-2 mb-3">
              {canAdmin && !detail.org.personal ? (
                <input
                  defaultValue={detail.org.name}
                  onBlur={(e) => void doRename(e.target.value)}
                  className="text-[15px] font-semibold bg-transparent border-b border-transparent hover:border-stone-300 focus:border-accent focus:outline-none"
                  data-testid="org-rename"
                />
              ) : (
                <span className="text-[15px] font-semibold">{detail.org.name}</span>
              )}
              <span className="text-[11px] text-stone-400">you are {detail.role}</span>
            </div>

            {/* Members */}
            <div className="space-y-1">
              {detail.members.map((m) => (
                <div key={m.accountId} className="flex items-center gap-2 py-1" data-testid={`org-member-${m.accountId}`}>
                  <span className="text-[13px] text-stone-800 dark:text-stone-100 flex-1 truncate">
                    {m.handle}
                    {m.accountId === myId && <span className="text-[11px] text-stone-400"> (you)</span>}
                  </span>
                  {canAdmin ? (
                    <select
                      value={m.role}
                      onChange={(e) => void doRole(m.accountId, e.target.value as OrgRole)}
                      data-testid={`org-role-${m.accountId}`}
                      className="text-[12px] bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-0.5 focus:outline-none"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[12px] text-stone-500">{m.role}</span>
                  )}
                  {(canAdmin || m.accountId === myId) && (
                    <button onClick={() => void doRemove(m.accountId)} className="icon-btn" title={m.accountId === myId ? 'Leave' : 'Remove'} data-testid={`org-remove-${m.accountId}`}>
                      <Icon name={m.accountId === myId ? 'logout' : 'person_remove'} size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Pending invites */}
            {detail.invites.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800">
                <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1">Pending invites</div>
                {detail.invites.map((iv) => (
                  <div key={iv.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                    <Icon name="mail" size={13} className="text-stone-400" />
                    <span className="flex-1 truncate text-stone-600 dark:text-stone-300">{iv.email}</span>
                    <span className="text-[11px] text-stone-400">{iv.role}</span>
                    {canAdmin && (
                      <button onClick={() => void doRevoke(iv.id)} className="icon-btn" title="Revoke">
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Invite */}
            {canAdmin && (
              <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center gap-1.5">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void doInvite()
                  }}
                  placeholder="Invite by email…"
                  data-testid="org-invite-email"
                  className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-[12px] focus:outline-none focus:border-accent"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                  className="text-[12px] bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-1 focus:outline-none"
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                  <option value="guest">guest</option>
                </select>
                <button onClick={() => void doInvite()} disabled={!inviteEmail.includes('@')} className="btn-primary text-[12px] px-2.5 py-1 disabled:opacity-50" data-testid="org-invite-send">
                  Invite
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
