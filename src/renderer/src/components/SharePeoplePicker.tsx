import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Icon from './Icon'
import { usePeopleStore, personName, type DirectoryPerson } from '../lib/peopleDirectory'
import { useOrgStore, PERSONAL_ORG_ID } from '../stores/org'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// One person (or typed email) staged to be shared with.
export interface SharePick {
  accountId?: string
  email?: string
  handle?: string
  name: string
}

interface Props {
  // Already-shared principals, hidden from the browse list.
  excludeAccountIds?: Set<string>
  excludeEmails?: Set<string>
  perm: 'view' | 'edit'
  onPermChange: (p: 'view' | 'edit') => void
  busy?: boolean
  // Share everyone staged. Return ok to clear the staging.
  onShare: (picks: SharePick[]) => Promise<{ ok: boolean; error?: string }>
  // Extra control shown above the Share button (e.g. a "share the room too" box).
  footer?: ReactNode
  msg?: string | null
}

// A reusable people picker for sharing. It browses the organisation directory,
// narrows as you type (by name, @handle or email), lets you stage MULTIPLE people
// (and typed email invites) as chips, and shares them all at once. Used for desks,
// rooms and office files; the caller supplies the actual share action.
export default function SharePeoplePicker({
  excludeAccountIds,
  excludeEmails,
  perm,
  onPermChange,
  busy,
  onShare,
  footer,
  msg
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [picks, setPicks] = useState<SharePick[]>([])

  const people = usePeopleStore((s) => s.people)
  const loadPeople = usePeopleStore((s) => s.load)
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const hasOrg = !!activeOrgId && activeOrgId !== PERSONAL_ORG_ID

  useEffect(() => {
    void loadPeople()
  }, [loadPeople, activeOrgId])

  const q = query.trim()
  const qLower = q.toLowerCase()
  const isEmail = EMAIL_RE.test(qLower)
  const pickedIds = useMemo(() => new Set(picks.map((p) => p.accountId).filter(Boolean) as string[]), [picks])
  const pickedEmails = useMemo(
    () => new Set(picks.map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]),
    [picks]
  )

  // Browsable list that narrows on the query, matching name, handle or email.
  const matches = useMemo(() => {
    return people
      .filter((p) => {
        if (excludeAccountIds?.has(p.accountId)) return false
        if (pickedIds.has(p.accountId)) return false
        if (!q) return true
        const hay = `${personName(p)} ${p.handle} ${p.email ?? ''}`.toLowerCase()
        return hay.includes(qLower)
      })
      .slice(0, 8)
  }, [people, q, qLower, excludeAccountIds, pickedIds])

  const canInviteEmail =
    isEmail &&
    !pickedEmails.has(qLower) &&
    !excludeEmails?.has(qLower) &&
    !people.some((p) => (p.email ?? '').toLowerCase() === qLower)

  function addPick(p: SharePick): void {
    setPicks((cur) => [...cur, p])
    setQuery('')
  }
  function removePick(i: number): void {
    setPicks((cur) => cur.filter((_, idx) => idx !== i))
  }

  async function share(): Promise<void> {
    if (!picks.length || busy) return
    const r = await onShare(picks)
    if (r.ok) setPicks([])
  }

  return (
    <div className="space-y-2">
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="share-picker-chips">
          {picks.map((p, i) => (
            <span
              key={`${p.accountId ?? p.email ?? i}`}
              className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-[rgb(var(--accent))] text-[11px] px-2 py-0.5"
            >
              {p.name}
              <button onClick={() => removePick(i)} className="hover:text-red-600" aria-label={`Remove ${p.name}`}>
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={hasOrg ? 'Search people by name, @handle or email…' : 'Add someone by email…'}
        data-testid="share-picker-search"
        className="w-full text-[12px] px-2 py-1.5 rounded border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-90)] outline-none focus:border-accent"
      />

      <div className="max-h-40 overflow-auto rounded border border-[var(--edge-soft)] divide-y divide-[var(--edge-soft)]/60">
        {matches.map((p: DirectoryPerson) => (
          <button
            key={p.accountId}
            onClick={() => addPick({ accountId: p.accountId, handle: p.handle, email: p.email ?? undefined, name: personName(p) })}
            disabled={busy}
            data-testid="share-picker-member"
            className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-accent/15 text-[rgb(var(--accent))] text-[10px] font-semibold shrink-0">
              {(personName(p)[0] || '?').toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] text-[var(--ink-90)] truncate">
                {personName(p)} <span className="text-[var(--ink-40)]">@{p.handle}</span>
              </span>
              <span className="block text-[10px] text-[var(--ink-40)] truncate">
                {p.email ?? 'no email on file'}
                {p.role === 'guest' ? ' · guest' : ''}
              </span>
            </span>
          </button>
        ))}
        {canInviteEmail && (
          <button
            onClick={() => addPick({ email: qLower, name: qLower })}
            disabled={busy}
            data-testid="share-picker-invite-email"
            className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <Icon name="mail" size={14} className="text-[var(--ink-40)] shrink-0" />
            <span className="text-[12px] text-[var(--ink-90)] truncate">Invite {qLower}</span>
          </button>
        )}
        {matches.length === 0 && !canInviteEmail && (
          <div className="px-2.5 py-2 text-[11px] text-[var(--ink-40)]">
            {q ? 'No matches. Type a full email to invite someone.' : hasOrg ? 'No one else to add.' : 'Type an email to invite someone.'}
          </div>
        )}
      </div>

      {footer}

      <div className="flex items-center gap-1.5">
        <select
          value={perm}
          onChange={(e) => onPermChange(e.target.value as 'view' | 'edit')}
          className="text-[12px] px-1.5 py-1.5 rounded border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-90)] outline-none shrink-0"
          title="What the people you add can do"
        >
          <option value="edit">Can edit</option>
          <option value="view">View only</option>
        </select>
        <button
          onClick={() => void share()}
          disabled={busy || picks.length === 0}
          data-testid="share-picker-submit"
          className="flex-1 text-[12px] px-2.5 py-1.5 rounded bg-accent text-white hover:brightness-110 disabled:opacity-50 inline-flex items-center justify-center gap-1"
        >
          <Icon name={busy ? 'autorenew' : 'group_add'} size={13} className={busy ? 'animate-spin' : ''} />
          {picks.length > 1 ? `Share with ${picks.length} people` : picks.length === 1 ? 'Share with 1 person' : 'Share'}
        </button>
      </div>

      {msg && <div className="text-[11px] text-[var(--ink-50)]">{msg}</div>}
    </div>
  )
}
