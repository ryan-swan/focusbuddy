// Organisation section of the Settings panel. This used to be a standalone
// "Organization" row in the sidebar; it now lives here alongside the account
// settings. It shows the user's current organisation compactly from the real
// org API (listOrgs), and a button that opens the full OrgAdminView for
// managing members, roles, offices and hours. No org data is fabricated: when
// there is no session or no non-personal org, an honest empty state is shown.

import { useEffect, useState } from 'react'
import { useAccountStore } from '../../stores/account'
import { listOrgs, type OrgMembership } from '../../lib/orgsClient'
import Icon from '../Icon'

interface Props {
  // Opens the full organisation admin view and closes the settings popover.
  onManage: () => void
}

export default function OrganisationSection({ onManage }: Props): JSX.Element {
  const token = useAccountStore((s) => s.sessionToken)
  const [orgs, setOrgs] = useState<OrgMembership[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setOrgs([])
      setError(null)
      return
    }
    setOrgs(null)
    setError(null)
    listOrgs(token)
      .then((list) => {
        if (!cancelled) setOrgs(list)
      })
      .catch(() => {
        if (!cancelled) {
          setOrgs([])
          setError('Could not load your organisation right now.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // The organisation we surface is the first non-personal org the user belongs
  // to. A personal org is the private default workspace, not a company, so it
  // does not count as "being part of an organisation".
  const org = orgs?.find((o) => !o.personal) ?? null

  return (
    <div
      className="px-3 py-3 border-t border-[var(--edge-soft)] space-y-3"
      data-testid="settings-section-organisation"
    >
      <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-medium">
        Organisation
      </div>

      {orgs === null ? (
        <p className="text-[11px] text-[var(--ink-50)]">Loading your organisation…</p>
      ) : org ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-md inline-flex items-center justify-center bg-accent/15 text-accent shrink-0">
              <Icon name="apartment" size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[12px] font-medium text-[var(--ink-100)] truncate"
                data-testid="settings-org-name"
              >
                {org.name}
              </div>
              <div className="text-[11px] text-[var(--ink-50)] truncate">
                {org.memberCount} member{org.memberCount === 1 ? '' : 's'}
                <span className="mx-1.5 text-[var(--ink-40)]">·</span>
                <span className="capitalize">{org.role}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onManage}
            data-testid="settings-org-manage"
            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] border border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent hover:text-accent transition-colors"
          >
            <Icon name="settings" size={13} />
            Manage organisation
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[11px] text-[var(--ink-70)] leading-relaxed">
            {error ?? 'You are not part of an organisation yet.'}
          </p>
          <button
            onClick={onManage}
            data-testid="settings-org-manage"
            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] border border-[var(--edge-soft)] text-[var(--ink-70)] hover:border-accent hover:text-accent transition-colors"
          >
            <Icon name="apartment" size={13} />
            Manage organisation
          </button>
        </div>
      )}
    </div>
  )
}
