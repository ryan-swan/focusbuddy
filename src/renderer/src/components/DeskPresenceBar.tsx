import { useMemo, useState } from 'react'
import { usePresenceStore } from '../stores/presence'
import { useMessagingStore } from '../stores/messaging'
import { useAccountStore } from '../stores/account'
import { useCapabilityEnabled } from '../stores/capabilities'
import { presenceColor } from '../lib/presence'
import { personDisplayName, personInitials } from '../lib/personName'
import Icon from './Icon'

// PlexiChat 2100 desk collaboration presence. Shows who else is on THIS desk right
// now (an avatar per teammate whose live presence location is this desk, with
// their status and what they are working on), plus who is invited to the desk's
// channel but not currently here. Reads only from the presence + messaging stores
// (real data, gated by the server's visibility rule), never fabricated.

const RING: Record<string, string> = {
  online: 'ring-emerald-400',
  focus: 'ring-violet-400',
  busy: 'ring-rose-400',
  away: 'ring-amber-400',
  offline: 'ring-stone-400'
}

export default function DeskPresenceBar({ taskId }: { taskId: string }): JSX.Element | null {
  const peers = usePresenceStore((s) => s.peers)
  const conversations = useMessagingStore((s) => s.conversations)
  const myId = useAccountStore((s) => s.account?.id ?? null)
  // Live presence is Team-tier only; free/pro never see the desk who-is-here bar
  // (and the server refuses their presence join).
  const presenceEnabled = useCapabilityEnabled('presence')
  const [showInvited, setShowInvited] = useState(false)

  // Everyone whose live presence location is this desk (self is excluded by the
  // server from peers).
  const present = useMemo(
    () => Object.values(peers).filter((p) => p.location?.kind === 'desk' && p.location.id === taskId),
    [peers, taskId]
  )

  // The desk's channel members, for the "invited but not here" set.
  const deskConv = useMemo(
    () => conversations.find((c) => c.objectKind === 'desk' && c.objectId === taskId) ?? null,
    [conversations, taskId]
  )
  const invited = useMemo(() => {
    const presentIds = new Set(present.map((p) => p.accountId))
    return (deskConv?.members ?? []).filter(
      (m) => m.accountId !== myId && !presentIds.has(m.accountId)
    )
  }, [deskConv, present, myId])

  if (!presenceEnabled) return null
  if (present.length === 0 && invited.length === 0) return null

  const shownPresent = present.slice(0, 5)
  const extraPresent = present.length - shownPresent.length

  return (
    <div className="flex items-center gap-1.5 shrink-0" data-testid="desk-presence-bar">
      {present.length > 0 && (
        <div className="flex items-center -space-x-1.5" title="On this desk now">
          {shownPresent.map((p) => {
            const name = personDisplayName(p, p.handle)
            const detail = p.workingOn ? `${name} · ${p.workingOn}` : `${name} · ${p.status}`
            return (
              <span
                key={p.accountId}
                data-testid={`desk-present-${p.accountId}`}
                title={detail}
                className={`relative inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ${
                  RING[p.status] ?? RING.online
                }`}
                style={{ background: presenceColor(p.accountId) }}
              >
                {personInitials(p)}
              </span>
            )
          })}
          {extraPresent > 0 && (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[10px] font-semibold text-[var(--ink-70)] ring-2 ring-white dark:ring-stone-900">
              +{extraPresent}
            </span>
          )}
        </div>
      )}

      {invited.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowInvited((v) => !v)}
            title={`${invited.length} invited, not here now`}
            data-testid="desk-invited-button"
            className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-dashed border-[var(--edge-firm)] text-[10.5px] text-[var(--ink-50)] hover:text-[var(--ink-90)]"
          >
            <Icon name="group_add" size={12} /> {invited.length}
          </button>
          {showInvited && (
            <div
              className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-lg p-2"
              data-testid="desk-invited-popover"
            >
              <div className="text-[10.5px] uppercase tracking-wide text-[var(--ink-40)] mb-1">Invited, not here</div>
              <div className="max-h-40 overflow-auto space-y-0.5">
                {invited.map((m) => (
                  <div key={m.accountId} className="flex items-center gap-1.5 text-[12px] text-[var(--ink-80)] px-1 py-0.5">
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white shrink-0"
                      style={{ background: presenceColor(m.accountId) }}
                    >
                      {personInitials(m)}
                    </span>
                    <span className="truncate">{personDisplayName(m, m.handle ?? 'Member')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
