import { useEffect, useState } from 'react'
import Icon from './Icon'
import {
  getDeskAccess,
  shareDeskLive,
  revokeDeskAccess,
  revokeDeskInvite,
  type DeskAccess
} from '../lib/deskShareClient'

// Live sharing for a desk (a folder or task node). Unlike the read-only link below
// it, this grants named people bidirectional near-live access: their edits and the
// owner's flow both ways within a second or two. Access rides a per-desk ACL grant,
// so only the people listed here can reach it — never a whole org. Add someone by
// email; they get access the moment they sign in with that address.
export default function LiveDeskSharing({ rootId }: { rootId: string }): JSX.Element {
  const [access, setAccess] = useState<DeskAccess | null>(null)
  const [email, setEmail] = useState('')
  const [perm, setPerm] = useState<'view' | 'edit'>('edit')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getDeskAccess(rootId).then((a) => {
      if (!cancelled) setAccess(a)
    })
    return () => {
      cancelled = true
    }
  }, [rootId])

  async function add(): Promise<void> {
    const e = email.trim().toLowerCase()
    if (!e.includes('@') || busy) return
    setBusy(true)
    setMsg(null)
    const r = await shareDeskLive(rootId, [{ email: e, permission: perm }], perm)
    if (r.ok && r.access) {
      setAccess(r.access)
      setEmail('')
      const invited = r.access.pending.some((p) => p.email === e)
      setMsg(
        invited
          ? `${e} invited — they get live access the moment they sign in with that email.`
          : `${e} now has live access to this desk.`
      )
    } else {
      setMsg(r.error || 'Could not share the desk.')
    }
    setBusy(false)
  }

  // The owner is implicit (they always have manage), so hide them from the list.
  const grants = (access?.grants ?? []).filter((g) => g.accountId !== access?.owner)
  const pending = access?.pending ?? []
  const anyone = grants.length > 0 || pending.length > 0

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

      <div className="flex items-center gap-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="name@example.com"
          data-testid="livedesk-email"
          className="flex-1 text-[12px] px-2 py-1.5 rounded border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-90)] outline-none focus:border-accent"
        />
        <select
          value={perm}
          onChange={(e) => setPerm(e.target.value as 'view' | 'edit')}
          className="text-[12px] px-1.5 py-1.5 rounded border border-[var(--edge-soft)] bg-[var(--surface-raised)] text-[var(--ink-90)] outline-none"
          title="What this person can do"
        >
          <option value="edit">Can edit</option>
          <option value="view">View only</option>
        </select>
        <button
          onClick={() => void add()}
          disabled={busy || !email.includes('@')}
          data-testid="livedesk-add"
          className="text-[12px] px-2.5 py-1.5 rounded bg-accent text-white hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Icon name={busy ? 'autorenew' : 'person_add'} size={12} className={busy ? 'animate-spin' : ''} />
          Add
        </button>
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
