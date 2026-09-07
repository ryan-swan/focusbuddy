import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { statusForWorkItemState } from '@shared/workItems'

// DEC-050 — the status control every project tool has: the item's state as a
// coloured pill you can press to change, right on the row. No modal, no
// editor round-trip.
//
// The offered set is deliberately small and honest: the four states an item
// can HONESTLY sit in while it is open (plus delegated, which is a real
// hand-off), and the queue's OWN closing verb — a Meet item schedules, a
// Decide item decides. The full state machine still lives behind the editor;
// this is the everyday subset.

export interface StatusChoice {
  state: string
  label: string
}

export const OPEN_STATUS_CHOICES: StatusChoice[] = [
  { state: 'open', label: 'Not started' },
  { state: 'in_progress', label: 'In progress' },
  { state: 'waiting', label: 'Waiting' },
  { state: 'blocked', label: 'Blocked' },
  { state: 'delegated', label: 'Delegated' }
]

/** Label for any state we may be handed, including terminal ones. */
export function statusLabel(state: string | null | undefined, closeLabel: string): string {
  const s = state ?? 'open'
  const known = OPEN_STATUS_CHOICES.find((c) => c.state === s)
  if (known) return known.label
  if (s === 'suggested') return 'Suggested'
  if (s === 'stale') return 'Stale'
  if (s === 'needs_review') return 'In review'
  if (s === 'needs_approval') return 'Needs approval'
  if (s === 'dismissed') return 'Dismissed'
  if (s === 'archived') return 'Archived'
  if (s === 'reclassified') return 'Superseded'
  // Every other terminal state IS the queue's own closing verb.
  return closeLabel
}

/** The pill's colour comes from the coarse projection, so a new state can
 *  never render as an unstyled blank. */
export function statusTone(state: string | null | undefined): { fg: string; bg: string } {
  switch (statusForWorkItemState(state ?? 'open')) {
    case 'in_progress':
      return { fg: '#0ea5e9', bg: 'rgba(14,165,233,0.14)' }
    case 'done':
      return { fg: '#10b981', bg: 'rgba(16,185,129,0.14)' }
    case 'parked':
      return { fg: '#94a3b8', bg: 'rgba(148,163,184,0.14)' }
    default:
      return state === 'waiting' || state === 'blocked'
        ? { fg: '#f59e0b', bg: 'rgba(245,158,11,0.14)' }
        : { fg: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
  }
}

export default function ItemStatusPill({
  state,
  closeChoice,
  onPick,
  disabled
}: {
  state: string | null | undefined
  /** The queue's own closing verb — offered as the last choice. */
  closeChoice: StatusChoice
  onPick: (state: string) => void
  disabled?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  // DEC-132 — the menu is portalled to <body> at the pill's own coordinates:
  // the lists it lives in scroll now (home tiles, the widget, the panel), and
  // an absolutely positioned menu near a list's bottom edge was clipped.
  const menu = useRef<HTMLDivElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!wrap.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const tone = statusTone(state)
  const choices = [...OPEN_STATUS_CHOICES, closeChoice]

  return (
    <div ref={wrap} className="relative shrink-0" data-row-action>
      <button
        onClick={(e) => {
          if (disabled) return
          const r = e.currentTarget.getBoundingClientRect()
          // Below the pill when there is room, above it when there is not —
          // a pill at the bottom of a scrolled list must not open off-screen.
          const est = (OPEN_STATUS_CHOICES.length + 1) * 30 + 10
          const top = r.bottom + 4 + est <= window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - 4 - est)
          setAnchor({ top, right: Math.max(8, window.innerWidth - r.right) })
          setOpen((v) => !v)
        }}
        disabled={disabled}
        title={disabled ? undefined : 'Change status'}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-full fb-t-label fb-press whitespace-nowrap max-w-[128px]"
        style={{ backgroundColor: tone.bg, color: tone.fg }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: tone.fg }}
        />
        <span className="truncate">{statusLabel(state, closeChoice.label)}</span>
        {!disabled && <Icon name="expand_more" size={12} />}
      </button>
      {open &&
        anchor &&
        createPortal(
        <div
          ref={menu}
          style={{ position: 'fixed', top: anchor.top, right: anchor.right }}
          className="z-[400] min-w-[168px] rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg py-1"
          data-testid="status-menu"
        >
          {choices.map((c) => {
            const t = statusTone(c.state)
            const on = (state ?? 'open') === c.state
            return (
              <button
                key={c.state}
                onClick={() => {
                  setOpen(false)
                  onPick(c.state)
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left fb-t-label fb-press ${
                  on ? 'bg-[var(--surface-sunken)]' : 'hover:bg-[var(--surface-sunken)]'
                }`}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.fg }} />
                <span className="flex-1 text-[var(--ink-80)]">{c.label}</span>
                {on && <Icon name="check" size={13} className="text-[var(--ink-40)]" />}
              </button>
            )
          })}
        </div>,
        document.body
        )}
    </div>
  )
}
