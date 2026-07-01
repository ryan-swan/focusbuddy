import { useEffect, useRef, useState } from 'react'
import { useOrgStore } from '../stores/org'
import { useAccountStore } from '../stores/account'
import { useViewStore } from '../stores/view'
import Icon from './Icon'

// The organisation switcher sits at the top of every area menu, just under the
// wordmark. It shows the active organisation and lets the user switch, which
// swaps the whole workspace (files, docs, tasks, apps) to that org's data. The
// "Personal" option is the user's own local-first space; the rest are the real
// server organisations the account has been invited to. Switching to an org you
// are not a member of is impossible because only invited orgs are listed.
export default function OrgSwitcher(): JSX.Element {
  const orgs = useOrgStore((s) => s.orgs)
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const load = useOrgStore((s) => s.load)
  const setActive = useOrgStore((s) => s.setActive)
  const goOrg = useViewStore((s) => s.goOrg)
  // Reload the org list whenever sign-in state changes, so a user who signs in
  // after launch sees the orgs they belong to appear.
  const token = useAccountStore((s) => s.sessionToken)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void load()
  }, [load, token])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0]

  return (
    <div ref={ref} className="relative px-2 pt-2" data-testid="org-switcher">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="org-switcher-button"
        className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-sunken)] hover:border-[rgb(var(--accent)/0.5)] text-left transition-colors"
      >
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-white shrink-0 ${
            active?.personal ? 'bg-slate-500' : 'bg-indigo-500'
          }`}
        >
          <Icon name={active?.personal ? 'person' : 'apartment'} size={14} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[9px] uppercase tracking-[0.12em] text-[var(--ink-40)] leading-none">
            Organisation
          </span>
          <span className="block text-[13px] font-medium truncate text-[var(--ink-90)]">
            {active?.name ?? 'Personal'}
          </span>
        </span>
        <Icon name="unfold_more" size={16} className="text-[var(--ink-40)] shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-2 right-2 mt-1 z-30 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg py-1"
          data-testid="org-switcher-menu"
        >
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                void setActive(o.id)
                setOpen(false)
              }}
              data-testid={`org-option-${o.id}`}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] text-left hover:bg-[var(--surface-sunken)]"
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded text-white shrink-0 ${
                  o.personal ? 'bg-slate-500' : 'bg-indigo-500'
                }`}
              >
                <Icon name={o.personal ? 'person' : 'apartment'} size={12} />
              </span>
              <span className="flex-1 min-w-0 truncate text-[var(--ink-90)]">{o.name}</span>
              {o.id === activeOrgId && (
                <Icon name="check" size={15} className="text-[rgb(var(--accent))] shrink-0" />
              )}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--edge-soft)]" />
          <button
            onClick={() => {
              goOrg()
              setOpen(false)
            }}
            data-testid="org-switcher-manage"
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] text-left hover:bg-[var(--surface-sunken)] text-[var(--ink-70)]"
          >
            <span className="inline-flex items-center justify-center w-5 h-5 shrink-0">
              <Icon name="settings" size={14} />
            </span>
            <span>Manage &amp; invite people</span>
          </button>
        </div>
      )}
    </div>
  )
}
