import { useState } from 'react'
import type { ShareRecipientDto } from '../lib/shareService'

// A row of recipient avatars for a folder/task the owner has shared with named
// people (via email invite). Shows up to 5 overlapping initial-avatars with a
// "+N" overflow chip, and on hover a small panel listing everyone's name and
// whether they've accepted yet. No real profile photos in the system, so the
// avatar is a deterministic initial — same visual language as SharedBadge.

const PALETTE = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#a855f7']

function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function nameOf(r: ShareRecipientDto): string {
  return (r.handle && r.handle.trim()) || r.email.split('@')[0] || r.email
}

const MAX = 5

export default function SharedRecipientBadges({
  recipients
}: {
  recipients: ShareRecipientDto[]
}): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!recipients.length) return null
  const shown = recipients.slice(0, MAX)
  const overflow = recipients.length - shown.length

  return (
    <span
      className="relative inline-flex items-center shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      data-testid="shared-recipient-badges"
    >
      <span className="flex -space-x-1.5">
        {shown.map((r, i) => {
          const n = nameOf(r)
          return (
            <span
              key={r.email}
              className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[8px] font-semibold text-white ring-1 ring-stone-900 dark:ring-stone-900 ${
                r.status === 'invited' ? 'opacity-60' : ''
              }`}
              style={{ backgroundColor: colorFor(n), zIndex: MAX - i }}
            >
              {n[0].toUpperCase()}
            </span>
          )
        })}
        {overflow > 0 && (
          <span
            className="inline-flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full text-[8px] font-semibold text-stone-200 bg-stone-600 ring-1 ring-stone-900"
            style={{ zIndex: 0 }}
          >
            +{overflow}
          </span>
        )}
      </span>

      {open && (
        <span
          className="absolute left-0 top-5 z-[60] min-w-[160px] max-w-[240px] rounded-lg bg-stone-900 border border-stone-700 shadow-xl p-2 text-[11px] text-stone-200"
          data-testid="shared-recipient-tooltip"
        >
          <div className="text-[9px] uppercase tracking-wider text-stone-500 mb-1">
            Shared with {recipients.length}
          </div>
          <div className="space-y-0.5 max-h-44 overflow-auto">
            {recipients.map((r) => (
              <div key={r.email} className="flex items-center justify-between gap-2">
                <span className="truncate">{nameOf(r)}</span>
                <span
                  className={`text-[9px] shrink-0 ${
                    r.status === 'accepted' ? 'text-emerald-400' : 'text-stone-500'
                  }`}
                >
                  {r.status === 'accepted' ? 'joined' : 'invited'}
                </span>
              </div>
            ))}
          </div>
        </span>
      )}
    </span>
  )
}
