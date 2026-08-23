import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { useAutonomyStore } from '../../stores/autonomy'
import {
  AUTONOMY_LEVELS,
  autonomyLabel,
  autonomyDescription,
  type AutonomyLevel
} from '../../lib/autonomyPolicy'

// Settings → AI → Assistant autonomy. Lets the user choose how much an assistant
// may do on its own at the system level, shows the org ceiling honestly (and lets
// an admin set it), and previews the resolved effective level so the interaction
// between the two scopes is never a mystery. Per-assistant overrides are supported
// by the store; individual assistant surfaces expose them where relevant.

function LevelPicker({
  value,
  onPick,
  includeInherit,
  testid
}: {
  value: AutonomyLevel | undefined
  onPick: (v: AutonomyLevel | undefined) => void
  includeInherit?: boolean
  testid: string
}): JSX.Element {
  const options: Array<{ v: AutonomyLevel | undefined; label: string }> = [
    ...(includeInherit ? [{ v: undefined, label: 'Use org / default' }] : []),
    ...AUTONOMY_LEVELS.map((l) => ({ v: l as AutonomyLevel | undefined, label: autonomyLabel(l) }))
  ]
  return (
    <div className="grid grid-cols-1 gap-1.5" data-testid={testid}>
      {options.map((o) => {
        const active = value === o.v
        return (
          <button
            key={o.label}
            onClick={() => onPick(o.v)}
            data-testid={`${testid}-${o.v ?? 'inherit'}`}
            className={`text-left px-3 py-2 rounded-[var(--radius-field)] border text-[12px] transition-colors ${
              active
                ? 'border-accent bg-accent/10 text-[var(--ink-100)] fb-press'
                : 'border-[var(--edge-hairline)] bg-[var(--surface-raised)] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] fb-press'
            }`}
          >
            <div className="font-medium flex items-center gap-1.5">
              {active && <Icon name="check" size={13} className="text-accent" />}
              {o.label}
            </div>
            {o.v && <div className="fb-t-caption text-[var(--ink-50)] mt-0.5">{autonomyDescription(o.v)}</div>}
          </button>
        )
      })}
    </div>
  )
}

export default function AutonomySection(): JSX.Element {
  const store = useAutonomyStore()
  const [orgMsg, setOrgMsg] = useState<string | null>(null)

  useEffect(() => {
    void store.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resolved = store.resolveFor()

  async function saveOrg(next: { ceiling?: AutonomyLevel; default?: AutonomyLevel }): Promise<void> {
    setOrgMsg(null)
    const res = await store.setOrgPolicy({
      ceiling: next.ceiling ?? store.orgCeiling,
      default: next.default ?? store.orgDefault
    })
    if (!res.ok) setOrgMsg(res.forbidden ? 'Only an organisation admin can set this.' : 'Could not save the org policy.')
  }

  return (
    <div className="px-3 py-3 space-y-4" data-testid="autonomy-section">
      <div>
        <div className="text-[13px] font-semibold text-[var(--ink-90)] flex items-center gap-2">
          <Icon name="smart_toy" size={15} className="text-accent" />
          Assistant autonomy
        </div>
        <p className="text-[12px] text-[var(--ink-60)] mt-1 leading-relaxed">
          Decide how much your assistant may do on its own. Your organisation can set a ceiling that your
          choice cannot go above, and individual assistants can be tuned separately.
        </p>
      </div>

      {/* Effective level readout — makes the interaction of the scopes visible. */}
      <div className="rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-3" data-testid="autonomy-effective">
        <div className="fb-t-caption uppercase tracking-[0.14em] text-[var(--ink-50)] font-semibold">In effect now</div>
        <div className="text-[13px] text-[var(--ink-100)] mt-1 font-medium">{autonomyLabel(resolved.level)}</div>
        <div className="fb-t-caption text-[var(--ink-50)] mt-0.5">
          Set at the {resolved.source.replace('-', ' ')} level
          {resolved.cappedByOrg ? ', capped by your organisation.' : '.'}
        </div>
      </div>

      {/* System-wide choice (this user, all their assistants). */}
      <div>
        <div className="fb-t-caption text-[var(--ink-70)] mb-1.5 font-medium">Your default (all assistants)</div>
        <LevelPicker
          value={store.systemChoice}
          onPick={(v) => void store.setSystemChoice(v)}
          includeInherit
          testid="autonomy-system"
        />
      </div>

      {/* Organisation ceiling + default. */}
      {store.inSharedOrg ? (
        store.canEditOrg ? (
          <div>
            <div className="fb-t-caption text-[var(--ink-70)] mb-1.5 font-medium">
              Organisation ceiling (applies to everyone)
            </div>
            <p className="fb-t-caption text-[var(--ink-50)] mb-1.5">
              No member's assistant may exceed this level.
            </p>
            <LevelPicker
              value={store.orgCeiling}
              onPick={(v) => void saveOrg({ ceiling: v })}
              testid="autonomy-org-ceiling"
            />
            {orgMsg && <div className="fb-t-caption text-rose-500 mt-1.5">{orgMsg}</div>}
          </div>
        ) : (
          <div className="rounded-[var(--radius-field)] bg-[var(--surface-sunken)] p-3" data-testid="autonomy-org-readonly">
            <div className="fb-t-caption text-[var(--ink-70)] font-medium">Organisation policy</div>
            <div className="text-[12px] text-[var(--ink-60)] mt-1">
              {store.orgPolicyPresent
                ? `Your organisation caps autonomy at “${autonomyLabel(store.orgCeiling ?? 'auto')}”.`
                : 'Your organisation has not set an autonomy policy.'}
            </div>
          </div>
        )
      ) : (
        <div className="fb-t-caption text-[var(--ink-40)]">
          Join or switch to a shared organisation to see or set an organisation-wide policy.
        </div>
      )}
    </div>
  )
}
