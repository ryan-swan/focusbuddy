import { useCallback, useEffect, useState } from 'react'
import Icon from '../Icon'

// Settings → AI → Plexii on the web (A6/B4, R26). The reviewable middle of
// the consent posture: every site the user granted standing permission to
// act on, listed with when it was granted, revocable in one click. The
// explainer states the standing bans plainly — the same rules the bridge
// enforces in code — and where the money question is answered (the AI
// usage summary above; each run also shows its own cost in the panel).

interface Grant {
  host: string
  grantedAt: string
}

export default function BrowsingConsentSection(): JSX.Element {
  const [grants, setGrants] = useState<Grant[] | null>(null)

  const refresh = useCallback(async () => {
    try {
      setGrants(await window.api.browserAgent.listConsent())
    } catch {
      setGrants([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function revoke(host: string): Promise<void> {
    await window.api.browserAgent.revokeConsent(host)
    await refresh()
  }

  function dateLabel(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return ''
    }
  }

  return (
    <div className="px-3 py-3 border-t border-[var(--edge-hairline)]" data-testid="browsing-consent-section">
      <div className="fb-t-caption text-[var(--ink-70)] mb-1.5">Plexii on the web</div>
      <div className="text-[11.5px] leading-relaxed text-[var(--ink-70)] mb-2">
        Plexii can drive the in-app browser for you — step by step, visible, and stoppable. The
        first time it acts on a site, it asks. Sites you answered “Always allow” for are listed
        here. It never enters passwords or card details, never submits sign-in or payment forms,
        and never moves files — those parts are always yours. Each run shows its own cost in the
        panel; the total is in the AI usage summary above.
      </div>
      {grants === null ? null : grants.length === 0 ? (
        <div
          className="rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3 py-2 text-[11.5px] text-[var(--ink-50)]"
          data-testid="browsing-consent-empty"
        >
          No sites yet — Plexii asks the first time it acts somewhere.
        </div>
      ) : (
        <div className="space-y-1" data-testid="browsing-consent-list">
          {grants.map((g) => (
            <div
              key={g.host}
              className="flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3 py-1.5"
              data-testid={`browsing-consent-row-${g.host}`}
            >
              <Icon name="public" size={13} className="shrink-0 text-[var(--ink-50)]" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-90)]">{g.host}</span>
              <span className="shrink-0 text-[11px] text-[var(--ink-50)]">{dateLabel(g.grantedAt)}</span>
              <button
                className="btn-ghost !px-2 !py-0.5 !text-[11px]"
                data-testid={`browsing-consent-revoke-${g.host}`}
                onClick={() => void revoke(g.host)}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
