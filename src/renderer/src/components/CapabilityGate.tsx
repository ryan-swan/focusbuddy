import type { ReactNode } from 'react'
import { useEntitlement } from '../lib/entitlementReason'
import Icon from './Icon'

// The single enforcement point for feature surfaces. Wraps a view and, when the
// user is not entitled to it (by tier, org or per-user config resolved on the
// server), renders a reason-aware panel instead of the feature. Because every
// surface routes through MainPane, gating here covers every way in: the sidebar,
// Cmd-K, a deep link, or a programmatic navigation.
//
// The reason follows the same rule as the app switcher: an admin restriction
// ('user' source) shows no upsell, a licensing gap offers an upgrade to those
// who can act on it.
export default function CapabilityGate({
  capabilityKey,
  label,
  children
}: {
  capabilityKey: string
  label: string
  children: ReactNode
}): JSX.Element {
  const ent = useEntitlement(capabilityKey, label)
  if (ent.enabled) return <>{children}</>
  return (
    <div
      className="h-full w-full flex items-center justify-center p-8 bg-[var(--surface-base)]"
      data-testid="capability-gate"
      data-capability={capabilityKey}
    >
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl inline-flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--ink-40)]">
          <Icon name="lock" size={22} />
        </div>
        <h2 className="text-[15px] font-semibold text-[var(--ink-100)]">{label} is not available</h2>
        <p className="mt-1.5 text-[12.5px] text-[var(--ink-60)] leading-relaxed">{ent.reason}</p>
        {!ent.restricted && ent.canUpgrade && (
          <button
            onClick={ent.onLockedClick}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-white"
            data-testid="capability-gate-upgrade"
          >
            <Icon name="upgrade" size={14} /> See plans
          </button>
        )}
      </div>
    </div>
  )
}
